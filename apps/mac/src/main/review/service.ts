import { existsSync } from 'node:fs'
import { t } from '../i18n/index.js'
import { githubRepositoryFromRemote } from '../platform/githubAuth.js'
import { discoverProjectTasks } from '../projects/tasks.js'
import type { Project } from '../projects/types.js'
import type { AppSettings } from '../settings/types.js'
import { contextLines, extractSymbols, languageOf, parseUnifiedDiff } from './code.js'
import { git } from './command.js'
import { readCoverage } from './coverage.js'
import { pathInside, projectFiles, readRevisionText, readText } from './files.js'
import type { ReviewBaseline } from './git.js'
import { changesBetween, commitsSince, inferReviewBaseline, readCommits, snapshotWorktree } from './git.js'
import type { ReviewEvidence } from './evidence.js'
import { gh, pullRequests, pullRequestUrl } from './github.js'
import { buildFileTree } from './tree.js'
import type { ReviewActionResult, ReviewCommentInput, ReviewFile, ReviewFileRequest, ReviewSnapshot } from './types.js'

/** Assembles the listing and the file fetches. It owns neither a terminal's lifetime nor the DB. */
export class ReviewService {
  async inferBaseline(cwd: string, startedAt: string): Promise<ReviewBaseline> {
    return inferReviewBaseline(cwd, startedAt)
  }

  async snapshot(
    cwd: string,
    project: Project,
    settings: AppSettings,
    baseline: ReviewBaseline | null,
    evidence?: ReviewEvidence,
    localReady?: (snapshot: ReviewSnapshot) => void | Promise<void>
  ): Promise<ReviewSnapshot> {
    const [files, branchResult, origin, current] = await Promise.all([
      projectFiles(cwd),
      git(cwd, ['branch', '--show-current']),
      git(cwd, ['config', '--get', 'remote.origin.url']),
      baseline ? snapshotWorktree(cwd, true) : Promise.resolve(null)
    ])
    const commits = baseline && current?.head
      ? await commitsSince(cwd, baseline.baseHead, current.head)
      : []
    for (const commit of await readCommits(cwd, evidence?.commits ?? [])) {
      if (!commits.some(existing => existing.sha === commit.sha)) commits.push(commit)
    }
    commits.sort((a, b) => b.committedAt.localeCompare(a.committedAt))
    const changes = baseline?.baseTree && current
      ? await changesBetween(cwd, baseline.baseTree, current.tree)
      : []
    const [working, staged] = current && baseline?.baseTree
      ? await Promise.all([
        changesBetween(cwd, current.indexTree ?? current.headTree, current.tree),
        current.indexTree ? changesBetween(cwd, current.headTree, current.indexTree) : []
      ])
      : [[], []]
    const taskPaths = new Set(changes.flatMap((file) => [file.path, file.previousPath].filter(Boolean)))
    // A staged edit can be undone in the working file, leaving no net task diff. Keep both steps,
    // while still excluding untouched work that was already dirty when the task started.
    if (current && baseline?.baseTree && staged.some(file => !taskPaths.has(file.path))) {
      const dirtyAtStart = await changesBetween(cwd, baseline.baseHead ?? current.headTree, baseline.baseTree)
      const preexistingPaths = new Set(dirtyAtStart.flatMap(file => [file.path, file.previousPath].filter(Boolean)))
      for (const file of staged) {
        if (!preexistingPaths.has(file.path) && !preexistingPaths.has(file.previousPath)) {
          taskPaths.add(file.path)
          if (file.previousPath) taskPaths.add(file.previousPath)
        }
      }
    }
    const localChanges = working.filter(
      (file) => taskPaths.has(file.path) || (file.previousPath ? taskPaths.has(file.previousPath) : false)
    )
    const stagedChanges = staged.filter(
      (file) => taskPaths.has(file.path) || (file.previousPath ? taskPaths.has(file.previousPath) : false)
    )
    const remote = origin.code === 0 ? origin.stdout.trim() : ''
    const local: ReviewSnapshot = {
      cwd,
      branch: branchResult.stdout.trim() || 'detached',
      repository: remote ? githubRepositoryFromRemote(remote) : null,
      tree: buildFileTree(files.map((path) => ({ path }))),
      changes,
      localChanges,
      stagedChanges,
      revision: baseline?.baseTree && current ? { base: baseline.baseTree, head: current.tree } : null,
      localRevision: current
        ? { base: current.indexTree ?? current.headTree, head: current.tree }
        : null,
      stagedRevision: current?.indexTree
        ? { base: current.headTree, head: current.indexTree }
        : null,
      commits,
      pullRequests: [],
      coverage: readCoverage(cwd),
      projectTasks: discoverProjectTasks(cwd)
    }
    await localReady?.(local)
    const prs = await pullRequests(cwd, project, settings, baseline?.startedAt ?? null, evidence?.pullRequests)
    return { ...local, pullRequests: prs.items, pullRequestNotice: prs.notice }
  }

