import { FileUnavailableError, ShellOutdatedError } from './contract.js'
import type { Bridge, FolderState } from './contract.js'

/**
 * The bridge to the shell (Swift). **Exactly one `WKScriptMessageHandler`.**
 *
 * Only one kind of message goes out — `{id, method, params}` — and the shell answers
 * by calling `window.__quuuBridge.settle(id, ok, value)`. Keeping it to one mechanism
 * means the bridge does not grow new shapes as features are added (once it does,
 * behavior splits depending on which path a call came through).
 */

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * How long to wait for a reply.
 *
 * **A path that never answers must not become a path that waits forever.** Miss a
 * single `settle` call on the shell side and the screen freezes in loading forever
 * (that actually happened). Cut it off on time and lean toward showing a person why.
 *
 * Reads that pull the real file down from iCloud can take seconds, so don't make
 * this too short.
 */
const TIMEOUT_MS = 20_000
/** A manual sync that actively fetches from iCloud waits longer than a normal read. */
const LATEST_TIMEOUT_MS = 65_000

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        quuu?: { postMessage(message: unknown): void }
      }
    }
    __quuuBridge?: {
      settle(id: number, ok: boolean, value: unknown): void
      changed(): void
      progress(active: boolean, ratio: number | null): void
    }
  }
}

/**
 * The bridge got no answer at all — no shell, or nothing came back in time.
 *
 * Kept apart from what the shell answers: a read the shell **refuses with a reason** means
 * the file is in iCloud and could not be read here, and the screen words that. The bridge's
 * own silence is not that condition.
 */
class NoAnswerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoAnswerError'
  }
}

/** A refused read of one of the Mac's files, as the named condition; silence stays as it is. */
function unavailable(e: unknown): Error {
  if (e instanceof NoAnswerError) return e
  return new FileUnavailableError(e instanceof Error ? e.message : String(e))
}

/**
 * Whether the shell answered "I don't know that method".
 *
 * **Both spellings must match.** The screen ships over iCloud ahead of the native
 * shell, so a new screen routinely runs on a shell that is already installed — and
 * shells built before this repository moved to English answer in Japanese. Matching
 * only the current English text would make every one of those phones look like a
 * successful sync that silently did nothing.
 */
function isUnknownMethod(e: unknown): boolean {
  return e instanceof Error && (e.message.includes('unknown method') || e.message.includes('知らない呼び出し'))
}

export class WebKitBridge implements Bridge {
  private seq = 0
  private readonly pending = new Map<number, Pending>()
  private readonly listeners = new Set<() => void>()
  private readonly updates = new Set<(active: boolean, ratio: number | null) => void>()

  constructor() {
    window.__quuuBridge = {
      settle: (id, ok, value) => {
        const entry = this.pending.get(id)
        if (!entry) return
        clearTimeout(entry.timer)
        this.pending.delete(id)
        if (ok) entry.resolve(value)
        else entry.reject(new Error(typeof value === 'string' ? value : 'the shell reported a failure'))
      },
      changed: () => {
        for (const cb of this.listeners) cb()
      },
      progress: (active, ratio) => {
        for (const cb of this.updates) cb(active, ratio)
      }
    }
  }

  private call<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = TIMEOUT_MS
  ): Promise<T> {
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const handler = window.webkit?.messageHandlers?.quuu
      if (!handler) {
        reject(new NoAnswerError('not connected to the app shell'))
        return
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new NoAnswerError(`no reply from ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      handler.postMessage({ id, method, params })
    })
  }

  async appReady(): Promise<void> {
    await this.call<boolean>('app.ready')
  }

  deviceId(): Promise<string> {
    return this.call<string>('device.id')
  }

  folderState(): Promise<FolderState> {
    return this.call<FolderState>('folder.state')
  }

  requestAccess(): Promise<FolderState> {
    return this.call<FolderState>('folder.request')
  }

  async syncLatestMacState(): Promise<void> {
    try {
      await this.call<boolean>('mac.sync', {}, LATEST_TIMEOUT_MS)
    } catch (e) {
      // The screen arrives over iCloud ahead of the shell. Don't treat an old shell as
      // success — say an update is needed.
      if (isUnknownMethod(e)) throw new ShellOutdatedError('mac.sync')
      throw e
    }
  }

  async syncPendingIntents(): Promise<void> {
    try {
      await this.call<boolean>('intents.sync', {}, LATEST_TIMEOUT_MS)
    } catch (e) {
      // If only the screen updated and the shell is still too old to push intents,
      // don't treat it as success.
      if (isUnknownMethod(e)) throw new ShellOutdatedError('intents.sync')
      throw e
    }
  }

  async readSnapshot(): Promise<string | null> {
    try {
      return await this.call<string | null>('snapshot.read')
    } catch (e) {
      throw unavailable(e)
    }
  }

  async readDetail(taskId: string): Promise<string | null> {
    try {
      return await this.call<string | null>('detail.read', { taskId })
    } catch (e) {
      throw unavailable(e)
    }
  }

  readReceipts(): Promise<string | null> {
    return this.call<string | null>('receipts.read')
  }

  listIntents(): Promise<string[]> {
    return this.call<string[]>('intents.list')
  }

  readIntent(name: string): Promise<string | null> {
    return this.call<string | null>('intents.read', { name })
  }

  writeIntent(name: string, body: string): Promise<void> {
    // Beyond saving locally, wait for the iCloud upload to finish.
    return this.call<void>('intents.write', { name, body }, LATEST_TIMEOUT_MS)
  }

  removeIntent(name: string): Promise<void> {
    return this.call<void>('intents.remove', { name })
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onUpdate(cb: (active: boolean, ratio: number | null) => void): () => void {
    this.updates.add(cb)
    return () => this.updates.delete(cb)
  }
}
