import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export function hasUpdateSignature(details: string): boolean {
  // Ad-hoc signatures pin the current binary's hash and cannot authenticate a later build.
  return /^Authority=.+$/m.test(details) && !/^Signature=adhoc$/m.test(details)
}

export async function isSignedForUpdates(bundle: string): Promise<boolean> {
  try {
    const { stderr } = await execute('/usr/bin/codesign', ['--display', '--verbose=2', bundle], { timeout: 10_000 })
    return hasUpdateSignature(stderr)
  } catch {
    return false
  }
}
