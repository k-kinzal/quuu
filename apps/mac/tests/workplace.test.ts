import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeSessionParser } from '../src/main/agent-adapters/claude/parser.js'
import { CodexSessionParser } from '../src/main/agent-adapters/codex/parser.js'
import { CopilotSessionParser } from '../src/main/agent-adapters/copilot/parser.js'
import * as repo from '../src/main/db/repo.js'
import { SessionIndex, sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import type { SessionMessage } from '../src/main/session/types.js'
import { agentWorkplace, collapse, recordedWorkingDirs, workingDirsOf, workplaceDerivation } from '../src/main/session/workplace.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

let dir: string
let repoDir: string
let worktree: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' })
}

/** A repository with one commit and one extra worktree, the way an agent leaves them. */
function initRepo(): void {
  repoDir = join(dir, 'repo')
  mkdirSync(join(repoDir, 'packages', 'ui'), { recursive: true })
  writeFileSync(join(repoDir, 'packages', 'ui', 'index.ts'), '')
  git(repoDir, 'init', '-q', '-b', 'main')
  git(repoDir, 'config', 'user.name', 'Quuu Test')
  git(repoDir, 'config', 'user.email', 'quuu@example.invalid')
  git(repoDir, 'add', '-A')
  git(repoDir, 'commit', '-q', '-m', 'init')
  worktree = join(dir, 'repo-feature')
  git(repoDir, 'worktree', 'add', '-q', worktree, '-b', 'feature')
}

const line = (value: unknown): string => JSON.stringify(value) + '\n'

/** Claude Code's shape: `cwd` on each conversation line. */
function claudeLines(cwds: string[]): string[] {
  return cwds.map((cwd, i) => line({ type: 'user', uuid: `u${i}`, cwd, message: { role: 'user', content: `step ${i}` } }))
}

/** Claude Code running a shell command, and the CLI's own reply to it. */
function claudeBash(cwd: string, command: string, result: string): string[] {
  return [
    line({ type: 'assistant', uuid: `a${command.length}`, cwd, message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${command.length}`, name: 'Bash', input: { command } }] } }),
    line({ type: 'user', uuid: `r${command.length}`, cwd, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${command.length}`, content: result }] } })
  ]
}

/** Codex's shape: the directory the session started in, then each command with its own `workdir`. */
function codexLines(cwd: string, commands: Array<{ cmd: string; workdir?: string }>): string[] {
  return [
    line({ type: 'session_meta', payload: { id: 'codex-1', cwd } }),
    line({ type: 'turn_context', payload: { cwd } }),
    ...commands.map((command, i) => line({
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', call_id: `c${i}`, arguments: JSON.stringify({ cmd: command.cmd, workdir: command.workdir ?? cwd }) }
    }))
  ]
}

function parsed(parser: ClaudeSessionParser | CodexSessionParser | CopilotSessionParser, lines: string[]): SessionMessage[] {
  parser.pushLines(lines)
  return parser.messages
}

