import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { spawnReport } from '../src/main/report/generator.js'
import { ProjectReportOperations, projectReportDue } from '../src/main/report/projectOperations.js'
import { projectRevision } from '../src/main/report/projectRevision.js'
import { projectReportPrompt } from '../src/main/report/prompt.js'
import { ReportOperations } from '../src/main/report/operations.js'
import { resolveLoginPath } from '../src/main/platform/shellEnv.js'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/main/settings/types.js'
import { makeAgent, makeProject } from './helpers.js'

vi.mock('../src/main/platform/shellEnv.js', () => ({ resolveLoginPath: vi.fn(() => Promise.resolve(process.env.PATH)) }))
vi.mock('../src/main/report/generator.js', async (original) => ({
  ...await original<typeof import('../src/main/report/generator.js')>(), spawnReport: vi.fn(() => 123)
}))
vi.mock('../src/main/platform/runProcess.js', () => ({
  isProcessAlive: () => false, killProcessGroup: vi.fn(), readExitCode: () => 0, readLogTail: () => ''
}))

let db: Db
let data: string
let work: string
let settings: AppSettings
let projectId: string
let ops: ProjectReportOperations
let oldData: string | undefined

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim()
}

beforeEach(() => {
  vi.clearAllMocks()
  oldData = process.env.QUUU_USER_DATA
  data = mkdtempSync(join(tmpdir(), 'quuu-project-report-'))
  process.env.QUUU_USER_DATA = data
  work = join(data, 'work')
  mkdirSync(work)
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.invalid')
  writeFileSync(join(work, 'README.md'), '# Our goal\n')
  git('add', '.')
  git('commit', '-qm', 'Start')
  db = openDatabase(join(data, 'test.db'))
  const agentId = makeAgent(db, { name: 'Report writer' })
  projectId = makeProject(db, { name: 'Project', path: work, targetId: agentId })
  settings = { ...DEFAULT_SETTINGS, reportEnabled: true, reportTargetId: agentId }
  ops = new ProjectReportOperations(db, () => settings)
})

afterEach(() => {
  ops.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  db.close()
  if (oldData === undefined) delete process.env.QUUU_USER_DATA
  else process.env.QUUU_USER_DATA = oldData
  rmSync(data, { recursive: true, force: true })
})

function finish(): void {
  const row = repo.getProjectReport(db, projectId)!
  writeFileSync(row.pending, '<html>Assessment</html>')
  ops.settle()
}

function yesterday(): void {
  const day = new Date()
  day.setDate(day.getDate() - 1)
  repo.markProjectReportChecked(db, projectId, day.toISOString())
}

function restart(): void {
  ops.stop()
  db.close()
  db = openDatabase(join(data, 'test.db'))
  ops = new ProjectReportOperations(db, () => settings)
}

function withoutGit(): void {
  rmSync(join(work, '.git'), { recursive: true })
}

