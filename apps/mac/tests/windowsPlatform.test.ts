import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cliForCommand, commandName } from '../src/main/agent-clis/registry.js'
import { menuForPlatform, platformAccelerator } from '../src/main/menuPlatform.js'
import { detachedLaunch } from '../src/main/platform/detachedLaunch.js'
import { isAbsolutePath } from '../src/main/platform/pathText.js'
import { withPath } from '../src/main/platform/processEnv.js'
import { batchQuote, windowsTerminalScript } from '../src/main/platform/terminal.js'
import { cmdArgument, findWindowsCommand, resolveWindowsLaunch, shimTarget } from '../src/main/platform/windowsLaunch.mjs'
import { compactPath, lastSegment, relativeToCwd } from '../src/renderer/src/model/paths.js'
import { shortcutLabel, stringsForKeyboard } from '../src/renderer/src/model/shortcuts.js'
import { fileLockHeld, processStartedAt } from '../src/main/platform/processProbe.js'
import { compareVersions, pendingUpdate, windowsFeedName } from '../src/main/updates/windowsFeed.js'
import { enStrings } from '@design-system/react'

/**
 * Windows has no /bin/sh, no process groups, and spells one program three ways (`claude`,
 * `claude.exe`, `claude.cmd`). What is guarded here are the rules Quuu launches agents by there.
 * They are pure, so they are held on every platform the suite runs on.
 */

/** A fake disk: the Windows paths that exist, and what the batch files among them say. */
function disk(files: Record<string, string>) {
  const known = new Map(Object.entries(files).map(([path, body]) => [path.toLowerCase(), body]))
  return {
    exists: (path: string) => known.has(path.toLowerCase()),
    read: (path: string) => {
      const body = known.get(path.toLowerCase())
      if (body === undefined) throw new Error(`ENOENT ${path}`)
      return body
    }
  }
}

const NPM_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
  ''
].join('\r\n')

