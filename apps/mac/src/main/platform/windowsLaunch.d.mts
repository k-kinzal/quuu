export interface WindowsLaunch {
  file: string
  args: string[]
  /** Pass `args` to CreateProcess as written (`windowsVerbatimArguments`). */
  verbatim: boolean
}
export function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined
export function findWindowsCommand(command: string, env: NodeJS.ProcessEnv, exists?: (path: string) => boolean): string | null
export function shimTarget(source: string): string | null
export function cmdArgument(value: string, doubleEscape?: boolean): string
export function resolveWindowsLaunch(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  fs?: { exists: (path: string) => boolean; read: (path: string) => string }
): WindowsLaunch
export function run(argv?: string[], env?: NodeJS.ProcessEnv): Promise<void>