describe('project change detection', () => {
  it('fingerprints document contents, names and instructions without creating Git metadata', async () => {
    withoutGit()
    mkdirSync(join(work, 'docs/operations'), { recursive: true })
    writeFileSync(join(work, 'docs/operations/runbook.rst'), 'Start service')
    const before = await projectRevision(work, '')
    const stat = statSync(join(work, 'README.md'))
    writeFileSync(join(work, 'README.md'), '# New goal\n')
    utimesSync(join(work, 'README.md'), stat.atime, stat.mtime)
    const changed = await projectRevision(work, '')
    expect(changed).not.toBe(before)
    expect(await projectRevision(work, '')).toBe(changed)
    writeFileSync(join(work, 'docs/operations/runbook.rst'), 'Start another service')
    const edited = await projectRevision(work, '')
    expect(edited).not.toBe(changed)
    renameSync(join(work, 'docs/operations/runbook.rst'), join(work, 'docs/operations/manual.rst'))
    const renamed = await projectRevision(work, '')
    expect(renamed).not.toBe(edited)
    rmSync(join(work, 'docs/operations/manual.rst'))
    const removed = await projectRevision(work, '')
    expect(removed).not.toBe(renamed)
    expect(await projectRevision(work, 'Explain operations')).not.toBe(removed)
    expect(existsSync(join(work, '.git'))).toBe(false)
  })

  it('never walks generated or source trees, follows links, or reads oversized documents', async () => {
    withoutGit()
    const before = await projectRevision(work, '')
    for (const directory of ['.venv', 'build', 'models', 'src', 'docs/build', 'docs/.cache']) {
      mkdirSync(join(work, directory), { recursive: true })
      writeFileSync(join(work, directory, 'README.md'), 'Outside the document scope')
      chmodSync(join(work, directory), 0o000)
    }
    writeFileSync(join(work, 'huge.md'), '')
    truncateSync(join(work, 'huge.md'), 4 * 1024 ** 3)
    const outside = join(data, 'outside.md')
    writeFileSync(outside, 'Outside the project')
    symlinkSync(outside, join(work, 'linked.md'))
    symlinkSync(work, join(work, 'docs/loop'))
    mkdirSync(join(work, 'docs/a/b/c/deeper'), { recursive: true })
    writeFileSync(join(work, 'docs/a/b/c/deeper/README.md'), 'Beyond depth four')
    try { expect(await projectRevision(work, '')).toBe(before) }
    finally {
      for (const directory of ['.venv', 'build', 'models', 'src', 'docs/build', 'docs/.cache']) chmodSync(join(work, directory), 0o755)
    }
  })

  it('fails visibly at the entry and byte budgets instead of accepting an incomplete fingerprint', async () => {
    withoutGit()
    mkdirSync(join(work, 'docs'))
    for (let i = 0; i < 4096; i++) writeFileSync(join(work, 'docs', `${i}.bin`), '')
    await expect(projectRevision(work, '')).rejects.toThrow('document scan exceeded its limit')
    rmSync(join(work, 'docs'), { recursive: true })
    mkdirSync(join(work, 'docs'))
    for (let i = 0; i < 17; i++) writeFileSync(join(work, 'docs', `${i}.md`), Buffer.alloc(1024 * 1024, 'a'))
    await expect(projectRevision(work, '')).rejects.toThrow('document scan exceeded its limit')
  }, 20_000)

  it('does not mistake damaged repositories, invalid gitfiles or broken indexes for ordinary directories', async () => {
    chmodSync(join(work, '.git/HEAD'), 0o000)
    try { await expect(projectRevision(work, '')).rejects.toThrow() }
    finally { chmodSync(join(work, '.git/HEAD'), 0o644) }
    writeFileSync(join(work, '.git/index'), 'broken index')
    await expect(projectRevision(work, '')).rejects.toThrow()
    withoutGit()
    mkdirSync(join(work, '.git'))
    await expect(projectRevision(work, '')).rejects.toThrow('not a git repository')
    mkdirSync(join(work, 'nested'))
    await expect(projectRevision(join(work, 'nested'), '')).rejects.toThrow('not a git repository')
    rmSync(join(work, '.git'), { recursive: true })
    writeFileSync(join(work, '.git'), 'gitdir: missing-metadata\n')
    await expect(projectRevision(work, '')).rejects.toThrow()
  })

  it('propagates missing Git and filesystem access errors instead of treating them as no changes', async () => {
    withoutGit()
    vi.stubEnv('PATH', '')
    await expect(projectRevision(work, '')).rejects.toMatchObject({ code: 'ENOENT' })
    vi.unstubAllEnvs()
    chmodSync(join(work, 'README.md'), 0o000)
    try { await expect(projectRevision(work, '')).rejects.toMatchObject({ code: 'EACCES' }) }
    finally { chmodSync(join(work, 'README.md'), 0o644) }
    rmSync(work, { recursive: true })
    await expect(projectRevision(work, '')).rejects.toThrow()
    writeFileSync(work, 'Not a directory')
    await expect(projectRevision(work, '')).rejects.toThrow()
  })

  it('supports unborn Git repositories and linked worktrees without initializing or modifying them', async () => {
    withoutGit()
    git('init', '-q', '-b', 'main')
    const unborn = await projectRevision(work, '')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.invalid')
    git('add', '.')
    git('commit', '-qm', 'Initial')
    expect(await projectRevision(work, '')).not.toBe(unborn)
    const linked = join(data, 'linked')
    git('worktree', 'add', '-qb', 'linked', linked)
    const gitfile = readFileSync(join(linked, '.git'))
    const revision = await projectRevision(linked, '')
    writeFileSync(join(linked, 'README.md'), 'Changed linked worktree')
    expect(await projectRevision(linked, '')).not.toBe(revision)
    expect(readFileSync(join(linked, '.git'))).toEqual(gitfile)
  })
  it('detects main commits and successive staged, unstaged and untracked content changes without changing the index', async () => {
    const revisions = [await projectRevision(work, '')]
    git('commit', '--allow-empty', '-qm', 'A new main commit')
    revisions.push(await projectRevision(work, ''))
    writeFileSync(join(work, 'README.md'), '# Staged\n')
    git('add', '.')
    revisions.push(await projectRevision(work, ''))
    const index = readFileSync(join(work, '.git/index'))
    writeFileSync(join(work, 'README.md'), '# Unstaged one\n')
    revisions.push(await projectRevision(work, ''))
    writeFileSync(join(work, 'README.md'), '# Unstaged two\n')
    revisions.push(await projectRevision(work, ''))
    writeFileSync(join(work, 'new file\nwith newline'), Buffer.from([0, 1, 2]))
    revisions.push(await projectRevision(work, ''))
    writeFileSync(join(work, 'new file\nwith newline'), Buffer.from([0, 2, 2]))
    revisions.push(await projectRevision(work, ''))
    expect(new Set(revisions).size).toBe(revisions.length)
    expect(await projectRevision(work, '')).toBe(revisions.at(-1))
    expect(readFileSync(join(work, '.git/index'))).toEqual(index)
  })

  it('ignores generated files excluded by Git and detects instruction changes', async () => {
    writeFileSync(join(work, '.gitignore'), 'build/\n')
    const before = await projectRevision(work, '')
    mkdirSync(join(work, 'build'))
    writeFileSync(join(work, 'build/output'), 'generated')
    expect(await projectRevision(work, '')).toBe(before)
    expect(await projectRevision(work, 'Focus on usability')).not.toBe(before)
  })

  it('detects master changes from a project nested inside its Git worktree', async () => {
    git('branch', '-m', 'master')
    mkdirSync(join(work, 'nested'))
    const before = await projectRevision(join(work, 'nested'), '')
    git('commit', '--allow-empty', '-qm', 'New master commit')
    expect(await projectRevision(join(work, 'nested'), '')).not.toBe(before)
  })
})