  /** Saved revisions must remain readable even after Git garbage-collects unreachable objects. */
  async retain(taskId: string, snapshot: ReviewSnapshot): Promise<void> {
    const prefix = `refs/quuu/results/${taskId.replace(/[^A-Za-z0-9._-]/g, '-')}`
    const refs = [
      ...(snapshot.revision ? [[`${prefix}/base`, snapshot.revision.base], [`${prefix}/tree`, snapshot.revision.head]] : []),
      ...(snapshot.localRevision ? [[`${prefix}/local-base`, snapshot.localRevision.base], [`${prefix}/local-tree`, snapshot.localRevision.head]] : []),
      ...(snapshot.stagedRevision ? [[`${prefix}/staged-base`, snapshot.stagedRevision.base], [`${prefix}/staged-tree`, snapshot.stagedRevision.head]] : []),
      ...snapshot.commits.map(commit => [`${prefix}/commits/${commit.sha}`, commit.sha])
    ]
    for (const [ref, sha] of refs) {
      const saved = await git(snapshot.cwd, ['update-ref', ref, sha])
      if (saved.code !== 0) throw new Error(saved.stderr.trim() || t('review.taskDiffRevisionUnreadable'))
    }
  }

  async file(
    cwd: string,
    project: Project,
    settings: AppSettings,
    request: ReviewFileRequest
  ): Promise<ReviewFile> {
    pathInside(cwd, request.path)
    if (request.previousPath) pathInside(cwd, request.previousPath)
    let content = ''
    let diffText = ''
    let binary = false
    let pullRequest: ReviewFile['pullRequest'] = null

    if (request.source === 'task') {
      // A value from IPC is not guaranteed by its type alone. A missing base is never substituted with HEAD.
      const revision = request.revision
      if (!revision || !/^[a-f0-9]{40}$/i.test(revision.base) || !/^[a-f0-9]{40}$/i.test(revision.head)) {
        throw new Error(t('review.taskDiffRevisionUnreadable'))
      }
      const paths = request.previousPath ? [request.previousPath, request.path] : [request.path]
      const [file, previous, diff] = await Promise.all([
        readRevisionText(cwd, revision.head, request.path),
        readRevisionText(cwd, revision.base, request.previousPath ?? request.path),
        git(cwd, ['diff', '--no-ext-diff', '--unified=4', '-M', revision.base, revision.head, '--', ...paths])
      ])
      if (diff.code !== 0) throw new Error(diff.stderr.trim() || t('review.taskDiffUnreadable'))
      const read = file ?? previous
      if (!read) throw new Error(t('review.fileMissingInRevision'))
      content = read.content
      binary = read.binary
      diffText = diff.stdout
    } else if (request.source === 'working') {
      const local = pathInside(cwd, request.path)
      if (existsSync(local)) {
        const read = readText(local)
        content = read.content
        binary = read.binary
      } else {
        const previous = await git(cwd, [
          'show',
          `HEAD:${request.previousPath ?? request.path}`
        ])
        content = previous.code === 0 ? previous.stdout : ''
      }
      const paths = request.previousPath
        ? [request.previousPath, request.path]
        : [request.path]
      const diff = await git(cwd, [
        'diff',
        '--no-ext-diff',
        '--unified=4',
        '-M',
        'HEAD',
        '--',
        ...paths
      ])
      diffText = diff.stdout
      if (!diffText && existsSync(local)) {
        const tracked = await git(cwd, ['ls-files', '--error-unmatch', '--', request.path])
        if (tracked.code !== 0) {
          diffText = content
            .split('\n')
            .map((line, index) => `${index === 0 ? '@@ -0,0 +1 @@\n' : ''}+${line}`)
            .join('\n')
        }
      }
    } else if (request.source === 'commit') {
      if (!request.ref || !/^[a-f0-9]{7,40}$/i.test(request.ref)) throw new Error(t('review.commitUnreadable'))
      const [file, previous, diff] = await Promise.all([
        git(cwd, ['show', `${request.ref}:${request.path}`]),
        git(cwd, ['show', `${request.ref}^:${request.previousPath ?? request.path}`]),
        git(cwd, [
          'show',
          '--format=',
          '--no-ext-diff',
          '--unified=4',
          '-M',
          request.ref,
          '--',
          ...(request.previousPath ? [request.previousPath] : []),
          request.path
        ])
      ])
      content = file.code === 0 ? file.stdout : previous.code === 0 ? previous.stdout : ''
      diffText = diff.stdout
    } else {
      const recorded = pullRequestUrl(request.ref ?? '')
      const number = recorded?.number ?? Number(request.ref)
      if (!Number.isInteger(number) || number <= 0) throw new Error(t('review.pullRequestUnreadable'))
      const repository = recorded?.repository ?? await this.repository(cwd)
      if (!repository) throw new Error(t('review.repositoryNotFound'))
      const detail = await gh(cwd, project, settings, [
        'pr',
        'view',
        recorded?.url ?? String(number),
        '--json',
        'headRefOid'
      ])
      if (detail.code !== 0) throw new Error(detail.stderr.trim() || t('review.pullRequestUnreadable'))
      const headSha = String((JSON.parse(detail.stdout) as { headRefOid?: string }).headRefOid ?? '')
      const [file, patches] = await Promise.all([
        gh(cwd, project, settings, [
          'api',
          '--method',
          'GET',
          `repos/${repository}/contents/${request.path.split('/').map(encodeURIComponent).join('/')}`,
          '-f',
          `ref=${headSha}`
        ]),
        gh(cwd, project, settings, [
          'api',
          '--method',
          'GET',
          '--paginate',
          '--slurp',
          `repos/${repository}/pulls/${String(number)}/files`,
          '-f',
          'per_page=100'
        ])
      ])
      if (file.code === 0) {
        const encoded = String((JSON.parse(file.stdout) as { content?: string }).content ?? '').replace(/\s/g, '')
        content = Buffer.from(encoded, 'base64').toString('utf8')
      }
      if (patches.code === 0) {
        const values = (JSON.parse(patches.stdout) as Array<Array<{ filename?: string; patch?: string }>>).flat()
        diffText = values.find((value) => value.filename === request.path)?.patch ?? ''
      }
      pullRequest = { number, headSha, ...(recorded ? { url: recorded.url } : {}) }
    }

    const diff = parseUnifiedDiff(diffText)
    return {
      source: request.source,
      path: request.path,
      language: languageOf(request.path),
      content,
      diff: diff.length > 0 ? diff : contextLines(content),
      symbols: extractSymbols(request.path, content),
      pullRequest,
      binary
    }
  }

