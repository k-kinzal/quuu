// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileUnavailableError, ShellOutdatedError } from '../src/bridge/contract.js'
import { WebKitBridge } from '../src/bridge/webkit.js'

afterEach(() => {
  vi.useRealTimers()
  delete window.webkit
  delete window.__quuuBridge
})

/** Answers every call with "I don't know that method", the way a too-old shell does. */
function shellRejecting(reply: string, expectMethod?: string): void {
  window.webkit = {
    messageHandlers: {
      quuu: {
        postMessage(message) {
          const call = message as { id: number; method: string }
          if (expectMethod) expect(call.method).toBe(expectMethod)
          queueMicrotask(() => {
            window.__quuuBridge?.settle(call.id, false, reply)
          })
        }
      }
    }
  }
}

describe('the bridge to the iPhone shell', () => {
  it('reports an outdated shell when the screen arrived first and the shell is old', async () => {
    shellRejecting('unknown method: mac.sync', 'mac.sync')

    const bridge = new WebKitBridge()

    await expect(bridge.syncLatestMacState()).rejects.toBeInstanceOf(ShellOutdatedError)
  })

  it('does not treat an old shell as success when pushing unsent intents either', async () => {
    shellRejecting('unknown method: intents.sync')

    const bridge = new WebKitBridge()

    await expect(bridge.syncPendingIntents()).rejects.toBeInstanceOf(ShellOutdatedError)
  })

  /*
   * Shells built before this repository moved to English are already installed on
   * phones, and the screen reaches them over iCloud ahead of any shell update. Match
   * only the current English wording and every one of those phones reports a
   * successful sync that silently did nothing.
   */
  it('still recognizes the Japanese refusal that shells already in the field answer with', async () => {
    shellRejecting('知らない呼び出しです: mac.sync')

    const bridge = new WebKitBridge()

    await expect(bridge.syncLatestMacState()).rejects.toBeInstanceOf(ShellOutdatedError)
  })
})

/**
 * A read the shell refuses with a reason means "iCloud has the file, this device could not
 * read it" — a state the screen words. The bridge's own silence is not that state.
 */
describe('reading the Mac\'s files', () => {
  it('hands a refused snapshot read over as the named condition, reason intact', async () => {
    shellRejecting('Not downloaded from iCloud to this iPhone yet', 'snapshot.read')

    const bridge = new WebKitBridge()

    await expect(bridge.readSnapshot()).rejects.toBeInstanceOf(FileUnavailableError)
    await expect(bridge.readSnapshot()).rejects.toThrow('Not downloaded from iCloud to this iPhone yet')
  })

  it('does not dress up a shell that never answers as that condition', async () => {
    vi.useFakeTimers()
    window.webkit = { messageHandlers: { quuu: { postMessage() {} } } }

    const bridge = new WebKitBridge()
    const read = bridge.readSnapshot()
    const settled = read.then(
      () => 'resolved',
      (e: unknown) => e
    )
    await vi.advanceTimersByTimeAsync(20_000)

    const outcome = await settled
    expect(outcome).toBeInstanceOf(Error)
    expect(outcome).not.toBeInstanceOf(FileUnavailableError)
    expect((outcome as Error).message).toBe('no reply from snapshot.read')
  })
})