const NPM = 'C:\\Users\\me\\AppData\\Roaming\\npm'
const NODE = 'C:\\Program Files\\nodejs'
const env = { Path: `${NPM};${NODE}`, PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\system32\\cmd.exe' }

describe('finding a command on a Windows PATH', () => {
  it('tries every PATHEXT extension, in PATHEXT order, because npm installs `claude` as claude.cmd', () => {
    const fs = disk({ [`${NPM}\\claude.cmd`]: NPM_SHIM, [`${NPM}\\claude.exe`]: '' })
    expect(findWindowsCommand('claude', env, fs.exists)).toBe(`${NPM}\\claude.exe`)
    expect(findWindowsCommand('claude', env, disk({ [`${NPM}\\claude.cmd`]: NPM_SHIM }).exists)).toBe(`${NPM}\\claude.cmd`)
  })

  it('takes the first PATH directory that has it, and reads Path whatever its case', () => {
    const fs = disk({ [`${NPM}\\node.cmd`]: '', [`${NODE}\\node.exe`]: '' })
    expect(findWindowsCommand('node', env, fs.exists)).toBe(`${NPM}\\node.cmd`)
  })

  it('never takes an extensionless file cmd.exe would not run', () => {
    expect(findWindowsCommand('codex', env, disk({ [`${NPM}\\codex`]: '#!/bin/sh' }).exists)).toBeNull()
  })
})

describe('starting a command on Windows', () => {
  it('looks through an npm shim to the script, so a multi-line prompt never passes through cmd.exe', () => {
    const script = `${NPM}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`
    const fs = disk({ [`${NPM}\\claude.cmd`]: NPM_SHIM, [script]: '', [`${NODE}\\node.exe`]: '' })
    expect(shimTarget(NPM_SHIM)).toBe('node_modules\\@anthropic-ai\\claude-code\\cli.js')
    expect(resolveWindowsLaunch('claude', ['-p', 'line one\nline two'], env, fs)).toEqual({
      file: `${NODE}\\node.exe`,
      args: [script, '-p', 'line one\nline two'],
      verbatim: false
    })
  })

  it('prefers the node.exe an npm shim ships beside itself', () => {
    const script = `${NPM}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`
    const fs = disk({ [`${NPM}\\claude.cmd`]: NPM_SHIM, [script]: '', [`${NPM}\\node.exe`]: '', [`${NODE}\\node.exe`]: '' })
    expect(resolveWindowsLaunch('claude', [], env, fs).file).toBe(`${NPM}\\node.exe`)
  })

  it('runs a native binary a shim points at directly', () => {
    const shim = '@ECHO off\r\n"%~dp0\\node_modules\\@openai\\codex\\bin\\codex.exe" %*\r\n'
    const binary = `${NPM}\\node_modules\\@openai\\codex\\bin\\codex.exe`
    const fs = disk({ [`${NPM}\\codex.cmd`]: shim, [binary]: '' })
    expect(resolveWindowsLaunch('codex', ['exec'], env, fs)).toEqual({ file: binary, args: ['exec'], verbatim: false })
  })

  it('hands an .exe its arguments as they are', () => {
    const fs = disk({ [`${NPM}\\claude.exe`]: '' })
    expect(resolveWindowsLaunch('claude', ['a b', 'c"d'], env, fs)).toEqual({ file: `${NPM}\\claude.exe`, args: ['a b', 'c"d'], verbatim: false })
  })

  it('passes a shell hook to cmd.exe untouched, as one quoted line', () => {
    const launch = resolveWindowsLaunch(env.ComSpec, ['/d', '/s', '/c', 'npm test && echo done'], env, disk({ [env.ComSpec]: '' }))
    expect(launch).toEqual({ file: env.ComSpec, args: ['/d', '/s', '/c', '"npm test && echo done"'], verbatim: true })
  })

  it('escapes every argument for cmd.exe when a batch file cannot be seen through', () => {
    const fs = disk({ [`${NPM}\\tool.bat`]: '@echo off\r\nsomething %*\r\n' })
    const launch = resolveWindowsLaunch('tool', ['a&b', '100%'], env, fs)
    expect(launch.file).toBe(env.ComSpec)
    expect(launch.verbatim).toBe(true)
    expect(launch.args.slice(0, 3)).toEqual(['/d', '/s', '/c'])
    // Double-escaped: once for this command line, once for the batch file's own %*
    expect(launch.args[3]).toContain('^^^"a^^^&b^^^"')
    expect(launch.args[3]).toContain('^^^"100^^^%^^^"')
  })

  it('quotes an argument the way programs split a Windows command line', () => {
    expect(cmdArgument('say "hi"')).toBe('^"say^ \\^"hi\\^"^"')
    expect(cmdArgument('dir\\')).toBe('^"dir\\\\^"')
  })
})

describe('the process that wraps a detached launch', () => {
  const realPlatform = process.platform
  let dir: string | null = null
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform })
    vi.unstubAllEnvs()
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('is the sh wrapper on macOS, with the launch as "$@"', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(detachedLaunch('"$@"', 'Quuu', ['claude', '-p', 'x'])).toEqual({
      command: '/bin/sh',
      args: ['-c', '"$@"', 'Quuu', 'claude', '-p', 'x'],
      env: {}
    })
  })

  it("is Quuu's own runtime on Windows, running a copy named by its content so a rebuild never rewrites a running one", () => {
    dir = mkdtempSync(join(tmpdir(), 'quuu-win-launch-'))
    vi.stubEnv('QUUU_USER_DATA', dir)
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const launch = detachedLaunch('"$@"', 'Quuu', ['claude', '-p', 'x'])
    expect(launch.command).toBe(process.execPath)
    expect(launch.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    expect(launch.args.slice(1)).toEqual(['claude', '-p', 'x'])
    expect(launch.args[0]).toMatch(/launch-[0-9a-f]{16}\.mjs$/)
    const written = readFileSync(launch.args[0], 'utf8')
    expect(written).toContain('QUUU_EXIT_FILE')
    expect(written.trimEnd().endsWith('await run()')).toBe(true)
  })
})

describe('the environment an agent is started with', () => {
  it('carries exactly one PATH, even when the inherited one is spelled Path', () => {
    const next = withPath({ Path: 'C:\\old', HOME: 'x' }, 'C:\\new')
    expect(Object.keys(next).filter((key) => key.toUpperCase() === 'PATH')).toEqual(['PATH'])
    expect(next.PATH).toBe('C:\\new')
    expect(next.HOME).toBe('x')
  })
})