describe('daily project reports', () => {
  it('generates non-Git projects initially, skips unchanged days, and regenerates for documents, instructions and manual requests', async () => {
    withoutGit()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    finish()
    const first = ops.report(projectId)!
    yesterday()
    restart()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    expect(ops.report(projectId)).toEqual(first)
    writeFileSync(join(work, 'README.md'), 'Revised purpose')
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    yesterday()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(2)
    finish()
    settings.projectReportInstructions = 'Describe operations'
    yesterday()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(3)
    finish()
    expect(await ops.generate(projectId)).toEqual({ ok: true })
    expect(spawnReport).toHaveBeenCalledTimes(4)
    finish()
    expect(ops.history(projectId)).toHaveLength(4)
    expect(existsSync(first.path)).toBe(true)
    expect(existsSync(join(work, '.git'))).toBe(false)
  })

  it('persists pre-launch errors and the retry deadline across a database reopen, then recovers automatically', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, 23, 59))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rmSync(join(work, '.git/HEAD'))
    await ops.checkDaily()
    const failure = ops.report(projectId)!
    expect(failure).toMatchObject({ status: 'failed', path: '', revision: '', logPath: '' })
    expect(failure.error).toContain('not a git repository')
    expect(failure.retryAt).toBe(new Date(Date.now() + 15 * 60_000).toISOString())
    expect(repo.getProjectReport(db, projectId)?.checkedAt).toBe(new Date().toISOString())
    expect(warn).toHaveBeenCalledOnce()
    restart()
    expect(ops.report(projectId)).toEqual(failure)
    for (let minute = 0; minute < 14; minute++) {
      vi.setSystemTime(Date.now() + 60_000)
      await ops.checkDaily()
    }
    expect(warn).toHaveBeenCalledOnce()
    expect(spawnReport).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + 60_000)
    await ops.checkDaily()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(Date.parse(ops.report(projectId)!.retryAt!)).toBe(Date.now() + 15 * 60_000)
    writeFileSync(join(work, '.git/HEAD'), 'ref: refs/heads/main\n')
    vi.setSystemTime(Date.now() + 15 * 60_000)
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    finish()
    expect(ops.report(projectId)).toMatchObject({ status: 'ready', error: '', retryAt: null })
    expect(repo.getProject(db, projectId)?.reportEnabled).toBe(true)
    expect(settings.reportEnabled).toBe(true)
  })

  it('allows immediate manual retries and retains the last page, revision and history after pre-launch failures', async () => {
    await ops.generate(projectId)
    finish()
    const first = ops.report(projectId)!
    const history = ops.history(projectId)
    vi.mocked(resolveLoginPath).mockRejectedValueOnce(new Error('Login shell failed'))
    expect(await ops.generate(projectId)).toEqual({ ok: false, reason: 'Login shell failed' })
    expect(ops.report(projectId)).toMatchObject({ status: 'failed', path: first.path, revision: first.revision, error: 'Login shell failed' })
    expect(ops.history(projectId)).toEqual(history)
    expect(existsSync(first.path)).toBe(true)
    expect(spawnReport).toHaveBeenCalledOnce()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    vi.mocked(spawnReport).mockImplementationOnce(() => { throw new Error('Launch failed') })
    expect(await ops.generate(projectId)).toEqual({ ok: false, reason: 'Launch failed' })
    expect(ops.report(projectId)?.error).toBe('Launch failed')
    expect(await ops.generate(projectId)).toEqual({ ok: true })
    finish()
    expect(ops.report(projectId)).toMatchObject({ status: 'ready', error: '', retryAt: null })
    expect(ops.history(projectId)).toHaveLength(2)
  })

  it('clears a recovered pre-launch error without replacing an unchanged successful report', async () => {
    await ops.generate(projectId)
    finish()
    const first = ops.report(projectId)!
    vi.useFakeTimers({ toFake: ['Date'] })
    const original = readFileSync(join(work, '.git/HEAD'))
    rmSync(join(work, '.git/HEAD'))
    expect((await ops.generate(projectId)).ok).toBe(false)
    writeFileSync(join(work, '.git/HEAD'), original)
    vi.setSystemTime(Date.parse(ops.report(projectId)!.retryAt!))
    await ops.checkDaily()
    expect(ops.report(projectId)).toMatchObject({ status: 'ready', error: '', retryAt: null, path: first.path, revision: first.revision })
    expect(spawnReport).toHaveBeenCalledOnce()
    expect(ops.history(projectId)).toHaveLength(1)
  })

  it('retries changed project paths, instructions and writer selections before the deadline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rmSync(work, { recursive: true })
    await ops.checkDaily()
    expect(ops.report(projectId)?.error).toContain(work)
    const replacement = join(data, 'replacement')
    mkdirSync(replacement)
    writeFileSync(join(replacement, 'README.md'), 'Healthy ordinary project')
    repo.updateProject(db, projectId, { path: replacement })
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    finish()
    vi.mocked(resolveLoginPath).mockRejectedValueOnce(new Error('Unavailable'))
    expect((await ops.generate(projectId)).ok).toBe(false)
    settings.projectReportInstructions = 'Different focus'
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(2)
    finish()
    settings.reportTargetId = ''
    expect((await ops.generate(projectId)).ok).toBe(false)
    settings.reportTargetId = makeAgent(db, { name: 'Replacement writer' })
    // No document changes: recovery clears the error and keeps the last page.
    await ops.checkDaily()
    expect(ops.report(projectId)).toMatchObject({ status: 'ready', error: '', retryAt: null })
  })

  it('does not persist stale failures after shutdown or a project edit during preparation', async () => {
    vi.mocked(resolveLoginPath).mockImplementationOnce(() => {
      repo.updateProject(db, projectId, { path: join(data, 'new-path') })
      return Promise.reject(new Error('Old path failed'))
    })
    expect((await ops.generate(projectId)).ok).toBe(false)
    expect(ops.report(projectId)).toBeNull()
    repo.updateProject(db, projectId, { path: work })
    vi.mocked(resolveLoginPath).mockImplementationOnce(() => {
      ops.stop()
      db.close()
      return Promise.reject(new Error('Shutting down'))
    })
    expect(await ops.generate(projectId)).toEqual({ ok: false, reason: 'Shutting down' })
    db = openDatabase(join(data, 'test.db'))
    ops = new ProjectReportOperations(db, () => settings)
    expect(ops.report(projectId)).toBeNull()
  })

  it('returns the translated reason when the project no longer exists', async () => {
    expect(await ops.generate('missing')).toEqual({ ok: false, reason: 'Project not found' })
    expect(spawnReport).not.toHaveBeenCalled()
  })

  it('writes once per local day, keeps unchanged reports and survives a restart', async () => {
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    finish()
    const first = ops.report(projectId)!
    expect(repo.hasOwnReportCovering(db, work, first.startedAt)).toBe(true)
    writeFileSync(join(work, 'README.md'), '# Changed today\n')
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledOnce()
    yesterday()
    ops.stop()
    ops = new ProjectReportOperations(db, () => settings)
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(2)
    expect(ops.report(projectId)?.path).toBe(first.path)
    finish()
    const second = ops.report(projectId)!
    expect(second.path).not.toBe(first.path)
    // The assessment it replaced stays readable, listed after the one shown now
    expect(existsSync(first.path)).toBe(true)
    expect(ops.history(projectId).map(entry => [entry.path, entry.current])).toEqual([[second.path, true], [first.path, false]])
    expect(ops.page(projectId, ops.history(projectId)[1].id)).toBe(first.path)
    yesterday()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(2)
    expect(ops.report(projectId)).toEqual(second)
    expect(projectReportDue(repo.getProjectReport(db, projectId)?.checkedAt)).toBe(false)
  })

  it('forces regeneration and keeps the last successful page and revision on failure', async () => {
    await ops.generate(projectId)
    finish()
    const first = ops.report(projectId)!
    expect((await ops.generate(projectId)).ok).toBe(true)
    expect(spawnReport).toHaveBeenCalledTimes(2)
    ops.settle()
    expect(ops.report(projectId)).toMatchObject({ status: 'failed', path: first.path, revision: first.revision })
    expect(existsSync(first.path)).toBe(true)
    writeFileSync(join(work, 'README.md'), 'New work')
    yesterday()
    await ops.checkDaily()
    expect(spawnReport).toHaveBeenCalledTimes(3)
  })

  it('resumes settlement from durable records and task report cleanup keeps project pages', async () => {
    await ops.generate(projectId)
    const row = repo.getProjectReport(db, projectId)!
    writeFileSync(row.pending, '<html>Written while closed</html>')
    ops.stop()
    const tasks = new ReportOperations(db, () => settings, () => { throw new Error('No task') })
    tasks.start()
    tasks.stop()
    expect(existsSync(row.pending)).toBe(true)
    ops = new ProjectReportOperations(db, () => settings)
    ops.settle()
    expect(ops.report(projectId)).toMatchObject({ status: 'ready', path: row.pending, revision: row.pendingRevision })
  })

  it('does not start duplicate simultaneous requests or change task state', async () => {
    await Promise.all([ops.generate(projectId), ops.generate(projectId), ops.checkDaily()])
    expect(spawnReport).toHaveBeenCalledOnce()
    expect(repo.listTasks(db)).toEqual([])
    expect(repo.listActiveRuns(db)).toEqual([])
  })

  it('respects global and project opt-outs and waits for an available writer', async () => {
    settings.reportEnabled = false
    await ops.checkDaily()
    expect((await ops.generate(projectId)).ok).toBe(false)
    settings.reportEnabled = true
    repo.updateProject(db, projectId, { reportEnabled: false })
    await ops.checkDaily()
    expect((await ops.generate(projectId)).ok).toBe(false)
    repo.updateProject(db, projectId, { reportEnabled: true })
    settings.reportTargetId = ''
    await ops.checkDaily()
    expect(spawnReport).not.toHaveBeenCalled()
    expect(repo.getProjectReport(db, projectId)).toBeNull()
  })

  it('uses the configured report group and sends only the saved prompt', async () => {
    const group = repo.insertGroup(db, { name: 'Writers', description: '', strategy: 'round-robin',
      memberIds: [settings.reportTargetId], sortOrder: 0 })
    settings.reportTargetKind = 'group'
    settings.reportTargetId = group.id
    settings.projectReportInstructions = 'Evaluate accessibility goals'
    await ops.checkDaily()
    const launch = vi.mocked(spawnReport).mock.calls[0][0]
    expect(launch.args.join(' ')).toContain('Evaluate accessibility goals')
    expect(launch.args).toContain('Evaluate accessibility goals')
    expect(launch.args.join(' ')).not.toContain('../assets/document-design-v1.2.1.css')
    expect(launch.env.QUUU_TASK_ID).toBeUndefined()
    expect(launch.args.join(' ')).not.toContain('Include gaps only when evidence')
  })

  it.each(['', '{{defaultPrompt}}'])('introduces the project and explains its implementation with instructions %j', (instructions) => {
    const prompt = projectReportPrompt({ cwd: work, title: 'Project', page: '/tmp/page.html', instructions })
    expect(prompt).toContain('Read AGENTS.md, README.md')
    expect(prompt).toContain("Open with the project's name, what it does and who uses it")
    expect(prompt).toContain('input, behavior and result')
    expect(prompt).toContain('including uncommitted work')
    expect(prompt).toContain('distinguish existing behavior from\nplans and unknowns')
    expect(prompt).toContain('how its design and implementation serve that purpose')
    expect(prompt).not.toContain('progress assessment')
    {
      expect(prompt).toContain("Explain the project's purpose and how its design, key components and their relationships")
      expect(prompt).toContain('Include gaps only when evidence shows something missing for that purpose; otherwise\nomit them')
      expect(prompt).toContain('Omit Git status, branch comparisons and commit bookkeeping')
    }
    const opening = prompt.slice(prompt.indexOf('<article class="sheet">'), prompt.indexOf('<section class="sec"'))
    expect(opening).toContain('<h1>')
    expect(opening).toContain('<p class="stand">')
    expect(opening).toContain('<ol class="flow tone-blue">')
    expect(opening).not.toMatch(/class="(?:was|mid|now)"|BEFORE|AFTER/)
    expect(prompt).not.toContain('introduce the central change')
  })
})
