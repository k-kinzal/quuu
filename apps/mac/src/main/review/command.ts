import { execFile } from 'node:child_process'
import { t } from '../i18n/index.js'

const MAX_OUTPUT = 8 * 1024 * 1024

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

export function command(
  executable: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number }
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    execFile(
      executable,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout ?? 15_000,
        maxBuffer: MAX_OUTPUT,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error instanceof Error ? error : new Error(t('review.commandFailed')))
          return
        }
        resolveResult({
          stdout,
          stderr,
          code: error && typeof error.code === 'number' ? error.code : 0
        })
      }
    )
  })
}

export async function git(
  cwd: string,
  args: string[],
  timeout?: number,
  env?: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return command('/usr/bin/git', ['-c', 'color.ui=false', ...args], { cwd, timeout, env })
}

