import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { shQuote, terminalScript } from '../src/main/platform/terminal.js'
import { discoverEditors, openTargetFor } from '../src/main/platform/editorApps.js'
import { editorAppName, resolveEditorApp } from '../src/main/platform/editorChoice.js'
import { makeAgent, makeProject, makeTask } from './helpers.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'taskd-open-'))
  process.env.QUUU_USER_DATA = dir
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.QUUU_APPLICATION_DIRS
  delete process.env.QUUU_USER_DATA
})

describe('the script handed to the terminal', () => {
  it('passes a value containing spaces or quotes as a single word', () => {
    expect(shQuote('/tmp/my project')).toBe("'/tmp/my project'")
    expect(shQuote("it's")).toBe("'it'\\''s'")
    // Expansion would end up opening a different directory
    expect(shQuote('$HOME/x')).toBe("'$HOME/x'")
  })

  it('moves to the working directory, runs the command and leaves the shell behind', () => {
    const script = terminalScript({
      cwd: '/tmp/wt',
      command: 'claude',
      args: ['--resume', 'abc'],
      title: 'Quuu — 直す',
      path: '/opt/homebrew/bin:/usr/bin',
      shell: '/bin/zsh'
    })
    expect(script.startsWith('#!/bin/sh\n')).toBe(true)
    expect(script).toContain("cd '/tmp/wt' || exit 1")
    // The PATH of a GUI-launched Quuu cannot find claude
    expect(script).toContain("PATH='/opt/homebrew/bin:/usr/bin'")
    expect(script).toContain("'claude' '--resume' 'abc'")
    // Leave the window open so git diff can be typed the moment it ends
    expect(script.trimEnd().endsWith("exec '/bin/zsh' -l")).toBe(true)
  })

  it('keeps a task name from being interpreted by the shell', () => {
    const script = terminalScript({
      cwd: '/tmp',
      command: 'claude',
      args: [],
      title: '`rm -rf /` を直す',
      path: '/usr/bin',
      shell: '/bin/zsh'
    })
    expect(script).toContain("printf '\\033]0;%s\\007' '`rm -rf /` を直す'")
  })
})

describe('finding IDEs and editors', () => {
  function app(name: string, at = dir): void {
    mkdirSync(join(at, name), { recursive: true })
  }

  it('picks up only what could actually be opened into', () => {
    app('GoLand.app')
    app('Xcode.app')
    app('Safari.app')
    app('1Password.app')
    process.env.QUUU_APPLICATION_DIRS = dir

    expect(discoverEditors().map((e) => e.name)).toEqual(['GoLand', 'Xcode'])
  })

  /* Toolbox-installed and derived builds grow a suffix on the name. An exact match would never find them */
  it('picks it up even when a different build makes the name longer', () => {
    app('PyCharm Community Edition.app')
    app('IntelliJ IDEA Ultimate.app')
    app('Android Studio Preview.app')
    process.env.QUUU_APPLICATION_DIRS = dir

    expect(discoverEditors().map((e) => e.name)).toEqual([
      'Android Studio Preview',
      'IntelliJ IDEA Ultimate',
      'PyCharm Community Edition'
    ])
  })

  it('silently skips a directory that is not there', () => {
    app('Zed.app')
    process.env.QUUU_APPLICATION_DIRS = `${join(dir, 'none')}:${dir}`
    expect(discoverEditors().map((e) => e.name)).toEqual(['Zed'])
  })
})

describe('what gets handed to the app', () => {
  it('hands Xcode the workspace or the project', () => {
    writeFileSync(join(dir, 'README.md'), '')
    mkdirSync(join(dir, 'App.xcodeproj'))
    expect(openTargetFor('/Applications/Xcode.app', dir)).toBe(join(dir, 'App.xcodeproj'))

    // With both present it is the workspace (Xcode's own convention)
    mkdirSync(join(dir, 'App.xcworkspace'))
    expect(openTargetFor('/Applications/Xcode.app', dir)).toBe(join(dir, 'App.xcworkspace'))
  })

  it('falls back to the directory for Xcode too when there is nothing to hand it', () => {
    expect(openTargetFor('/Applications/Xcode.app', dir)).toBe(dir)
  })

  it('hands other apps the directory as it is', () => {
    mkdirSync(join(dir, 'App.xcodeproj'))
    expect(openTargetFor('/Applications/GoLand.app', dir)).toBe(dir)
  })
})

