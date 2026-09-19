/**
 * The seam to the shell (Swift). **This is all the screens know.**
 *
 * It mirrors the Mac's "logic in main, renderer displays and inputs": on iPhone,
 * **the OS is Swift's job, assembly and screens are the Web's**. The iCloud rituals
 * (folder permission, coordinated reads/writes, materializing the real file) are
 * inseparable from Swift's API, so they never travel past this line.
 *
 * Because it is one single type, the same screens run in a browser too
 * (`memory.ts` holds a fake iCloud). Never build a screen that can only be touched
 * on a real device.
 */

/**
 * The shell is too old to know a method the screen calls.
 *
 * The screen ships over iCloud ahead of the native shell, so a new screen routinely
 * runs on a shell already installed. That is a state a person can act on (update the
 * app), not a diagnostic - but the wording belongs to the View, so the bridge only
 * names the condition.
 */
export class ShellOutdatedError extends Error {
  constructor(method: string) {
    super(`the shell does not know ${method}`)
    this.name = 'ShellOutdatedError'
  }
}

/**
 * iCloud holds the file, but this device could not read its content.
 *
 * Not the same as the file being absent (`null` from a read): iCloud's stand-in is there, or
 * the coordinated read failed. `message` is the shell's reason (still coming down, offline,
 * a paused File Provider). The screen must never present this as "the other side has not
 * written it yet" — with the Mac long done and iCloud synced, a phone that could not bring
 * the file down kept blaming the Mac (that actually happened, outside).
 */
export class FileUnavailableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'FileUnavailableError'
  }
}

export interface FolderState {
  /** Whether we hold permission to enter the handoff folder */
  configured: boolean
  /** Folder name. Empty without permission */
  name: string
  /** Whether it is actually readable right now (false once permission lapses) */
  readable: boolean
}

export interface Bridge {
  /** Device identity. Needed to keep intent ordering per device */
  deviceId(): Promise<string>

  /**
   * Tells the shell the screen came up.
   *
   * Screens are delivered over iCloud (so they can be fixed without a cable).
   * **If the next launch arrives without this having been called, that delivery is
   * discarded and the baked-in build comes back.** It keeps a screen that fails to
   * appear from trapping the app until someone connects a cable.
   */
  appReady(): Promise<void>

  folderState(): Promise<FolderState>
  /**
   * Asks the OS for permission to enter the handoff folder. **Not to make anyone
   * choose.** The destination is fixed; all a person does is press "Open" once.
   */
  requestAccess(): Promise<FolderState>

  /**
   * Actively asks iCloud for the snapshot and receipts the Mac wrote, and waits until
   * the device's copy is the newest version. Only a manual re-sync calls this.
   */
  syncLatestMacState(): Promise<void>

  /** Actively pushes intents still sitting on the device to iCloud. Called by a manual re-sync. */
  syncPendingIntents(): Promise<void>

  /**
   * `mac/snapshot.json`. Null when no such file exists (the Mac has not exported one).
   *
   * Rejects with `FileUnavailableError` when iCloud knows the file but its content could not
   * be read here. Shells older than that distinction answer null for both; a manual re-sync
   * (`syncLatestMacState`) is the way to make those fetch.
   */
  readSnapshot(): Promise<string | null>
  /** `mac/tasks/<taskId>.json`. Same three answers as `readSnapshot` */
  readDetail(taskId: string): Promise<string | null>
  /** `mac/receipts.json`. Null when absent or not here yet: the intents it answers simply stay pending */
  readReceipts(): Promise<string | null>

  /** The files this device placed in `phone/intents/` */
  listIntents(): Promise<string[]>
  readIntent(name: string): Promise<string | null>
  writeIntent(name: string, body: string): Promise<void>
  removeIntent(name: string): Promise<void>

  /** Called when something changed on the iCloud side. Unsubscribe with the return value */
  onChange(cb: () => void): () => void

  /**
   * Called while the screen itself is being received.
   *
   * **Never pull down 2.8MB in silence.** If the waiting is invisible, the sluggishness
   * right after opening reads as "broken".
   * `ratio` is filled in only when iCloud tells us (null when it does not know).
   */
  onUpdate(cb: (active: boolean, ratio: number | null) => void): () => void
}

