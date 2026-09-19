import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalEvent } from '../src/main/terminal/types.js'
import { ptyHelperPath, TerminalService } from '../src/main/terminal/service.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-terminal-'))
  // Never let something like a personal zshrc update check eat the test input.
  vi.stubEnv('SHELL', '/bin/sh')
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('the built-in terminal', () => {
  it('hands the PTY working directory, ANSI I/O and screen size to the interactive session', async () => {
    mkdirSync(join(dir, 'nested'))
    const service = new TerminalService()
    const session = service.openTerminal(dir, 100, 30)
    const events: TerminalEvent[] = []

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('the terminal never answered')), 5000)
        service.on('terminal', (event: TerminalEvent) => {
          if (event.sessionId !== session.id) return
          events.push(event)
          if (
            event.type === 'output' &&
            events
              .filter((value): value is Extract<TerminalEvent, { type: 'output' }> => value.type === 'output')
              .map((value) => value.data)
              .join('')
              .includes('41 132')
          ) {
            clearTimeout(timeout)
            resolve()
          }
        })
        expect(service.resizeTerminal(session.id, 132, 41)).toEqual({ ok: true })
        expect(service.terminalInput(session.id, "cd nested && printf '\\033[31mterminal-ready\\033[0m\\n' && pwd\rstty size\r")).toEqual({
          ok: true
        })
      })

      const output = events
        .filter((event): event is Extract<TerminalEvent, { type: 'output' }> => event.type === 'output')
        .map((event) => event.data)
        .join('')
      expect(output).toContain('\u001b[31mterminal-ready\u001b[0m')
      expect(output).toContain(realpathSync(join(dir, 'nested')))
    } finally {
      service.shutdown()
    }
  })

  it('closing the terminal ends the PTY host together with the shell it started', async () => {
    const service = new TerminalService()
    const session = service.openTerminal(dir, 80, 24)
    const exited = new Promise<void>((resolve) => {
      service.on('terminal', (event: TerminalEvent) => {
        if (event.sessionId === session.id && event.type === 'exit') resolve()
      })
    })
    await firstOutput(service, session.id)

    // Interactive shells ignore SIGTERM, so a host that merely forwarded it would live on
    // forever. The 'exit' event only fires once the host has reaped its shell and gone.
    service.closeTerminal(session.id)
    await within(exited, 5000, 'the terminal never ended after it was closed')
  }, 10_000)

  it('the PTY host hangs up by itself when the Quuu that owned it is gone', async () => {
    const host = spawn(ptyHelperPath(), ['/bin/sh', dir, '80', '24'], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    const exited = new Promise<void>((resolve) => host.once('exit', () => resolve()))
    await within(new Promise<void>((resolve) => host.stdout.once('data', () => resolve())), 5000, 'the shell never answered')

    // A quit or crashed owner leaves exactly this behind: its end of the input pipe closed.
    host.stdin.end()
    await within(exited, 5000, 'the host outlived its owner')
  }, 10_000)
})

function firstOutput(service: TerminalService, sessionId: string): Promise<void> {
  return within(new Promise<void>((resolve) => {
    const seen = (event: TerminalEvent): void => {
      if (event.sessionId !== sessionId || event.type !== 'output') return
      service.off('terminal', seen)
      resolve()
    }
    service.on('terminal', seen)
  }), 5000, 'the terminal never answered')
}

function within<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(reason)), ms)
    promise.then((value) => { clearTimeout(timeout); resolve(value) }, (error: unknown) => { clearTimeout(timeout); reject(error instanceof Error ? error : new Error(String(error))) })
  })
}
