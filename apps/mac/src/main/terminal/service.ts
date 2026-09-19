import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Writable } from 'node:stream'
import { t } from '../i18n/index.js'
import { discoverProjectTasks, shellQuote, taskCommand } from '../projects/tasks.js'
import type { TerminalActionResult, TerminalEvent, TerminalSession } from './types.js'

const DEFAULT_TERMINAL_COLUMNS = 80
const DEFAULT_TERMINAL_ROWS = 24

function terminalDimension(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(2, Math.min(65535, Math.round(value))) : fallback
}

/** Exported for tests that drive the host directly (the owner-vanishes case has no service left to ask). */
export function ptyHelperPath(): string {
  const override = process.env.QUUU_PTY_HELPER
  if (override) return override
  const resourcesPath = 'resourcesPath' in process && typeof process.resourcesPath === 'string' ? process.resourcesPath : null
  const candidates = [
    ...(resourcesPath ? [join(resourcesPath, 'bin', 'quuu-pty')] : []),
    join(process.cwd(), 'build', 'pty', 'quuu-pty'),
    join(process.cwd(), 'apps', 'mac', 'build', 'pty', 'quuu-pty')
  ]
  const helper = candidates.find(existsSync)
  if (!helper) throw new Error(t('terminal.ptyHostMissing'))
  return helper
}

/** Manages only the PTY's lifetime and its I/O. It does not depend on fetching a review. */
export class TerminalService extends EventEmitter {
  private readonly terminals = new Map<
    string,
    { session: TerminalSession; child: ChildProcess; input: Writable; control: Writable }
  >()

  openTerminal(cwd: string, columns: number, rows: number): TerminalSession {
    const shell = process.env.SHELL || '/bin/zsh'
    const id = randomUUID()
    const safeColumns = terminalDimension(columns, DEFAULT_TERMINAL_COLUMNS)
    const safeRows = terminalDimension(rows, DEFAULT_TERMINAL_ROWS)
    const child = spawn(
      ptyHelperPath(),
      [shell, cwd, String(safeColumns), String(safeRows)],
      {
        cwd,
        env: process.env,
        // The helper owns TERM / size / process group. The renderer only passes terminal bytes.
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        detached: true
      }
    )
    const input = child.stdin
    const output = child.stdout
    const errors = child.stderr
    const control = child.stdio[3]
    if (!input || !output || !errors || !control || !('write' in control)) {
      child.kill('SIGTERM')
      throw new Error(t('terminal.ioUnavailable'))
    }
    const session = {
      id,
      cwd,
      shell: basename(shell),
      columns: safeColumns,
      rows: safeRows
    }
    this.terminals.set(id, { session, child, input, control })
    output.setEncoding('utf8')
    errors.setEncoding('utf8')
    output.on('data', (data: string) => this.emitTerminal({ sessionId: id, type: 'output', data }))
    errors.on('data', (data: string) => this.emitTerminal({ sessionId: id, type: 'output', data }))
    child.once('close', (code) => {
      this.emitTerminal({ sessionId: id, type: 'exit', exitCode: code })
      this.terminals.delete(id)
    })
    child.once('error', (error) => {
      this.emitTerminal({ sessionId: id, type: 'output', data: `\r\n${error.message}\r\n` })
    })
    return session
  }

  terminalInput(sessionId: string, input: string): TerminalActionResult {
    const terminal = this.terminals.get(sessionId)
    if (!terminal || terminal.child.exitCode !== null) {
      return { ok: false, reason: t('terminal.exited') }
    }
    terminal.input.write(input)
    return { ok: true }
  }

  resizeTerminal(sessionId: string, columns: number, rows: number): TerminalActionResult {
    const terminal = this.terminals.get(sessionId)
    if (!terminal || terminal.child.exitCode !== null) {
      return { ok: false, reason: t('terminal.exited') }
    }
    const safeColumns = terminalDimension(columns, DEFAULT_TERMINAL_COLUMNS)
    const safeRows = terminalDimension(rows, DEFAULT_TERMINAL_ROWS)
    const frame = Buffer.allocUnsafe(8)
    frame.writeUInt32BE(safeColumns, 0)
    frame.writeUInt32BE(safeRows, 4)
    terminal.control.write(frame)
    terminal.session.columns = safeColumns
    terminal.session.rows = safeRows
    return { ok: true }
  }

  runProjectTask(sessionId: string, cwd: string, id: string): TerminalActionResult {
    const task = discoverProjectTasks(cwd).find((candidate) => candidate.id === id)
    if (!task) return { ok: false, reason: t('terminal.projectTaskNotFound') }
    // Send to a fresh command line without disturbing the current input line, as an IDE's "run in terminal" does.
    return this.terminalInput(sessionId, `\u0003cd ${shellQuote(cwd)} && ${taskCommand(task)}\r`)
  }

  closeTerminal(sessionId: string): void {
    const terminal = this.terminals.get(sessionId)
    if (!terminal) return
    this.stopTerminal(terminal.child)
  }

  shutdown(): void {
    for (const terminal of this.terminals.values()) this.stopTerminal(terminal.child)
    this.terminals.clear()
  }

  private stopTerminal(child: ChildProcess): void {
    if (child.exitCode !== null) return
    const pid = child.pid
    try {
      if (pid === undefined) throw new Error('the terminal has no process ID')
      process.kill(-pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }

  private emitTerminal(event: TerminalEvent): void {
    this.emit('terminal', event)
  }
}