describe('shortcuts on Windows', () => {
  it('puts Ctrl where macOS has ⌘', () => {
    expect(platformAccelerator('Cmd+N', 'win32')).toBe('Ctrl+N')
    expect(platformAccelerator('Cmd+Shift+D', 'win32')).toBe('Ctrl+Shift+D')
    expect(platformAccelerator('Cmd+Alt+Return', 'win32')).toBe('Ctrl+Alt+Return')
  })

  it('gives ⌘⌃ its own key rather than collapsing it into Ctrl', () => {
    expect(platformAccelerator('Cmd+Ctrl+2', 'win32')).toBe('Alt+2')
  })

  it('keeps Ctrl+Backspace for deleting a word in inputs', () => {
    expect(platformAccelerator('Cmd+Backspace', 'win32')).not.toBe('Ctrl+Backspace')
  })

  it('leaves the macOS menu exactly as written', () => {
    const template = [{ label: 'Window', submenu: [{ role: 'zoom' as const }, { label: 'x', accelerator: 'Cmd+1' }] }]
    expect(menuForPlatform(template, 'darwin')).toBe(template)
  })

  it('drops the rows only macOS can carry out, at every level', () => {
    const menu = menuForPlatform([
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }, { label: 'x', accelerator: 'Cmd+1' }] }
    ], 'win32')
    expect(menu[0].submenu).toEqual([{ role: 'minimize' }, { label: 'x', accelerator: 'Ctrl+1' }])
  })
})

