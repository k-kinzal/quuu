/**
 * Is this text an absolute path, on either platform a session log may have been written on?
 *
 * Provider logs record the working directory as text. A check for a leading `/` alone reads every
 * Windows directory (`C:\Users\…`, `\\server\share`) as relative and drops it.
 */
export function isAbsolutePath(value: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
}