  async comment(
    cwd: string,
    project: Project,
    settings: AppSettings,
    input: ReviewCommentInput
  ): Promise<ReviewActionResult> {
    const body = input.body.trim()
    if (!body) return { ok: false, reason: t('review.emptyComment') }
    if (!Number.isInteger(input.pullRequest) || input.pullRequest <= 0) {
      return { ok: false, reason: t('review.pullRequestUnselectable') }
    }
    if (!Number.isInteger(input.line) || input.line <= 0) return { ok: false, reason: t('review.lineUnselectable') }
    pathInside(cwd, input.path)
    if (!/^[a-f0-9]{40}$/i.test(input.headSha)) return { ok: false, reason: t('review.pullRequestRevisionUnreadable') }
    const recorded = input.pullRequestUrl ? pullRequestUrl(input.pullRequestUrl) : null
    if (input.pullRequestUrl && (!recorded || recorded.number !== input.pullRequest)) return { ok: false, reason: t('review.pullRequestUnreadable') }
    const repository = recorded?.repository ?? await this.repository(cwd)
    if (!repository) return { ok: false, reason: t('review.repositoryNotFound') }
    try {
      const result = await gh(cwd, project, settings, [
        'api',
        '--method',
        'POST',
        `repos/${repository}/pulls/${String(input.pullRequest)}/comments`,
        '-f',
        `body=${body}`,
        '-f',
        `commit_id=${input.headSha}`,
        '-f',
        `path=${input.path}`,
        '-F',
        `line=${String(input.line)}`,
        '-f',
        'side=RIGHT'
      ])
      return result.code === 0
        ? { ok: true }
        : { ok: false, reason: result.stderr.trim() || t('review.commentFailed') }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : t('review.commentFailed') }
    }
  }

  async repository(cwd: string): Promise<string | null> {
    const remote = await git(cwd, ['config', '--get', 'remote.origin.url'])
    return remote.code === 0 ? githubRepositoryFromRemote(remote.stdout.trim()) : null
  }

}