describe('reading Windows paths', () => {
  it('counts drive and network paths as absolute, so a session recorded on Windows keeps its directory', () => {
    expect(isAbsolutePath('C:\\Users\\me\\src')).toBe(true)
    expect(isAbsolutePath('d:/work')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share')).toBe(true)
    expect(isAbsolutePath('/Users/me')).toBe(true)
    expect(isAbsolutePath('src\\app')).toBe(false)
    expect(isAbsolutePath('C:relative')).toBe(false)
  })

  it('knows a CLI by name whatever path and extension Windows gives it', () => {
    expect(commandName('C:\\Users\\me\\.local\\bin\\claude.exe')).toBe('claude')
    expect(commandName('codex.cmd')).toBe('codex')
    expect(cliForCommand('C:\\npm\\claude.cmd')?.command).toBe('claude')
  })

  it('names a project after its folder', () => {
    expect(lastSegment('C:\\Users\\me\\src\\quuu\\')).toBe('quuu')
    expect(lastSegment('/Users/me/src/quuu')).toBe('quuu')
  })

  it('shows a file relative to a Windows project and shortens it at its own separator', () => {
    expect(relativeToCwd('C:\\src\\app\\lib\\a.ts', 'C:\\src\\app')).toBe('lib\\a.ts')
    expect(compactPath('C:\\src\\app\\packages\\core\\lib\\deep\\nested\\file.ts', 30)).toBe('C:\\src\\app\\packages\\…\\file.ts')
  })
})

describe('the script an external terminal on Windows runs', () => {
  it('quotes each word for a batch file, so a % in a path is not read as a variable', () => {
    expect(batchQuote('C:\\100% done')).toBe('"C:\\100%% done"')
    expect(batchQuote('say "hi"')).toBe('"say ""hi"""')
  })

  it('moves into the directory, runs the command, then keeps a shell open', () => {
    const script = windowsTerminalScript({
      cwd: 'C:\\src\\app',
      command: 'C:\\tools\\claude.exe',
      args: ['--resume', 'abc'],
      title: 'Fix <bug> & ship',
      path: 'C:\\tools',
      shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    })
    const lines = script.split('\r\n')
    expect(lines).toContain('cd /d "C:\\src\\app" || exit /b 1')
    expect(lines).toContain('title Fix ^<bug^> ^& ship')
    expect(lines).toContain(`"${win32.normalize('C:\\tools\\claude.exe')}" "--resume" "abc"`)
    expect(lines.at(-2)).toBe('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo')
  })
})

describe('shortcut hints', () => {
  const menus = readFileSync(join(import.meta.dirname, '..', 'src/main/menus.ts'), 'utf8')
  const accelerators = [...new Set([...menus.matchAll(/accelerator: [`']([^`']+)[`']/g)].map((m) => m[1].replace('${value}', '1').replace('${i + 3}', '3')))]

  it('reads the menu (without that, the agreement below means nothing)', () => {
    expect(accelerators).toContain('Cmd+N')
    expect(accelerators.length).toBeGreaterThan(20)
  })

  it('names on Windows exactly the keys the Windows menu answers to', () => {
    for (const accelerator of accelerators) {
      expect(shortcutLabel(accelerator, false)).toBe(platformAccelerator(accelerator, 'win32').replace('Return', 'Enter'))
    }
  })

  it('keeps the macOS glyphs as they have always read', () => {
    expect(shortcutLabel('Cmd+N', true)).toBe('⌘N')
    expect(shortcutLabel('Cmd+Shift+N', true)).toBe('⌘⇧N')
    expect(shortcutLabel('Cmd+Alt+Return', true)).toBe('⌘⌥⏎')
    expect(shortcutLabel('Cmd+Enter', true)).toBe('⌘↵')
    expect(shortcutLabel('Cmd+Enter', false)).toBe('Ctrl+Enter')
  })

  it("hands the design system its own copy with key names on a Windows keyboard, and untouched on a Mac's", () => {
    expect(stringsForKeyboard(enStrings, true)).toBe(enStrings)
    const pc = stringsForKeyboard(enStrings, false)
    expect(pc.resizer.horizontalTitle('Width')).toBe(enStrings.resizer.horizontalTitle('Width').replace('⇧', 'Shift'))
    expect(pc.dataTable.columnTitle('Name', true)).not.toMatch(/[⇧⏎]/)
    expect(pc.toast.dismiss).toBe(enStrings.toast.dismiss)
  })
})

describe('the Windows update feed', () => {
  const feed = (version: string, url = `https://github.com/k-kinzal/quuu/releases/download/x/Quuu-${version}-win-x64-setup.exe`) => ({
    currentRelease: version,
    releases: [{ version, updateTo: { version, name: `Quuu ${version}`, url, sha256: 'a'.repeat(64), size: 10 } }]
  })

  it('sits beside the Mac feeds under its own name per architecture', () => {
    expect(windowsFeedName('x64')).toBe('RELEASES-win32-x64.json')
    expect(windowsFeedName('arm64')).toBe('RELEASES-win32-arm64.json')
  })

  it('compares dated versions as numbers, not text', () => {
    expect(compareVersions('2026.10.1', '2026.9.30')).toBe(1)
    expect(compareVersions('2026.9.27', '2026.9.27')).toBe(0)
    expect(compareVersions('2025.12.31', '2026.1.1')).toBe(-1)
  })

  it('offers only a newer release', () => {
    expect(pendingUpdate(feed('2026.10.1'), '2026.9.30')?.version).toBe('2026.10.1')
    expect(pendingUpdate(feed('2026.9.30'), '2026.9.30')).toBeNull()
    expect(pendingUpdate(feed('2026.9.1'), '2026.9.30')).toBeNull()
  })

  it('refuses an installer from anywhere but GitHub', () => {
    expect(() => pendingUpdate(feed('2026.10.1', 'https://example.com/Quuu-setup.exe'), '2026.9.30')).toThrow()
  })
})

describe('whether another process holds a file lock', () => {
  it('tells a held lock from a free one, which is how a running Codex thread is told from debris', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quuu-lock-'))
    const path = join(dir, 'thread.lock')
    writeFileSync(path, '')
    try {
      expect(fileLockHeld(path)).toBe(false)
      if (process.platform !== 'darwin') return
      const holder = spawn('/usr/bin/lockf', ['-k', path, '/bin/sleep', '30'], { stdio: 'ignore' })
      try {
        await vi.waitFor(() => expect(fileLockHeld(path)).toBe(true), { timeout: 5000 })
      } finally {
        holder.kill('SIGKILL')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('when another process started', () => {
  it("reads a live process's start, to tell it from a later process that reused its pid", () => {
    const started = processStartedAt(process.pid)
    expect(started).not.toBeNull()
    // ps reports whole seconds
    expect(Math.abs(started! - (Date.now() - process.uptime() * 1000))).toBeLessThan(3000)
  })

  it('has no answer for a process that is gone', () => {
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    expect(processStartedAt(gone)).toBeNull()
  })
})
