import { create } from 'zustand'
import { FileUnavailableError, ShellOutdatedError } from '../bridge/contract.js'
import type { Bridge, FolderState } from '../bridge/contract.js'
import { createBridge } from '../bridge/index.js'
import type { Drafts } from '../lib/drafts.js'
import { loadDrafts, pruneDrafts, saveDrafts, setDraftIn } from '../lib/drafts.js'
import { t } from '../model/i18n/index.js'
import type { TaskScope } from '../model/scope.js'
import { ALL_TASKS } from '../model/scope.js'
import type { AddAction } from '../sync/addAction.js'
import { intentFileName } from '../sync/layout.js'
import type { SyncTaskView, SyncView } from '../sync/projection.js'
import { parseIntent } from '../sync/readIntent.js'
import { parseDetail, parseSnapshot } from '../sync/readSnapshot.js'
import { parseReceipts } from '../sync/receipts.js'

import { projectView } from '../sync/projection.js'
import type { SyncIntent, SyncOp, SyncSnapshot, SyncTaskDetail } from '../sync/protocol.js'
import { EMPTY_SNAPSHOT } from '../sync/protocol.js'
import type { Priority } from '../sync/task.js'
import { makeIntent } from '../sync/writeIntent.js'

/**
 * iPhone-side state.
 *
 * The truth lives on the Mac. What this holds is
 *
 *   1. the last snapshot we read
 *   2. **the intents we placed that have not been taken in yet**
 *
 * and the screen shows the overlay of the two (`projectView`).
 * If we don't draw the result of a tap right away, the screen sits still
 * for the whole iCloud round trip — and **the button gets tapped again**.
 *
 * Unapplied intents ARE the files in `phone/intents/`. We keep no separate
 * copy, so they survive the app being killed and can never disagree with
 * a duplicate.
 */

export type Screen =
  | { kind: 'list' }
  | { kind: 'task'; taskId: string }
  | { kind: 'compose' }
  | { kind: 'settings' }

/**
 * What we are in the middle of. **Separates "stuck" from "taking a while".**
 *
 * We used to represent "did it load" with a single timestamp (`loadedAt`).
 * When the folder was unconfigured or unreadable we bailed out without ever
 * setting it, so the screen **showed "loading" forever**. To a person that
 * is indistinguishable from a hang — and it gives no hint of what to do next.
 *
 * Hold what is happening as a type, and **give every state a next move**.
 */
export type Phase =
  /** Still connecting to the shell */
  | 'starting'
  /**
   * No permission yet to enter the handoff folder.
   *
   * **Not a state where the user picks anything.** The destination is fixed;
   * iOS merely asks for permission to leave the sandbox. When we land here,
   * open the OS sheet directly instead of showing a screen of our own.
   */
  | 'needsAccess'
  /**
   * We showed the permission sheet and were turned down.
   *
   * **Don't silently keep spinning.** Leave one button to press. This is the
   * one place that needs a human (the OS never grants permission on its own).
   */
  | 'declined'
  /** Reading right now */
  | 'loading'
  /** Read succeeded */
  | 'ready'
  /** Went to read and failed */
  | 'failed'

/** An operation that was not applied. Hand it back to whoever tapped. */
export interface Rejected {
  intentId: string
  taskId: string
  reason: string
  at: string
}