/** What the structured log says about where the agent was, in order. */
function dirsOf(messages: SessionMessage[]): string[] {
  return collapse(messages.flatMap(workingDirsOf))
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
    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([repoDir, worktree, join(worktree, 'packages')])))
    expect(agentWorkplace({ dirs, launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })

  /*
   * Codex does not `cd` into a worktree it made: it names the worktree as the `workdir` of every
   * command after. Read off the command text alone, the agent looked as if it had never left
   * the launch directory, and the terminal opened on `main` while the work sat on the branch.
   */
  it('reads the workdir Codex names on each command, with no cd anywhere', () => {
    const messages = parsed(new CodexSessionParser(), codexLines(repoDir, [
      { cmd: 'git status' },
      { cmd: 'npm test', workdir: worktree }
    ]))
    expect(dirsOf(messages)).toEqual([repoDir, worktree])
    expect(agentWorkplace({ dirs: dirsOf(messages), launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })

  it('keeps the worktree even when the last few commands ran from the launch directory', () => {
    // Codex runs its incidental commands (reading /tmp, docker, kill) from where it was launched
    const messages = parsed(new CodexSessionParser(), codexLines(repoDir, [
      { cmd: 'npm test', workdir: worktree }, { cmd: 'ls /tmp' }, { cmd: 'git log', workdir: worktree }, { cmd: 'docker ps' }
    ]))
    expect(agentWorkplace({ dirs: dirsOf(messages), launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })

  it('stays where it launched when the agent only wandered inside the same checkout', () => {
    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([repoDir, join(repoDir, 'packages', 'ui'), join(repoDir, 'packages')])))
    expect(agentWorkplace({ dirs, launchDir: repoDir, projectDir: repoDir })).toBe(repoDir)
  })

  it('does not follow the agent into another repository or /tmp it went to read something', () => {
    const other = join(dir, 'other')
    mkdirSync(other)
    git(other, 'init', '-q')
    const scratch = join(dir, 'scratch')
    mkdirSync(scratch)

    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([repoDir, worktree, other, scratch])))
    expect(agentWorkplace({ dirs, launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
    // With no worktree of its own visited at all, reading elsewhere is not a move either
    const stayed = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([repoDir, other, scratch])))
    expect(agentWorkplace({ dirs: stayed, launchDir: repoDir, projectDir: repoDir })).toBe(repoDir)
  })

  /*
   * Claude Code keeps its own directory and writes `cd <worktree> &&` in front of every command
   * instead, so `cwd` stays on the launch directory for the whole session. Measured: a task made a
   * worktree this way, committed and opened its Pull Request there, and its review read `main`.
   */
  it('follows a cd into a worktree written inside a shell command, while the recorded cwd stays home', () => {
    const messages = parsed(new ClaudeSessionParser(), [
      ...claudeBash(repoDir, `git worktree add ${worktree} -b feature-2 main 2>&1 | tail -1 && cd ${worktree} && git status --short | wc -l`, `0\nShell cwd was reset to ${repoDir}`),
      ...claudeBash(repoDir, `cd ${worktree} && git commit -q -F - <<'EOF'\nrefactor: read the endpoint\nEOF\ngit log --oneline -1`, `98b0d3a refactor: read the endpoint\nShell cwd was reset to ${repoDir}`)
    ])
    // A tool result folds into its call and is no message of its own, so the reset it reports is not a move
    expect(dirsOf(messages)).toEqual([repoDir, worktree, repoDir, worktree])
    expect(agentWorkplace({ dirs: dirsOf(messages), launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })

  it('reads git -C as a move too, and a cd into /tmp or a relative directory as none', () => {
    const messages = parsed(new CodexSessionParser(), codexLines(repoDir, [
      { cmd: 'cd /tmp && ls' }, { cmd: `git -C ${worktree} status` }, { cmd: 'cd packages/ui && npm test' }
    ]))
    // Each command names where it ran before where it went
    expect(dirsOf(messages)).toEqual([repoDir, '/tmp', repoDir, worktree, repoDir])
    expect(agentWorkplace({ dirs: dirsOf(messages), launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })

  it('finds a worktree that lives inside the checkout, as Claude Code makes them', () => {
    const inside = join(repoDir, '.claude', 'worktrees', 'doc-gen')
    git(repoDir, 'worktree', 'add', '-q', inside, '-b', 'worktree-doc-gen')
    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([repoDir, inside])))
    expect(agentWorkplace({ dirs, launchDir: repoDir, projectDir: repoDir })).toBe(inside)
  })

  it('lands on the same place below the root when the project is registered inside the repository', () => {
    const project = join(repoDir, 'packages', 'ui')
    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([project, join(worktree, 'packages', 'ui')])))
    expect(agentWorkplace({ dirs, launchDir: project, projectDir: project })).toBe(join(worktree, 'packages', 'ui'))
  })

  it('stays where it launched when there is no session log or no repository', () => {
    expect(agentWorkplace({ dirs: [], launchDir: repoDir, projectDir: repoDir })).toBe(repoDir)
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    const dirs = dirsOf(parsed(new ClaudeSessionParser(), claudeLines([plain, worktree])))
    expect(agentWorkplace({ dirs, launchDir: plain, projectDir: plain })).toBe(plain)
  })
})

describe('reading the directories off the structured log', () => {
  it('takes only commands the agent ran as moves, never a path quoted in a reply or a file it read', () => {
    const messages = parsed(new ClaudeSessionParser(), [
      line({ type: 'assistant', uuid: 'a1', cwd: '/here', message: { role: 'assistant', content: [{ type: 'text', text: `You could cd ${worktree} yourself` }] } }),
      ...claudeBash('/here', 'cat docs/working.md', `run: cd ${worktree} && npm test`),
      line({ type: 'assistant', uuid: 'a2', cwd: '/here', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: `${worktree}/README.md` } }] } })
    ])
    expect(dirsOf(messages)).toEqual(['/here'])
  })

  it('stamps the directory Copilot recorded when the session started on every message', () => {
    const messages = parsed(new CopilotSessionParser(), [
      line({ type: 'session.start', data: { sessionId: 's', context: { cwd: repoDir } } }),
      line({ type: 'user.message', data: { content: 'fix it' } }),
      line({ type: 'assistant.message', data: { content: 'done' } })
    ])
    expect(messages.map(message => message.cwd)).toEqual([repoDir, repoDir])
  })

  it('collapses consecutive repeats: each move counts once, however long the agent stayed', () => {
    expect(collapse(['/a', '/a', '/b', '/b', '/a'])).toEqual(['/a', '/b', '/a'])
  })
})

describe('keeping the directories with the indexed session', () => {
  let db: ReturnType<typeof memoryDb>
  let index: SessionIndex

  beforeEach(() => {
    isolateSessionDirs(dir)
    db = memoryDb()
    index = new SessionIndex(db, [workplaceDerivation])
  })
  afterEach(async () => {
    index.stop()
    await index.settled()
    db.close()
    releaseSessionDirs()
  })

  it('answers a later look from what was derived at indexing, without opening the log again', async () => {
    const agentId = makeAgent(db, { name: 'Codex', logAdapter: 'codex' })
    const projectId = makeProject(db, { name: 'Fixture', path: repoDir, targetId: agentId })
    const taskId = makeTask(db, projectId, 'Fixture')
    const logPath = join(dir, 'rollout.jsonl')
    const runId = occupy(db, taskId, agentId, { stdoutLogPath: join(dir, 'stdout.log') })
    repo.updateRun(db, runId, { sessionLogPath: logPath })
    writeFileSync(logPath, codexLines(repoDir, [{ cmd: 'git status' }, { cmd: 'npm test', workdir: worktree }]).join(''))
    const run = repo.getRun(db, runId)!
    const key = sessionKey(sessionReadTarget(db, run))

    // Nothing has been derived yet, and a guess would send the terminal somewhere the work never was
    expect(recordedWorkingDirs(db, key)).toEqual([])
    index.request(run)
    await index.settled()
    rmSync(logPath)
    expect(recordedWorkingDirs(db, key)).toEqual([repoDir, worktree])
    expect(agentWorkplace({ dirs: recordedWorkingDirs(db, key), launchDir: repoDir, projectDir: repoDir })).toBe(worktree)
  })
})
