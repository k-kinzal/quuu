export interface AdapterLayout {
  /**
   * Can the session ID Quuu minted be handed to the CLI?
   *
   *   claude ... `--session-id <uuid>`
   *   grok   ... `-s <uuid>` (new sessions only; resume is `-r`)
   *   cursor ... `--resume <uuid>` (an ID that does not exist is created under that ID)
   *
   * CLIs that cannot take one (codex / copilot) have the ID they chose picked up afterwards.
   * A lie here makes `--resume` point at a session that does not exist, and no conversation shows.
   */
  readonly acceptsSessionId: boolean
  resolve?(cwd: string, sessionId: string): string | null
  scan?(sessionId: string): string | null
  /** The root where sessions live. The path is returned even when it does not exist. */
  root(): string
  /**
   * Where the sessions for a cwd live.
   * Answers with the directory alone, so a watch can be set up before any log exists.
   * null for CLIs that do not key on cwd (copilot).
   */
  dirFor(cwd: string): string | null
  /** The log path implied by cwd and sessionId. null when it cannot be assembled. */
  logPathFor(cwd: string, sessionId: string): string | null
  /**
   * Companion files written alongside the log itself.
   *
   * Some layouts cannot answer "when was it last written" from the main file's mtime alone, so
   * the ones listed here are checked too and the **newest timestamp** wins (`lastWrittenMs`).
   * Adapters with no companions may omit it.
   */
  companions?(logPath: string): string[]
  /**
   * Is the whole conversation re-read on every change, instead of followed from a byte offset?
   *
   * True for the two layouts that keep their content in SQLite (cursor / opencode): rows are
   * rewritten as a turn streams in, so "read on from where we stopped" reads nothing at all.
   */
  readonly wholeStore?: boolean
  /**
   * Does **one file hold every session**? (opencode alone.)
   *
   * Everywhere else a path names a session. Where it does not, anything keyed by path - the
   * materialized conversation pages above all - has to carry the session id as well.
   */
  readonly oneStore?: boolean
  /**
   * When that one session was last written.
   * Only a shared store needs it: elsewhere the file's own timestamp already answers.
   */
  lastWrittenFor?(sessionId: string): number | null
}