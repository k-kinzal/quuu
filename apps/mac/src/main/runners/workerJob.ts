import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { adapterFor } from '../agent-adapters/registry.js'
import { writeGitHubHosts } from '../platform/githubAuthRuntime.mjs'
import { killProcessGroup } from '../platform/runProcess.js'
import { writeReportAssets } from '../report/assets.js'
import { reportPrompt } from '../report/prompt.js'
import { command } from '../review/command.js'
import { captureReviewBaseline, snapshotWorktree } from '../review/git.js'
import { ReviewService } from '../review/service.js'
import { DEFAULT_SETTINGS } from '../settings/types.js'
import { normalizeRepository } from './repository.js'
import { runnerAgentEnvironment } from './agentAuth.js'
import { recordProcess } from './processIdentity.js'
import { resolveLogPath } from '../session/logAdapters.js'
import type { GitCredential, RemoteJobSpec, RemoteResult } from './types.js'

export function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path + '.tmp', JSON.stringify(value), { mode: 0o600 })
  renameSync(path + '.tmp', path)
}

export function jobAuthDir(root: string, id: string): string {
  return join(process.env.QUUU_RUNNER_SECRETS ?? join(root, 'private'), id)
}
export function writeCredential(root: string, id: string, credential: GitCredential): void {
  const dir = jobAuthDir(root, id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeGitHubHosts(dir, credential.user, credential.token)
  atomicJson(join(dir, 'repository.json'), { repository: credential.repository })
}
function authEnvironment(root: string, spec: RemoteJobSpec): NodeJS.ProcessEnv {
  const dir = jobAuthDir(root, spec.id)
  const env: NodeJS.ProcessEnv = { ...process.env, ...spec.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined,
    QUUU_RUN_ID: spec.id, QUUU_TASK_ID: spec.taskId, QUUU_PROJECT: spec.project.name, GIT_TERMINAL_PROMPT: '0' }
  Object.assign(env, runnerAgentEnvironment(root))
  if (existsSync(join(dir, 'hosts.yml'))) {
    Object.assign(env, { GH_CONFIG_DIR: dir, GH_TOKEN: undefined, GITHUB_TOKEN: undefined, GH_PROMPT_DISABLED: '1',
      GH_REPO: (JSON.parse(readFileSync(join(dir, 'repository.json'), 'utf8')) as { repository: string }).repository,
      GIT_CONFIG_COUNT: '4', GIT_CONFIG_KEY_0: 'credential.https://github.com.helper', GIT_CONFIG_VALUE_0: '',
      GIT_CONFIG_KEY_1: 'credential.https://github.com.helper', GIT_CONFIG_VALUE_1: '!gh auth git-credential',
      GIT_CONFIG_KEY_2: 'url.https://github.com/.insteadOf', GIT_CONFIG_VALUE_2: 'git@github.com:',
      GIT_CONFIG_KEY_3: 'url.https://github.com/.insteadOf', GIT_CONFIG_VALUE_3: 'ssh://git@github.com/' })
  }
  return env
}

/** A separate process per instruction gives Git and provider code one isolated environment. */
export async function executeJob(root: string, spec: RemoteJobSpec): Promise<void> {
  const dir = join(root, 'jobs', spec.id)
  recordProcess(join(dir, 'pid'), process.pid)
  const result: RemoteResult = { started: false, exitCode: null, canceled: false, timedOut: false, error: '', sessionId: spec.sessionId }
  let childPid: number | undefined
  let timer: NodeJS.Timeout | undefined
  const abort = new AbortController()
  const terminate = (): void => {
    abort.abort()
    if (childPid) {
      const pid = childPid
      killProcessGroup(pid, 'SIGTERM')
      setTimeout(() => killProcessGroup(pid, 'SIGKILL'), 5000).unref()
    }
  }
  const cancel = (): void => { result.canceled = true; terminate() }
  process.on('SIGTERM', cancel)
  if (spec.timeoutSeconds > 0) timer = setTimeout(() => { result.timedOut = true; terminate() }, spec.timeoutSeconds * 1000)
  try {
    const env = authEnvironment(root, spec)
    // This process owns only this job; helper modules inherit exactly its project credentials.
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    const checkout = join(root, 'workspaces', spec.taskId)
    const repository = normalizeRepository(spec.workspace.repository)
    if (!existsSync(checkout)) {
      if (!spec.createWorkspace) throw new Error('The original Runner workspace is missing; refusing to recreate an existing conversation')
      const staging = checkout + '.cloning'
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(dirname(checkout), { recursive: true })
      const clone = await command('git', ['clone', '--', repository, staging], { cwd: root, env, timeout: 10 * 60_000, signal: abort.signal })
      if (clone.code !== 0) throw new Error(clone.stderr.trim() || 'Git clone failed')
      const branch = await command('git', ['checkout', '-b', `quuu/${spec.taskId}`], { cwd: staging, env, signal: abort.signal })
      if (branch.code !== 0) throw new Error(branch.stderr.trim() || 'Cannot create task branch')
      renameSync(staging, checkout)
    }
    const cwd = spec.workspace.cwd
    if (!existsSync(cwd) || relative(realpathSync(checkout), realpathSync(cwd)).startsWith('..')) throw new Error('Runner project subdirectory is missing or outside the checkout')
    const baselineFile = join(root, 'workspaces', `${spec.taskId}.baseline.json`)
    if (!existsSync(baselineFile)) atomicJson(baselineFile, await captureReviewBaseline(cwd, spec.taskId, new Date().toISOString()))
    result.baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as RemoteResult['baseline']
    if (result.canceled || result.timedOut) throw new Error('Stopped before launch')
    const project = { ...spec.project, path: cwd, commitIdentityMode: 'off' as const }
    const service = new ReviewService()
    if (spec.action === 'snapshot') {
      const info = spec.review!
      const proofs: NonNullable<RemoteResult['reviewProofs']> = { commits: [], pullRequests: [] }
      // A persisted inspection job may have been written by an older host.
      const evidence = { ...info.evidence, pullRequestCandidates: info.evidence.pullRequestCandidates ?? info.evidence.pullRequests ?? [] }
      const snapshot = await service.snapshot(cwd, project, DEFAULT_SETTINGS, info.baseline ?? result.baseline ?? null,
        evidence, undefined, { windows: info.windows, recorded: info.recorded,
          observed: commits => { proofs.commits.push(...commits) },
          verified: proof => { proofs.pullRequests.push(proof) } })
      await service.retain(spec.taskId, snapshot)
      result.reviewProofs = proofs
      result.value = snapshot
      result.exitCode = 0
    } else if (spec.action === 'file') {
      result.value = await service.file(cwd, project, DEFAULT_SETTINGS, spec.file!)
      result.exitCode = 0
    } else if (spec.action === 'comment') {
      result.value = await service.comment(cwd, project, DEFAULT_SETTINGS, spec.comment!)
      result.exitCode = 0
    } else {
      let args = spec.args
      let page = ''
      if (spec.report) {
        process.env.QUUU_USER_DATA = root
        writeReportAssets()
        page = join(root, 'reports', spec.taskId, `${spec.id}.html`)
        mkdirSync(dirname(page), { recursive: true })
        const tree = await snapshotWorktree(cwd)
        const request = { ...spec.report.request, cwd, page,
          runs: spec.report.request.runs.map(run => {
            try {
              const source = JSON.parse(readFileSync(join(root, 'jobs', run.id, 'spec.json'), 'utf8')) as RemoteJobSpec
              return { ...run, sessionLogPath: resolveLogPath(source.adapter, source.workspace.cwd, run.sessionId) }
            } catch { return run }
          }),
          revision: result.baseline?.baseTree && tree ? { base: result.baseline.baseTree, head: tree.tree, inferred: false, foreign: 0 } : null }
        args = adapterFor(spec.adapter).invoke({ command: spec.command, template: spec.report.template,
          vars: { prompt: reportPrompt(request), title: request.title, sessionId: spec.sessionId,
            projectPath: cwd, projectName: spec.project.name, taskId: spec.taskId, runId: spec.id } }).args
      }
      result.exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(spec.command, args, { cwd, env: process.env, stdio: 'inherit', detached: true })
        childPid = child.pid
        result.started = childPid !== undefined
        if (childPid) recordProcess(join(dir, 'child-pid'), childPid)
        child.once('error', reject)
        child.once('exit', code => resolve(code))
      })
      childPid = undefined
      if (page && existsSync(page)) {
        const content = readFileSync(page)
        if (content.length > 8 * 1024 * 1024) throw new Error('Report exceeds 8 MiB')
        result.page = content.toString('utf8')
      }
    }
  } catch (error) { result.error = error instanceof Error ? error.message : String(error) }
  finally {
    if (timer) clearTimeout(timer)
    if (Buffer.byteLength(JSON.stringify(result)) > 8 * 1024 * 1024) {
      delete result.value
      delete result.page
      result.error = 'Runner result exceeds 8 MiB'
      result.exitCode = 1
    }
    atomicJson(join(dir, 'result.json'), result)
    process.removeListener('SIGTERM', cancel)
  }
}
