/**
 * The environment with PATH replaced.
 *
 * Windows keeps the name as `Path`, and a spread `process.env` loses its case-insensitivity, so a
 * plain `PATH:` beside it would hand the child two PATHs and leave which one wins to chance.
 */
export function withPath(env: NodeJS.ProcessEnv, path: string): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() !== 'PATH') next[key] = value
  }
  next.PATH = path
  return next
}

/**
 * ELECTRON_RUN_AS_NODE for a child: set only when the child is Quuu's own executable, which is
 * then running a script (the GitHub App supervisor) rather than opening a second Quuu. Any other
 * program launched from Electron must not inherit it.
 */
export function runtimeEnv(executable: string): NodeJS.ProcessEnv {
  return { ELECTRON_RUN_AS_NODE: executable === process.execPath ? '1' : undefined }
}