interface State {
  ready: boolean
  bridge: Bridge | null
  device: string
  folder: FolderState
  snapshot: SyncSnapshot
  /** File name → intent. We need the name when cleaning up */
  pending: Map<string, SyncIntent>
  view: SyncView
  /** List scope. The vocabulary is the wire protocol's (same as the Mac) */
  scope: TaskScope
  screen: Screen
  /** Detail of the open task. Fetched only when it is opened */
  detail: SyncTaskDetail | null
  detailLoading: boolean
  rejected: Rejected[]
  phase: Phase
  /** Whether the OS permission sheet is up right now (don't open it twice) */
  asking: boolean
  /** Reason when `failed`. Shown to the user */
  error: string
  /** Failure of manual pull-latest only. A normal local read does not clear it */
  syncError: string
  /** Last time the Mac's export was actually read. Empty means we never managed to */
  loadedAt: string
  /**
   * Why the Mac's export is not on screen although iCloud holds it. Empty once one has
   * been read, and while none exists at all (the Mac has not written one).
   *
   * **"iCloud has it but this iPhone could not read it" must never look like "the Mac has
   * not exported."** Folded into one `null`, the screen blamed the Mac while the Mac was
   * long done and iCloud had synced — on a phone outside that could not bring the file
   * down (that actually happened). This carries the shell's or the parser's reason.
   */
  exportUnavailable: string
  /** Same, for the open task's detail file */
  detailUnavailable: string
  /**
   * Whether this session already asked iCloud for the export on its own.
   *
   * Once is enough: a fetch can wait up to a minute, and after one failure the next
   * attempt is a human's call (the button), not something to stack every 10 seconds.
   */
  exportAsked: boolean
  /** Display-only flag so we don't stack resyncs while rereading the snapshot */
  refreshing: boolean
  /**
   * Whether the app itself is being downloaded.
   *
   * The UI is distributed over iCloud (so it can be fixed without plugging
   * in a device). It is a 2.8MB download, so **never make people wait in
   * silence**. `ratio` is set only when iCloud reports it (indeterminate
   * while unknown).
   */
  update: { active: boolean; ratio: number | null }
  busy: boolean
  /** Drafts. They survive the screen going away (`lib/drafts.ts`) */
  drafts: Drafts

  start(): Promise<void>
  /** `latest` is a manual action: fetch the newest version on iCloud, then read. */
  refresh(latest?: boolean): Promise<void>
  requestAccess(): Promise<void>
  setScope(scope: TaskScope): void
  setDraft(key: string, text: string): void
  open(screen: Screen): void
  openTask(taskId: string): Promise<void>
  dismissRejected(intentId: string): void

  createTask(input: {
    projectId: string
    title: string
    prompt: string
    priority: Priority
    action: AddAction
  }): Promise<void>
  markDone(taskId: string): Promise<void>
  sendBack(taskId: string, message: string): Promise<void>
  enqueue(taskId: string): Promise<void>
  unqueue(taskId: string): Promise<void>
  setPriority(taskId: string, priority: Priority): Promise<void>
  archive(taskId: string): Promise<void>
}

const EMPTY_FOLDER: FolderState = { configured: false, name: '', readable: false }

