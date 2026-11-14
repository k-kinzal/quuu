import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { BoundedOutput, writeOutputSnapshot } from './boundedOutput.mjs'
import { resolveWindowsLaunch } from './windowsLaunch.mjs'

/** This collector belongs to the detached process group, not to the desktop's lifetime. */
export function capture(argv = process.argv.slice(2)) {
  const [path, command, ...args] = argv
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  const output = new BoundedOutput()
  let timer = null
  let finished = false
  let exitTimer = null
  let code = 1
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    writeOutputSnapshot(path, output.snapshot())
  }
  const append = chunk => {
    output.append(chunk)
    if (!timer) timer = setTimeout(flush, 250)
  }
  const finish = () => {
    if (finished) return
    finished = true
    if (exitTimer) clearTimeout(exitTimer)
    // Publish the final output before the exit receipt; recovery can see the receipt immediately.
    flush()
    if (env.QUUU_EXIT_FILE) writeFileSync(env.QUUU_EXIT_FILE, String(code), { mode: 0o600 })
    process.exit(code)
  }
  // Signals reach the entire group. Keep its leader alive until the child has finished so
  // cancellation still reaches grandchildren, including the GitHub credential supervisor.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => {})
  flush()
  if (env.QUUU_HOOK_PID_FILE) writeFileSync(env.QUUU_HOOK_PID_FILE, String(process.pid), { mode: 0o600 })
  const launch = process.platform === 'win32' ? resolveWindowsLaunch(command, args, env) : { file: command, args, verbatim: false }
  const own = process.platform === 'win32' ? launch.file.toLowerCase() === process.execPath.toLowerCase() : launch.file === process.execPath
  let child
  try {
    child = spawn(launch.file, launch.args, {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, windowsVerbatimArguments: launch.verbatim,
      env: own ? { ...env, ELECTRON_RUN_AS_NODE: '1' } : env
    })
  } catch (error) {
    append(`\n[spawn error] ${error instanceof Error ? error.message : String(error)}\n`)
    code = 127
    finish()
    return
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.once('error', error => { append(`\n[spawn error] ${error.message}\n`); code = 127; finish() })
  child.once('exit', exitCode => {
    code = exitCode ?? 1
    // A background grandchild may keep the pipes open. Drain queued output, but do not wait
    // indefinitely for that grandchild before settling the actual agent.
    exitTimer = setTimeout(finish, 100)
  })
  child.once('close', finish)
}
