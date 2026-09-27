// Windows has no /bin/sh to wrap a detached launch, so this stands in for the sh wrapper there.
// Written beside Quuu's data under a content-addressed name and run by Quuu's own runtime
// (ELECTRON_RUN_AS_NODE). Only Node built-ins: rebuilding Quuu must not change the code
// underneath an agent that is still running.
import { spawn } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { win32 } from 'node:path'

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/** cmd.exe's own metacharacters, escaped with `^` so it reads them as text (cross-spawn's set). */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g

/** Windows environment names are case-insensitive, and a spread `process.env` keeps whichever case it had. */
export function envValue(env, name) {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Where `command` resolves on PATH, the way cmd.exe finds it: every PATHEXT extension is tried,
 * because `claude` is `claude.exe` from one installer and `claude.cmd` from npm.
 * Node's own lookup only tries `.com` / `.exe`.
 */
export function findWindowsCommand(command, env, exists = isFile) {
  const exts = (envValue(env, 'PATHEXT') || DEFAULT_PATHEXT).split(';').filter(Boolean)
  const hasExt = exts.some((ext) => command.toLowerCase().endsWith(ext.toLowerCase()))
  // An extensionless file is never what cmd.exe would run, so a bare name only means name + PATHEXT.
  const names = hasExt ? [command] : exts.map((ext) => command + ext.toLowerCase())
  const candidates = (dir) => names.map((name) => (dir ? win32.join(dir, name) : name))
  if (/[\\/]/.test(command)) {
    return candidates('').find((path) => exists(path)) ?? null
  }
  for (const dir of (envValue(env, 'PATH') || '').split(';')) {
    if (!dir) continue
    const hit = candidates(dir.replace(/^"(.*)"$/, '$1')).find((path) => exists(path))
    if (hit) return hit
  }
  return null
}

/**
 * The file an npm / pnpm / yarn `.cmd` shim runs, relative to the shim.
 *
 * Batch files cannot carry a newline in an argument, and a prompt is mostly newlines, so a shim
 * is looked through instead of run: `claude.cmd` becomes `node …\cli.js`.
 */
export function shimTarget(source) {
  const matches = [...source.matchAll(/"%(?:~dp0|dp0%)\\([^"]+)"\s*%\*/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}

/** One argument through cmd.exe to a program that splits its command line the MSVC way. */
export function cmdArgument(value, doubleEscape = false) {
  let arg = String(value)
  arg = arg.replace(/(\\*)"/g, '$1$1\\"')
  arg = arg.replace(/(\\*)$/, '$1$1')
  arg = `"${arg}"`.replace(CMD_META, '^$1')
  return doubleEscape ? arg.replace(CMD_META, '^$1') : arg
}

/**
 * How to actually start `command args` on Windows: a real file to spawn, never a shell line
 * built from untrusted text unless the target is itself a batch file nobody can see through.
 */
export function resolveWindowsLaunch(command, args, env, fs = { exists: isFile, read: (path) => readFileSync(path, 'utf8') }) {
  const found = findWindowsCommand(command, env, fs.exists) ?? command
  const comspec = envValue(env, 'COMSPEC') || 'cmd.exe'
  const name = win32.basename(found).toLowerCase()

  // A shell command (a hook, say) is already a cmd.exe line; it goes through untouched.
  if ((name === 'cmd.exe' || name === 'cmd') && args.length > 0 && args[args.length - 2]?.toLowerCase() === '/c') {
    return { file: found, args: [...args.slice(0, -1), `"${args[args.length - 1]}"`], verbatim: true }
  }

  const ext = win32.extname(found).toLowerCase()
  if (ext !== '.cmd' && ext !== '.bat') return { file: found, args, verbatim: false }

  let target = null
  try {
    target = shimTarget(fs.read(found))
  } catch {
    // Unreadable: fall through to cmd.exe
  }
  if (target) {
    const resolved = win32.resolve(win32.dirname(found), target)
    if (/\.exe$/i.test(resolved) && fs.exists(resolved)) return { file: resolved, args, verbatim: false }
    if (/\.[cm]?js$/i.test(resolved) && fs.exists(resolved)) {
      const bundled = win32.join(win32.dirname(found), 'node.exe')
      const node = fs.exists(bundled) ? bundled : findWindowsCommand('node', env, fs.exists) ?? 'node'
      return { file: node, args: [resolved, ...args], verbatim: false }
    }
  }

  // Last resort: through cmd.exe, escaped the way cross-spawn does it for batch files.
  const line = [found.replace(CMD_META, '^$1'), ...args.map((arg) => cmdArgument(arg, true))].join(' ')
  return { file: comspec, args: ['/d', '/s', '/c', `"${line}"`], verbatim: true }
}

/**
 * The wrapper itself: run the launch, leave its exit code in `QUUU_EXIT_FILE` (and this process's
 * pid in `QUUU_HOOK_PID_FILE` first, when asked), then exit with that same code.
 */
export async function run(argv = process.argv.slice(2), env = process.env) {
  // The agent is not Quuu; only this wrapper needed to run as Node.
  delete env.ELECTRON_RUN_AS_NODE
  const pidFile = env.QUUU_HOOK_PID_FILE
  if (pidFile) writeFileSync(pidFile, String(process.pid))
  const [command, ...args] = argv
  const launch = resolveWindowsLaunch(command ?? '', args, env)
  const code = await new Promise((resolve) => {
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const child = spawn(launch.file, launch.args, {
        stdio: 'inherit',
        env,
        windowsHide: true,
        windowsVerbatimArguments: launch.verbatim
      })
      child.once('error', (error) => {
        process.stderr.write(`\n[spawn error] ${error.message}\n`)
        settle(127)
      })
      child.once('exit', (exitCode) => settle(exitCode ?? 1))
    } catch (error) {
      process.stderr.write(`\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`)
      settle(127)
    }
  })
  if (env.QUUU_EXIT_FILE) {
    try {
      writeFileSync(env.QUUU_EXIT_FILE, String(code))
    } catch {
      // Same as the sh wrapper: a missing exit file only means the exit event decides
    }
  }
  process.exit(code)
}