describe('which app it opens in', () => {
  const app = (editorApp: string): { editorApp: string } => ({ editorApp })

  it('takes the project setting first and the app default otherwise', () => {
    expect(resolveEditorApp(app('/Applications/Zed.app'), app('/Applications/GoLand.app'))).toBe(
      '/Applications/GoLand.app'
    )
    expect(resolveEditorApp(app('/Applications/Zed.app'), app(''))).toBe('/Applications/Zed.app')
    expect(resolveEditorApp(app(''), app(''))).toBe('')
    expect(resolveEditorApp(app('/Applications/Zed.app'), null)).toBe('/Applications/Zed.app')
  })

  it('still shows the name of an app missing from the list (never leave a setting whose target cannot be read)', () => {
    expect(editorAppName('/Users/me/Applications/GoLand 2024.3.app')).toBe('GoLand 2024.3')
    expect(editorAppName('')).toBe('')
  })
})

/**
 * Which place gets opened.
 *
 * **Not necessarily the project directory.** A session run in a worktree
 * has its output somewhere else. Not being able to open that was the whole motivation,
 * so this pins down that it does not fall back to "the registered place".
 */
describe('how the place to open is decided', () => {
  /** Stop the scheduler. A test about where to open must never launch a real agent. */
  function makeApp(): QuuuApp {
    const app = new QuuuApp(':memory:')
    app.scheduler.pause()
    return app
  }

  /** Pretend it ran in a worktree (only the run record is written). */
  function ranIn(app: QuuuApp, taskId: string, agentId: string, cwd: string, sessionLogPath: string | null = null): string {
    const id = `run_${taskId}`
    repo.insertRun(app.db, {
      id,
      taskId,
      agentId,
      resolvedFromGroupId: null,
      sessionId: 'sess-1',
      kind: 'initial',
      status: 'succeeded',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd,
      command: 'claude',
      args: [],
      promptPreview: '',
      exitCode: 0,
      errorKind: null,
      errorMessage: '',
      sessionLogPath,
      stdoutLogPath: join(dir, 'x.log')
    })
    return id
  }

  it('opens the place the latest run actually lived in for a task (the worktree when that is where it was)', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a', command: 'claude' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: dir })
    const task = makeTask(app.db, project, 't')
    const worktree = join(dir, 'wt')
    mkdirSync(worktree)
    const run = ranIn(app, task, agent, worktree)

    expect(app.workspace.workingDir({ kind: 'task', id: task })?.dir).toBe(worktree)
    expect(app.workspace.workingDir({ kind: 'run', id: run })?.dir).toBe(worktree)
    // The project stays the place that was registered
    expect(app.workspace.workingDir({ kind: 'project', id: project })?.dir).toBe(dir)
  })

  it('follows the agent into the worktree its session moved to, for the task and for the run', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a', command: 'claude' })
    const repo = join(dir, 'repo')
    mkdirSync(repo)
    const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' })
    git('init', '-q', '-b', 'main')
    git('config', 'user.name', 'Quuu Test')
    git('config', 'user.email', 'quuu@example.invalid')
    git('commit', '-q', '--allow-empty', '-m', 'init')
    const worktree = join(dir, 'repo-feature')
    git('worktree', 'add', '-q', worktree, '-b', 'feature')
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: repo })
    const task = makeTask(app.db, project, 't')
    // Launched in the repository, then moved: what the session log says, not the run record
    const log = join(dir, 'session.jsonl')
    writeFileSync(log, [repo, worktree].map((cwd) => JSON.stringify({ type: 'user', cwd }) + '\n').join(''))
    const run = ranIn(app, task, agent, repo, log)

    expect(app.workspace.workingDir({ kind: 'task', id: task })?.dir).toBe(realpathSync(worktree))
    expect(app.workspace.workingDir({ kind: 'run', id: run })?.dir).toBe(realpathSync(worktree))
    expect(app.workspace.workingDir({ kind: 'project', id: project })?.dir).toBe(repo)
  })

  it('uses the project directory for a task that has not run yet', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: dir })
    const task = makeTask(app.db, project, 't')

    expect(app.workspace.workingDir({ kind: 'task', id: task })?.dir).toBe(dir)
  })

  it('does not open something that is gone (never stay silent pointing at nothing)', async () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: join(dir, 'none') })
    const task = makeTask(app.db, project, 't')

    expect(app.workspace.workingDir({ kind: 'task', id: 'tsk_missing' })).toBeNull()
    const result = await app.workspace.openTerminal({ kind: 'task', id: task })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('The directory does not exist')
  })

  it('returns a reason instead of opening a task that has no session', async () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: dir })
    const task = makeTask(app.db, project, 't')

    const result = await app.workspace.resumeInTerminal(task)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('no session to reopen')
  })

  it('returns a reason instead of opening when no IDE has been chosen', async () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: dir })

    const result = await app.workspace.openEditor({ kind: 'project', id: project })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('No IDE / editor is set')
  })
})