const EMPTY_VIEW: SyncView = {
  rev: 0,
  generatedAt: '',
  omittedDone: 0,
  scheduler: EMPTY_SNAPSHOT.scheduler,
  projects: [],
  tasks: []
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  bridge: null,
  device: '',
  folder: EMPTY_FOLDER,
  snapshot: EMPTY_SNAPSHOT,
  pending: new Map(),
  view: EMPTY_VIEW,
  /*
   * Default to "all tasks". **Never open onto an empty screen.**
   * Defaulting to "needs review" produced a screen with nothing on it even
   * though sync was working — indistinguishable from not being connected.
   */
  scope: ALL_TASKS,
  screen: { kind: 'list' },
  detail: null,
  detailLoading: false,
  rejected: [],
  phase: 'starting',
  asking: false,
  error: '',
  syncError: '',
  loadedAt: '',
  exportUnavailable: '',
  detailUnavailable: '',
  exportAsked: false,
  refreshing: false,
  busy: false,
  update: { active: false, ratio: null },
  drafts: loadDrafts(),

  async start() {
    const bridge = await createBridge()
    try {
      const [device, folder] = await Promise.all([bridge.deviceId(), bridge.folderState()])
      set({ bridge, device, folder, ready: true })
    } catch (e) {
      // The shell is not answering. Don't wait in silence
      set({ bridge, ready: true, phase: 'failed', error: reason(e) })
      return
    }
    // Reread when iCloud moves. App calls this when we return to the foreground
    bridge.onChange(() => void get().refresh())
    // Download of the app itself. Show the banner only while it runs
    bridge.onUpdate((active, ratio) => set({ update: { active, ratio } }))
    await get().refresh()
  },

  async refresh(latest = false) {
    const bridge = get().bridge
    if (!bridge) return
    /*
     * Never overlap loads. While in the foreground one comes every 10
     * seconds, so on a weak signal the next starts before the previous
     * finishes. When they overlap, a stale round can overwrite later state
     */
    if (reading) return
    reading = true
    set({ refreshing: true })

    /*
     * If we already have content, don't drop back to `loading`. Replacing
     * the list with a spinner on every background reread makes the screen
     * vanish while someone is looking at it
     */
    const first = get().phase !== 'ready'
    if (first) set({ phase: 'loading', error: '' })
    if (latest) set({ syncError: '' })

    try {
      if (latest) {
        // Resync is not receive-only: push intents stranded on this device first.
        await bridge.syncPendingIntents()
        await bridge.syncLatestMacState()
      }
      const heldUp = await load(get, set)
      /*
       * Nothing on screen, and the shell says iCloud holds the export but has not handed it
       * over: ask iCloud for it right now, once. The regular re-read only requests the
       * download and moves on, and on a phone that had just come back online that meant
       * staring at a spinner until someone found the button in Settings. One try — a fetch
       * can wait up to a minute, and after it fails the next is a human's call
       */
      if (heldUp && !latest && !get().exportAsked && !get().view.generatedAt) {
        set({ exportAsked: true })
        let fetched = false
        try {
          await bridge.syncLatestMacState()
          fetched = true
        } catch (e) {
          // Still nothing to show; the reason is the next thing a person needs
          set({ exportUnavailable: reason(e) })
        }
        if (fetched) await load(get, set)
      }
    } catch (e) {
      // Even if the regular 10s read manages to read a stale replica after a
      // manual pull failed, that does not mean "we got the latest". Keep the
      // reason until the next manual success.
      if (latest && !first) set({ syncError: reason(e) })
      else set({ phase: 'failed', error: reason(e) })
    } finally {
      reading = false
      set({ refreshing: false })
    }
  },

  /**
   * Ask for permission. **Not a screen for the user to choose on**, so call
   * it ourselves instead of making them tap. If turned down, stay in
   * `needsAccess` and ask again the next time we come to the foreground.
   */
  async requestAccess() {
    const bridge = get().bridge
    if (!bridge || get().asking) return
    set({ asking: true })
    try {
      const folder = await bridge.requestAccess()
      set({ folder })
      if (folder.configured) await get().refresh()
      else set({ phase: 'declined' })
    } catch (e) {
      set({ phase: 'failed', error: reason(e) })
    } finally {
      set({ asking: false })
    }
  },

  setScope(scope) {
    set({ scope })
  },

  /**
   * Take custody of the draft on every keystroke. **Never batch-then-save.**
   * The screen going away in the middle of "save it later in one go" is
   * exactly when you lose it.
   */
  setDraft(key, text) {
    const drafts = setDraftIn(get().drafts, key, text)
    if (drafts === get().drafts) return
    set({ drafts })
    saveDrafts(drafts)
  },

  open(screen) {
    set({ screen })
    if (screen.kind !== 'task') set({ detail: null, detailUnavailable: '' })
  },

  async openTask(taskId) {
    set({ screen: { kind: 'task', taskId }, detail: null, detailUnavailable: '' })
    await loadDetail(get, set, taskId)
  },

  dismissRejected(intentId) {
    set({ rejected: get().rejected.filter((r) => r.intentId !== intentId) })
  },

  async createTask(input) {
    const taskId = newId()
    await push(get, set, {
      kind: 'task.create',
      taskId,
      projectId: input.projectId,
      title: input.title,
      prompt: input.prompt,
      priority: input.priority,
      // Compat value so v1 create intents share this type. In v2 `action` is the original
      enqueue: input.action === 'queued',
      action: input.action
    })
    set({ screen: { kind: 'list' } })
  },

  async markDone(taskId) {
    await push(get, set, { kind: 'task.done', taskId })
  },

  async sendBack(taskId, message) {
    await push(get, set, { kind: 'task.sendBack', taskId, message })
  },

  async enqueue(taskId) {
    await push(get, set, { kind: 'task.enqueue', taskId })
  },

  async unqueue(taskId) {
    await push(get, set, { kind: 'task.unqueue', taskId })
  },

  async setPriority(taskId, priority) {
    await push(get, set, { kind: 'task.edit', taskId, priority })
  },

  async archive(taskId) {
    await push(get, set, { kind: 'task.archive', taskId })
    if (get().screen.kind === 'task') set({ screen: { kind: 'list' } })
  }
}))

