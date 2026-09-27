import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { spawnReport } from '../src/main/report/generator.js'
import { ProjectReportOperations, projectReportDue } from '../src/main/report/projectOperations.js'
import { projectRevision } from '../src/main/report/projectRevision.js'
import { projectReportPrompt } from '../src/main/report/prompt.js'
import { ReportOperations } from '../src/main/report/operations.js'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/main/settings/types.js'
import { makeAgent, makeProject, memoryDb } from './helpers.js'

vi.mock('../src/main/platform/shellEnv.js', () => ({ resolveLoginPath: () => Promise.resolve(process.env.PATH) }))
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
  db = memoryDb()
  const agentId = makeAgent(db, { name: 'Report writer' })
  projectId = makeProject(db, { name: 'Project', path: work, targetId: agentId })
  settings = { ...DEFAULT_SETTINGS, reportEnabled: true, reportTargetId: agentId }
  ops = new ProjectReportOperations(db, () => settings)
})

afterEach(() => {
  ops.stop()
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

describe('project change detection', () => {
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
})

describe('daily project reports', () => {
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
    expect(existsSync(first.path)).toBe(false)
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

  it('uses the configured report group and the same document resources with a customizable purpose', async () => {
    const group = repo.insertGroup(db, { name: 'Writers', description: '', strategy: 'round-robin',
      memberIds: [settings.reportTargetId], sortOrder: 0 })
    settings.reportTargetKind = 'group'
    settings.reportTargetId = group.id
    settings.projectReportInstructions = 'Evaluate accessibility goals'
    await ops.checkDaily()
    const launch = vi.mocked(spawnReport).mock.calls[0][0]
    expect(launch.args.join(' ')).toContain('Evaluate accessibility goals')
    expect(launch.args.join(' ')).toContain('../assets/document-design-v1.1.0.css')
    expect(launch.env.QUUU_TASK_ID).toBeUndefined()
    const prompt = projectReportPrompt({ cwd: work, title: 'Project', page: '/tmp/page.html', instructions: '' })
    expect(prompt).toContain('AGENTS.md, README.md')
    expect(prompt).toContain('vision and goals')
  })

  it.each(['', 'Evaluate accessibility goals'])('introduces the project before assessing progress with instructions %j', (instructions) => {
    const prompt = projectReportPrompt({ cwd: work, title: 'Project', page: '/tmp/page.html', instructions })
    expect(prompt).toContain('Read AGENTS.md, README.md')
    expect(prompt).toContain('The h1 must name the project, its concrete function and its kind')
    expect(prompt).toContain('what the user provides, what the project does, and what the user')
    expect(prompt).toContain('Mark planned capabilities')
    expect(prompt).toContain('Put the progress assessment in the sections that follow')
    if (instructions) expect(prompt).toContain(instructions)
    const opening = prompt.slice(prompt.indexOf('<article class="sheet">'), prompt.indexOf('<section class="sec"'))
    expect(opening).toContain('<h1>')
    expect(opening).toContain('<p class="stand">')
    expect(opening).toContain('<ol class="flow tone-blue">')
    expect(opening).not.toMatch(/class="(?:was|mid|now)"|BEFORE|AFTER/)
    expect(prompt).not.toContain('introduce the central change')
  })
})
