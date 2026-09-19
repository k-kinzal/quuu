import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agentWorkplace, recordedWorkingDirs } from '../src/main/session/workplace.js'

let dir: string
let repo: string
let worktree: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' })
}

/** A repository with one commit and one extra worktree, the way an agent leaves them. */
function initRepo(): void {
  repo = join(dir, 'repo')
  mkdirSync(join(repo, 'packages', 'ui'), { recursive: true })
  writeFileSync(join(repo, 'packages', 'ui', 'index.ts'), '')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.name', 'Quuu Test')
  git(repo, 'config', 'user.email', 'quuu@example.invalid')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')
  worktree = join(dir, 'repo-feature')
  git(repo, 'worktree', 'add', '-q', worktree, '-b', 'feature')
}

/** Claude Code's shape: `cwd` on each message line. */
function claudeLog(name: string, cwds: string[]): string {
  const path = join(dir, name)
  writeFileSync(path, cwds.map((cwd) => JSON.stringify({ type: 'user', cwd, message: {} }) + '\n').join(''))
  return path
}

/** Codex's shape: a `file://` URL on each command it ran. */
function codexLog(name: string, cwds: string[]): string {
  const path = join(dir, name)
  writeFileSync(
    path,
    cwds
      .map((cwd) =>
        JSON.stringify({
          type: 'event_msg',
          payload: { type: 'item_completed', item: { type: 'CommandExecution', cwd: pathToFileURL(cwd).href } }
        }) + '\n'
      )
      .join('')
  )
  return path
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'taskd-workplace-')))
  initRepo()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('where the agent actually worked', () => {
  it('follows the agent into the worktree its session moved to', () => {
    const log = claudeLog('claude.jsonl', [repo, worktree, join(worktree, 'packages')])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(worktree)
  })

  it('reads the file URLs Codex writes for the directory of each command', () => {
    const log = codexLog('codex.jsonl', [repo, worktree])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(worktree)
  })

  it('keeps the worktree even when the last few commands ran from the launch directory', () => {
    // Codex runs its incidental commands (reading /tmp, docker, kill) from where it was launched
    const log = codexLog('codex.jsonl', [repo, worktree, repo, worktree, repo])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(worktree)
  })

  it('stays where it launched when the agent only wandered inside the same checkout', () => {
    const log = claudeLog('claude.jsonl', [repo, join(repo, 'packages', 'ui'), join(repo, 'packages')])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(repo)
  })

  it('does not follow the agent into another repository or /tmp it went to read something', () => {
    const other = join(dir, 'other')
    mkdirSync(other)
    git(other, 'init', '-q')
    const scratch = join(dir, 'scratch')
    mkdirSync(scratch)

    const log = claudeLog('claude.jsonl', [repo, worktree, other, scratch])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(worktree)
    // With no worktree of its own visited at all, reading elsewhere is not a move either
    const stayed = claudeLog('stayed.jsonl', [repo, other, scratch])
    expect(agentWorkplace({ logPath: stayed, launchDir: repo, projectDir: repo })).toBe(repo)
  })

  it('finds a worktree that lives inside the checkout, as Claude Code makes them', () => {
    const inside = join(repo, '.claude', 'worktrees', 'doc-gen')
    git(repo, 'worktree', 'add', '-q', inside, '-b', 'worktree-doc-gen')
    const log = claudeLog('claude.jsonl', [repo, inside])
    expect(agentWorkplace({ logPath: log, launchDir: repo, projectDir: repo })).toBe(inside)
  })

  it('lands on the same place below the root when the project is registered inside the repository', () => {
    const project = join(repo, 'packages', 'ui')
    const log = claudeLog('claude.jsonl', [project, join(worktree, 'packages', 'ui')])
    expect(agentWorkplace({ logPath: log, launchDir: project, projectDir: project })).toBe(
      join(worktree, 'packages', 'ui')
    )
  })

  it('stays where it launched when there is no session log or no repository', () => {
    expect(agentWorkplace({ logPath: null, launchDir: repo, projectDir: repo })).toBe(repo)
    expect(agentWorkplace({ logPath: join(dir, 'missing.jsonl'), launchDir: repo, projectDir: repo })).toBe(repo)
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    const log = claudeLog('claude.jsonl', [plain, worktree])
    expect(agentWorkplace({ logPath: log, launchDir: plain, projectDir: plain })).toBe(plain)
  })
})

describe('reading the directories a session recorded', () => {
  it('reads only what was appended since the last look, and never half a line', () => {
    const log = claudeLog('claude.jsonl', ['/a', '/a', '/b'])
    expect(recordedWorkingDirs(log)).toEqual(['/a', '/b'])

    // A line still being written holds half a path; it counts once the line is complete
    appendFileSync(log, '{"type":"user","cwd":"/c/long')
    expect(recordedWorkingDirs(log)).toEqual(['/a', '/b'])
    appendFileSync(log, 'er"}\n')
    expect(recordedWorkingDirs(log)).toEqual(['/a', '/b', '/c/longer'])
  })

  it('ignores a path quoted inside a message body (an agent reading someone else\'s log)', () => {
    const log = join(dir, 'quoted.jsonl')
    const body = 'saw "cwd":"/elsewhere" in the file'
    writeFileSync(log, JSON.stringify({ type: 'assistant', cwd: '/here', message: { content: body } }) + '\n')
    expect(recordedWorkingDirs(log)).toEqual(['/here'])
  })

  it('starts over when the log was rewritten shorter', () => {
    const log = claudeLog('claude.jsonl', ['/a', '/b'])
    expect(recordedWorkingDirs(log)).toEqual(['/a', '/b'])
    writeFileSync(log, JSON.stringify({ type: 'user', cwd: '/z' }) + '\n')
    expect(recordedWorkingDirs(log)).toEqual(['/z'])
  })
})
