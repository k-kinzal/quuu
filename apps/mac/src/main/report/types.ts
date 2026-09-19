/**
 * The change report attached to a task.
 *
 * A report is written by an agent, one per task, and describes **the layer above the diff** —
 * which concept became which, which relationship moved, which rule now says something else.
 * Quuu owns when one is generated and where it is kept; the page itself is the agent's output.
 */

export type ReportStatus = 'generating' | 'ready' | 'failed'

/** What a reader is shown. Nothing here names a process. */
export interface TaskReport {
  taskId: string
  status: ReportStatus
  /**
   * The worktree the report describes (a Git tree hash). Empty when Git could not be read.
   *
   * Compared against the review's current head so a report written before the last change can
   * say so. A stale report that looks current is worse than none: it is read as the truth.
   * It also decides whether reaching review again writes one at all: the same tree gets no
   * second report.
   */
  revision: string
  /**
   * The page to display. **Stays pointed at the last readable report while a new one is being
   * written**, so regenerating never blanks the surface you were reading.
   */
  path: string
  /** The generator's own output. What a person opens when a report failed or reads wrong. */
  logPath: string
  /** Why the last generation failed, or what was odd about one that still produced a page. */
  error: string
  startedAt: string
  endedAt: string | null
}

/**
 * What the running generation left behind.
 *
 * Agents outlive Quuu by design (`execution/runner.ts`), and whatever writes a report is an
 * agent too. Keeping the pid, the page being written and the exit file **in the database**
 * is what lets the next launch settle a generation that finished while the app was gone.
 */
export interface StoredReport extends TaskReport {
  /** Where the generator ran. Import needs it to tell a report apart from work someone did. */
  cwd: string
  pid: number | null
  /** The page the running generation writes. It becomes `path` only once it exists. */
  pending: string
  exitPath: string
}
