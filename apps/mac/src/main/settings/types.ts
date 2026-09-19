import type { RunTargetKind } from '../agents/types.js'
import type { CommitIdentity } from './identity.js'
import { EMPTY_COMMIT_IDENTITY } from './identity.js'

export interface AppSettings {
  /** Start the scheduler automatically at app launch. */
  autoStartScheduler: boolean
  /** Keep running in the background after the window is closed. */
  keepRunningInBackground: boolean
  /** Notify when something lands in review. */
  notifyOnReview: boolean
  /** Notify on failure. */
  notifyOnFailure: boolean
  /** Scheduler tick interval (milliseconds). */
  tickIntervalMs: number
  /** Import sessions from directly launched AI CLIs (IMPORTABLE_ADAPTERS). */
  importExternalSessions: boolean
  /** How many days of past logs to import. 0 means everything. */
  importHistoryDays: number
  /** On import, auto-create projects from unregistered working directories. */
  importCreateProjects: boolean
  /** Pass the GitHub App identity to agents. Can be turned off per project. */
  commitIdentityEnabled: boolean
  /** The default identity. Differs only when a project chose `custom`. */
  commitIdentity: CommitIdentity
  /**
   * IDE / editor used to open tasks (absolute path to the `.app`). Empty means undecided.
   * A project can pick a different one (`Project.editorApp`).
   */
  editorApp: string
  /**
   * Talk to the iPhone app over iCloud Drive.
   *
   * **On by default. The location is fixed too** (`iCloud Drive/Quuu`).
   * Every setting you add creates a "which folder is it" step that Mac and iPhone
   * both have to get right, and if just one side drifts, sync silently stops.
   * With a fixed location there is no matching step at all.
   *
   * Kept for people who want it off, but never asked about by default.
   */
  mobileSyncEnabled: boolean
  /**
   * Write a change report when a task reaches review.
   *
   * Off until a writer is named, because the feature is one agent run per review and that is
   * not a cost to start incurring on someone's behalf. A project can opt out
   * (`Project.reportEnabled`).
   */
  reportEnabled: boolean
  /**
   * Whether the writer named below is one agent or a group.
   *
   * A group is the answer to a different question than a name is: **"whoever can take it"**.
   * The agents doing the work are busy, and a report is exactly the job to hand to whichever
   * one is free, so the same choice a project makes about its runs is offered here.
   */
  reportTargetKind: RunTargetKind
  /** The agent or group that writes reports. Empty means undecided. */
  reportTargetId: string
  /**
   * Added to the end of the instructions handed to that agent.
   *
   * **What a report should contain is still being found out**, and the answer lives in the
   * prompt, not in the code. Leaving it editable is what lets that question be worked on
   * without a rebuild between each attempt.
   */
  reportInstructions: string
  theme: 'dark' | 'light' | 'system'
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStartScheduler: true,
  keepRunningInBackground: true,
  notifyOnReview: true,
  notifyOnFailure: true,
  tickIntervalMs: 3000,
  importExternalSessions: true,
  importHistoryDays: 14,
  importCreateProjects: true,
  commitIdentityEnabled: false,
  commitIdentity: EMPTY_COMMIT_IDENTITY,
  editorApp: '',
  mobileSyncEnabled: true,
  reportEnabled: false,
  reportTargetKind: 'agent',
  reportTargetId: '',
  reportInstructions: '',
  theme: 'dark'
}