type Get = () => State
type Set = (partial: Partial<State>) => void

/** Whether a load is in flight. Not in state — it never affects rendering */
let reading = false

/**
 * One round of loading. **Every exit path must leave a `phase` behind.**
 * Miss even one path and whoever lands on it waits forever.
 *
 * Resolves to whether the shell reported the export as held up in iCloud (a fetch may
 * free it). A file that is there but does not parse is not that: no fetch fixes it.
 */
async function load(get: Get, set: Set): Promise<boolean> {
  const bridge = get().bridge
  if (!bridge) return false

  const folder = await bridge.folderState()
  /*
   * No permission / permission expired. **Neither is a place for the user
   * to choose anything**, so ask the OS right here instead of showing a
   * screen. The stale bookmark has been discarded, so asking again leads
   * back to the original folder.
   */
  if (!folder.configured || !folder.readable) {
    set({ folder, phase: 'needsAccess' })
    void get().requestAccess()
    return false
  }

  const [snapshotRead, receiptsText, names] = await Promise.all([
    bridge.readSnapshot().then(
      (text) => ({ text, heldUp: '' }),
      (e: unknown) => {
        // The shell answered: iCloud has the file, this iPhone could not read it. Anything else is a failed load
        if (e instanceof FileUnavailableError) return { text: null, heldUp: reason(e) }
        throw e
      }
    ),
    bridge.readReceipts(),
    bridge.listIntents()
  ])

  // When unreadable, keep the previous content. Emptying the list while
  // iCloud is mid-download makes the screen flicker on a weak signal
  const parsed = snapshotRead.text ? parseSnapshot(snapshotRead.text) : null
  const snapshot = parsed?.ok ? parsed.value : get().snapshot
  /*
   * Where the export stands when it is not on screen. A file that is there but does not
   * read (half down, or newer than this screen) is held up as much as one that has not
   * come down — swallowed, either left the screen saying "waiting for the Mac" for good
   */
  const exportUnavailable = parsed ? (parsed.ok ? '' : parsed.reason) : snapshotRead.heldUp

  const receipts = receiptsText ? parseReceipts(receiptsText) : null
  const handled = new Map(
    (receipts?.ok ? receipts.value.entries : []).map((e) => [e.intentId, e])
  )

  const pending = new Map<string, SyncIntent>()
  const rejected: Rejected[] = []

  for (const name of names) {
    const text = await bridge.readIntent(name)
    if (text === null) continue
    const intent = parseIntent(text)
    if (!intent.ok) {
      // Clean up our own unreadable files (kept, they would never be applied)
      await bridge.removeIntent(name)
      continue
    }
    const receipt = handled.get(intent.value.id)
    if (!receipt) {
      pending.set(name, intent.value)
      continue
    }
    /*
     * A receipt came back = the Mac saw it. The file may be cleaned up.
     * Only a conflict must not be swallowed: raise the reason to the screen
     * (the worst outcome is "I tapped and nothing happened" with no trace).
     */
    if (receipt.outcome === 'conflict') {
      rejected.push({
        intentId: receipt.intentId,
        taskId: receipt.taskId,
        reason: receipt.reason,
        at: receipt.at
      })
    }
    await bridge.removeIntent(name)
  }

  const view = projectView(snapshot, [...pending.values()])
  // Drop drafts whose destination is gone (e.g. a follow-up to an archived task)
  const drafts = pruneDrafts(get().drafts, {
    taskIds: view.tasks.map((t) => t.id),
    projectIds: view.projects.map((p) => p.id)
  })
  if (drafts !== get().drafts) saveDrafts(drafts)

  const dismissed = new Set(get().rejected.map((r) => r.intentId))
  set({
    folder,
    snapshot,
    pending,
    view,
    drafts,
    rejected: [...get().rejected, ...rejected.filter((r) => !dismissed.has(r.intentId))],
    phase: 'ready',
    error: '',
    exportUnavailable,
    // "iPhone last synced" is the last time the Mac's state was read, not the last look at the folder
    ...(parsed?.ok ? { loadedAt: new Date().toISOString() } : {})
  })

  // Reread the open task's detail too, if its fingerprint changed
  const screen = get().screen
  if (screen.kind === 'task') await loadDetail(get, set, screen.taskId)
  return snapshotRead.heldUp !== ''
}

