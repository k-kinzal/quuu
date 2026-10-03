import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startLocalLogin } from '../src/main/runners/localLogin.js'

let dir: string
const token = 'sk-ant-oat01-fixture-abcdefghijklmnopqrstuvwxyz-0123456789'
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-login-test-'))
  vi.stubEnv('SHELL', '/bin/sh')
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }) })

function cli(script: string): string {
  const command = join(dir, 'fake claude')
  writeFileSync(command, `#!${process.execPath}\n${script}`, { mode: 0o700 })
  return command
}

it('recovers the whole Claude token from a redraw that reuses a character from the previous prompt', async () => {
  // Claude 2.1.288 leaves the "o" from "Paste code" in column 9, then moves past it.
  // Neither stripping ANSI nor replacing it with spaces can reconstruct this token.
  const command = cli(`
    process.stdout.write(${JSON.stringify('\x1b[2GPaste code here if prompted >')});
    setTimeout(() => {
      process.stdout.write(${JSON.stringify('\r\x1b[2Gsk-ant-\x1b[')});
      setTimeout(() => {
        process.stdout.write(${JSON.stringify(`10G${token.slice('sk-ant-o'.length)}\x1b[K\r\n`)});
      }, 20);
    }, 20);
  `)
  const login = startLocalLogin('claude', command)
  try { expect(await login.credential).toBe(token) }
  finally { login.cancel() }
})

it('waits for the final token bytes instead of delivering a prefix that already looks like a credential', async () => {
  const command = cli(`
    process.stdout.write('\x1b[2J\x1b[H' + ${JSON.stringify(token.slice(0, 40))} + '\x1b[0m');
    setTimeout(() => process.stdout.write(${JSON.stringify(token.slice(40))}), 100);
  `)
  const login = startLocalLogin('claude', command)
  try { expect(await login.credential).toBe(token) }
  finally { login.cancel() }
})

it('does not deliver a token from a login process that ends in failure', async () => {
  const command = cli(`
    process.stdout.write(${JSON.stringify(`${token}\n`)});
    setTimeout(() => { process.exitCode = 1 }, 20);
  `)
  const login = startLocalLogin('claude', command)
  try { await expect(login.credential).rejects.toThrow('Sign-in was not completed') }
  finally { login.cancel() }
})

it('still reads the dedicated file produced by a nonterminal login', async () => {
  const credential = JSON.stringify({ tokens: { access_token: 'fixture-codex' } })
  const command = cli(`
    const { writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    writeFileSync(join(process.env.CODEX_HOME, 'auth.json'), ${JSON.stringify(credential)});
  `)
  const login = startLocalLogin('codex', command)
  try { expect(await login.credential).toBe(credential) }
  finally { login.cancel() }
})
