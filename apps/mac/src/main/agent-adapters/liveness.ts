export interface ProviderLiveness {
  has(sessionId: string): boolean
  confirmed(sessionId: string): boolean | null
  authoritative(sessionId: string): boolean
  finished(sessionId: string): boolean
}
export const NO_LIVENESS: ProviderLiveness = { has: () => false, confirmed: () => null, authoritative: () => false, finished: () => false }
export interface Probed {
  ids: Set<string>
  /** Was the directory itself readable? If not, this environment lacks the mechanism. */
  present: boolean
}
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