/**
 * Place one intent.
 *
 * **Write to the file the moment the button is tapped.** With a
 * batch-then-send design, closing the app on the train erases what
 * was just written.
 */
async function push(get: Get, set: Set, op: SyncOp): Promise<void> {
  const { bridge, device, snapshot, pending, view } = get()
  if (!bridge) return

  const task = view.tasks.find((t) => t.id === op.taskId)
  const seq = nextSeq(pending)
  const intent = makeIntent({
    id: newId(),
    device,
    seq,
    createdAt: new Date().toISOString(),
    baseRev: snapshot.rev,
    op,
    // Creation has no precondition (you cannot state the state of what does not exist yet)
    expect: op.kind === 'task.create' || !task ? null : expectOf(task)
  })

  const name = intentFileName(seq, intent.id)
  set({ busy: true })
  try {
    const body = JSON.stringify(intent)
    let uploadError = ''
    try {
      await bridge.writeIntent(name, body)
    } catch (e) {
      /*
       * If only the upload failed, the Swift side still holds the local
       * intent. If we can read it back, keep it as pending-send and resend
       * the same id on the next launch / resync. If the local write itself
       * failed, rethrow so the input is not erased.
       */
      let stored: string | null = null
      try {
        stored = await bridge.readIntent(name)
      } catch {
        // Prefer the original failure reason
      }
      if (stored !== body) throw e
      uploadError = reason(e)
    }
    const next = new Map(pending)
    next.set(name, intent)
    set({
      pending: next,
      view: projectView(snapshot, [...next.values()]),
      ...(uploadError ? { syncError: uploadError } : {})
    })
  } finally {
    set({ busy: false })
  }
}

/**
 * The next sequence number. **Monotonic within this device is all we need.**
 *
 * Max of the not-yet-delivered intents + 1 suffices. Applied intents vanish
 * with their files, so the number naturally rolls back — but the Mac
 * deduplicates on intent `id`, so nothing collides.
 */
function nextSeq(pending: Map<string, SyncIntent>): number {
  let max = 0
  for (const intent of pending.values()) max = Math.max(max, intent.seq)
  return max + 1
}

/** Turn an exception into one human-readable line. **Never end at "it failed".** */
function reason(e: unknown): string {
  // The bridge names conditions, not copy: the words for one belong here.
  if (e instanceof ShellOutdatedError) return t('bridge.shellUpdateRequired')
  const text = e instanceof Error ? e.message : String(e)
  return text.trim() || t('store.loadFailed')
}

function expectOf(task: SyncTaskView): SyncIntent['expect'] {
  return { status: task.status, updatedAt: task.updatedAt, runSeq: task.runSeq }
}

async function loadDetail(get: Get, set: Set, taskId: string): Promise<void> {
  const bridge = get().bridge
  if (!bridge) return
  const task = get().view.tasks.find((t) => t.id === taskId)
  // Same fingerprint as last read — don't fetch (for weak-signal places)
  if (task && get().detail?.hash === task.detailHash) return

  set({ detailLoading: true })
  try {
    const text = await bridge.readDetail(taskId)
    const parsed = text ? parseDetail(text) : null
    set({
      detail: parsed?.ok ? parsed.value : null,
      detailUnavailable: parsed && !parsed.ok ? parsed.reason : ''
    })
  } catch (e) {
    if (!(e instanceof FileUnavailableError)) throw e
    // iCloud has the conversation, this iPhone not yet: keep what was read before, and say why
    set({ detailUnavailable: reason(e) })
  } finally {
    set({ detailLoading: false })
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
