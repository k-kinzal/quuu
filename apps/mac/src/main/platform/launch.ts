import { execFile } from 'node:child_process'

/**
 * Wake an app (`open(1)` = LaunchServices).
 *
 * **No AppleScript.** Sending commands to another app via `osascript` demands
 * the Automation permission ("Quuu wants to control Terminal"). Denied, nothing
 * happens — and the person who clicked never sees why. Worse, the permission
 * dialog can only appear while Quuu is frontmost, which clashes with leaving it
 * running unattended.
 *
 * `open` is the same path as double-clicking in Finder, so no permission is needed.
 */
export function launch(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // err is an `ExecFileException` (extends Error, but a distinct type on paper)
    execFile('/usr/bin/open', args, (err) =>
      err ? reject(new Error(err.message)) : resolve()
    )
  })
}
