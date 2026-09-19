// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { LAYOUT } from '../src/sync/layout.js'
import { EMPTY_SNAPSHOT, SYNC_VERSION } from '../src/sync/protocol.js'
import { projectView } from '../src/sync/projection.js'
import { parseIntent } from '../src/sync/readIntent.js'
import type { SyncReceipts, SyncSnapshot } from '../src/sync/protocol.js'
import { FileUnavailableError } from '../src/bridge/contract.js'
import { MemoryBridge } from '../src/bridge/memory.js'
import { useStore } from '../src/state/store.js'

/**
 * The iPhone's behavior.
 *
 * Three things are watched: **does a press become a file**, **is it cleaned up once a
 * receipt comes back**, and **is a race reported to a person**. The decision logic
 * itself is covered on the sync wire side.
 */

function snapshot(over: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    version: SYNC_VERSION,
    rev: 5,
    generatedAt: '2026-08-23T10:00:00.000Z',
    omittedDone: 0,
    scheduler: { running: true, activeRuns: 0, queued: 0 },
    projects: [{ id: 'p1', name: 'Quuu', color: '#4EA8DE', priority: 2, enabled: true }],
    tasks: [
      {
        id: 't1',
        projectId: 'p1',
        title: 'やること',
        excerpt: '',
        status: 'review',
        priority: 2,
        order: 0,
        updatedAt: '2026-08-23T09:00:00.000Z',
        runSeq: 3,
        lastRun: null,
        hasPending: false,
        hasReserved: false,
        detailHash: ''
      }
    ],
    ...over
  }
}

/** Places only the Mac side into the fake iCloud. */
class Cloud extends MemoryBridge {
  private readonly files = new Map<string, string>()

  constructor(snap: SyncSnapshot) {
    super()
    this.files.set(LAYOUT.snapshot, JSON.stringify(snap))
  }

  override readSnapshot(): Promise<string | null> {
    return Promise.resolve(this.files.get(LAYOUT.snapshot) ?? null)
  }

  override readReceipts(): Promise<string | null> {
    return Promise.resolve(this.files.get(LAYOUT.receipts) ?? null)
  }

  override readDetail(): Promise<string | null> {
    return Promise.resolve(null)
  }

  setSnapshot(snap: SyncSnapshot): void {
    this.files.set(LAYOUT.snapshot, JSON.stringify(snap))
  }

  /** Sets up the situation where the Mac has written a receipt. */
  setReceipts(receipts: SyncReceipts): void {
    this.files.set(LAYOUT.receipts, JSON.stringify(receipts))
  }
}

let cloud: Cloud

async function boot(snap = snapshot()): Promise<void> {
  cloud = new Cloud(snap)
  useStore.setState({
    ready: true,
    bridge: cloud,
    device: 'test-phone',
    folder: { configured: true, name: 'Quuu', readable: true },
    pending: new Map(),
    rejected: [],
    screen: { kind: 'list' },
    detail: null,
    syncError: ''
  })
  await useStore.getState().refresh()
}

beforeEach(async () => {
  await boot()
})

describe('a press becomes a file on the spot', () => {
  it('pressing done places exactly one intent', async () => {
    await useStore.getState().markDone('t1')
    const names = await cloud.listIntents()
    expect(names).toHaveLength(1)

    const text = await cloud.readIntent(names[0])
    const intent = parseIntent(text ?? '')
    expect(intent.ok && intent.value.op).toEqual({ kind: 'task.done', taskId: 't1' })
  })

  it('records the state visible at press time, so a race can be detected', async () => {
    await useStore.getState().markDone('t1')
    const names = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(names[0])) ?? '')
    expect(intent.ok && intent.value.expect).toEqual({
      status: 'review',
      updatedAt: '2026-08-23T09:00:00.000Z',
      runSeq: 3
    })
    expect(intent.ok && intent.value.baseRev).toBe(5)
  })

  it('attaches no precondition to a creation, since nothing can be said about what does not exist yet', async () => {
    await useStore.getState().createTask({
      projectId: 'p1',
      title: '思いついた',
      prompt: '',
      priority: 2,
      action: 'draft'
    })
    const names = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(names[0])) ?? '')
    expect(intent.ok && intent.value.expect).toBeNull()
    expect(intent.ok && intent.value.op).toMatchObject({
      kind: 'task.create',
      action: 'draft',
      enqueue: false
    })
  })

  it('a task created with Run Now looks running without waiting for the Mac to answer', async () => {
    await useStore.getState().createTask({
      projectId: 'p1',
      title: 'すぐやる',
      prompt: '指示',
      priority: 1,
      action: 'now'
    })

    const names = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(names[0])) ?? '')
    expect(intent.ok && intent.value.op).toMatchObject({
      kind: 'task.create',
      action: 'now'
    })
    const task = useStore.getState().view.tasks.find((t) => t.title === 'すぐやる')
    expect(task?.status).toBe('running')
  })

  it('draws the result of the press first, so nobody waits for the round trip', async () => {
    await useStore.getState().markDone('t1')
    const task = useStore.getState().view.tasks.find((t) => t.id === 't1')
    expect(task?.status).toBe('done')
    expect(task?.pending).toBe(1)
  })

  it('the sequence number increases monotonically within a device', async () => {
    await useStore.getState().markDone('t1')
    await useStore.getState().sendBack('t1', 'あとで')
    const names = await cloud.listIntents()
    const seqs = await Promise.all(
      names.map(async (n) => {
        const intent = parseIntent((await cloud.readIntent(n)) ?? '')
        return intent.ok ? intent.value.seq : -1
      })
    )
    expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('keeps an intent left on the device marked not-synced when only the cloud send failed', async () => {
    const write = cloud.writeIntent.bind(cloud)
    cloud.writeIntent = async (name, body) => {
      await write(name, body)
      throw new Error('could not send to iCloud')
    }

    await useStore.getState().createTask({
      projectId: 'p1',
      title: '端末には残る',
      prompt: '',
      priority: 2,
      action: 'queued'
    })

    expect(useStore.getState().pending.size).toBe(1)
    expect(useStore.getState().view.tasks.find((t) => t.title === '端末には残る')?.pending).toBe(1)
    expect(useStore.getState().syncError).toContain('could not send to iCloud')
  })

  it('does not treat a failed device write as success', async () => {
    cloud.writeIntent = () => Promise.reject(new Error('write failed'))

    await expect(
      useStore.getState().createTask({
        projectId: 'p1',
        title: '残っていない',
        prompt: '',
        priority: 2,
        action: 'queued'
      })
    ).rejects.toThrow('write failed')

    expect(useStore.getState().pending.size).toBe(0)
    expect(useStore.getState().view.tasks.some((t) => t.title === '残っていない')).toBe(false)
  })
})

describe('cleaning up once a receipt comes back', () => {
  it('what was imported loses its file, and the overlay comes off too', async () => {
    await useStore.getState().markDone('t1')
    const [name] = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(name)) ?? '')
    if (!intent.ok) throw new Error('unreadable')

    // The Mac imported it and rewrote the state
    cloud.setReceipts({
      version: SYNC_VERSION,
      updatedAt: '2026-08-23T10:05:00.000Z',
      entries: [
        {
          intentId: intent.value.id,
          device: 'test-phone',
          seq: 1,
          taskId: 't1',
          at: '2026-08-23T10:05:00.000Z',
          outcome: 'applied',
          reason: ''
        }
      ]
    })
    const next = snapshot()
    next.rev = 6
    next.tasks[0].status = 'done'
    cloud.setSnapshot(next)

    await useStore.getState().refresh()

    expect(await cloud.listIntents()).toEqual([])
    const task = useStore.getState().view.tasks.find((t) => t.id === 't1')
    expect(task?.status).toBe('done')
    expect(task?.pending).toBe(0)
  })

  it('never silently drops a race, and returns the reason to a person', async () => {
    await useStore.getState().markDone('t1')
    const [name] = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(name)) ?? '')
    if (!intent.ok) throw new Error('unreadable')

    cloud.setReceipts({
      version: SYNC_VERSION,
      updatedAt: '2026-08-23T10:05:00.000Z',
      entries: [
        {
          intentId: intent.value.id,
          device: 'test-phone',
          seq: 1,
          taskId: 't1',
          at: '2026-08-23T10:05:00.000Z',
          outcome: 'conflict',
          reason: '読んだ後にもう一度実行されています'
        }
      ]
    })
    await useStore.getState().refresh()

    expect(await cloud.listIntents()).toEqual([])
    expect(useStore.getState().rejected.map((r) => r.reason)).toEqual([
      '読んだ後にもう一度実行されています'
    ])
    // The overlay comes off and the real state returns
    expect(useStore.getState().view.tasks.find((t) => t.id === 't1')?.status).toBe('review')
  })

  it('the returned reason stays until a person dismisses it', async () => {
    await useStore.getState().markDone('t1')
    const [name] = await cloud.listIntents()
    const intent = parseIntent((await cloud.readIntent(name)) ?? '')
    if (!intent.ok) throw new Error('unreadable')
    cloud.setReceipts({
      version: SYNC_VERSION,
      updatedAt: 'x',
      entries: [
        {
          intentId: intent.value.id,
          device: 'test-phone',
          seq: 1,
          taskId: 't1',
          at: 'x',
          outcome: 'conflict',
          reason: 'だめでした'
        }
      ]
    })
    await useStore.getState().refresh()
    await useStore.getState().refresh()
    expect(useStore.getState().rejected).toHaveLength(1)

    useStore.getState().dismissRejected(useStore.getState().rejected[0].intentId)
    expect(useStore.getState().rejected).toHaveLength(0)
  })
})

describe('when it cannot be read', () => {
  it('keeps the previous content while the snapshot has not come down, never emptying the screen', async () => {
    expect(useStore.getState().view.tasks).toHaveLength(1)
    cloud.setSnapshot(snapshot())
    // Produce an unreadable state
    const broken = new Cloud(snapshot())
    broken.readSnapshot = () => Promise.resolve(null)
    useStore.setState({ bridge: broken })
    await useStore.getState().refresh()
    expect(useStore.getState().view.tasks).toHaveLength(1)
  })

  it('reads nothing while no folder has been chosen', async () => {
    useStore.setState({ folder: { configured: false, name: '', readable: false } })
    await useStore.getState().refresh()
    expect(useStore.getState().loadedAt).not.toBe('')
  })
})

/**
 * Loading state. **Every exit path leaves behind "what is happening right now".**
 *
 * It used to carry "did it read" as a single timestamp, and the unconfigured-folder and
 * unreadable paths exited without ever setting it. The screen showed "Loading" forever,
 * which to a person is indistinguishable from frozen.
 */
describe('loading state', () => {
  it('a manual re-sync waits for the newest iCloud version before re-reading', async () => {
    const bridge = new Cloud(snapshot())
    let release!: () => void
    let reads = 0
    bridge.syncLatestMacState = () =>
      new Promise((resolve) => {
        release = resolve
      })
    bridge.readSnapshot = () => {
      reads += 1
      return Promise.resolve(JSON.stringify(snapshot()))
    }
    useStore.setState({
      bridge,
      phase: 'ready',
      refreshing: false,
      syncError: 'the previous fetch failed'
    })

    const refresh = useStore.getState().refresh(true)
    await Promise.resolve()
    expect(useStore.getState().refreshing).toBe(true)
    expect(reads, 'does not read locally before waiting for the newest version').toBe(0)

    release()
    await refresh
    expect(reads).toBe(1)
    expect(useStore.getState().refreshing).toBe(false)
    expect(useStore.getState().syncError).toBe('')
  })

  it('a manual re-sync sends the device backlog first, then fetches the newest Mac state', async () => {
    const bridge = new Cloud(snapshot())
    const order: string[] = []
    bridge.syncPendingIntents = () => {
      order.push('upload')
      return Promise.resolve()
    }
    bridge.syncLatestMacState = () => {
      order.push('download')
      return Promise.resolve()
    }
    bridge.readSnapshot = () => {
      order.push('read')
      return Promise.resolve(JSON.stringify(snapshot()))
    }
    useStore.setState({ bridge, phase: 'ready', refreshing: false, syncError: '' })

    await useStore.getState().refresh(true)

    expect(order).toEqual(['upload', 'download', 'read'])
  })

  it('does not treat it as success when the newest iCloud version cannot be fetched', async () => {
    const bridge = new Cloud(snapshot())
    bridge.syncLatestMacState = () => Promise.reject(new Error('cannot fetch the newest version'))
    useStore.setState({ bridge, phase: 'ready', refreshing: false, syncError: '' })

    await useStore.getState().refresh(true)

    expect(useStore.getState().phase).toBe('ready')
    expect(useStore.getState().syncError).toBe('cannot fetch the newest version')
    expect(useStore.getState().refreshing).toBe(false)

    await useStore.getState().refresh()
    expect(useStore.getState().syncError, 'a plain local read is not treated as success').not.toBe('')
  })

  it('keeps the re-syncing mark from the start of the re-read until it finishes', async () => {
    const bridge = new Cloud(snapshot())
    let release!: (value: string | null) => void
    bridge.readSnapshot = () =>
      new Promise((resolve) => {
        release = resolve
      })
    useStore.setState({ bridge, phase: 'ready', refreshing: false })

    const refresh = useStore.getState().refresh()
    await Promise.resolve()
    expect(useStore.getState().refreshing).toBe(true)

    release(JSON.stringify(snapshot()))
    await refresh
    expect(useStore.getState().refreshing).toBe(false)
  })

  it('becomes ready once it can read', async () => {
    await useStore.getState().refresh()
    expect(useStore.getState().phase).toBe('ready')
  })

  it('asks the OS on the spot rather than making anyone press, when permission is absent', async () => {
    const bridge = new Cloud(snapshot())
    let asked = 0
    bridge.folderState = () => Promise.resolve({ configured: false, name: '', readable: false })
    bridge.requestAccess = () => {
      asked += 1
      return Promise.resolve({ configured: true, name: 'Quuu', readable: true })
    }
    useStore.setState({ bridge, phase: 'starting', asking: false })
    await useStore.getState().refresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(asked, 'asks on its own').toBe(1)
  })

  it('asks again without making anyone re-pick, even once permission has lapsed', async () => {
    const bridge = new Cloud(snapshot())
    let asked = 0
    bridge.folderState = () => Promise.resolve({ configured: true, name: 'Quuu', readable: false })
    bridge.requestAccess = () => {
      asked += 1
      return Promise.resolve({ configured: true, name: 'Quuu', readable: true })
    }
    useStore.setState({ bridge, phase: 'starting', asking: false })
    await useStore.getState().refresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(asked).toBe(1)
  })

  it('goes to declined when refused, stopping the spinner and leaving something pressable', async () => {
    const bridge = new Cloud(snapshot())
    bridge.folderState = () => Promise.resolve({ configured: false, name: '', readable: false })
    bridge.requestAccess = () => Promise.resolve({ configured: false, name: '', readable: false })
    useStore.setState({ bridge, phase: 'starting', asking: false })
    await useStore.getState().refresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(useStore.getState().phase).toBe('declined')
  })

  it('becomes failed with the reason kept when the shell does not answer', async () => {
    const bridge = new Cloud(snapshot())
    bridge.readSnapshot = () => Promise.reject(new Error('No reply from snapshot.read'))
    useStore.setState({ bridge, phase: 'starting' })
    await useStore.getState().refresh()
    expect(useStore.getState().phase).toBe('failed')
    expect(useStore.getState().error).toContain('No reply')
  })

  it('does not fall back to loading on a re-read while readable, so the list never disappears', async () => {
    await useStore.getState().refresh()
    expect(useStore.getState().phase).toBe('ready')

    const seen: string[] = []
    const stop = useStore.subscribe((s) => seen.push(s.phase))
    await useStore.getState().refresh()
    stop()
    expect(seen).not.toContain('loading')
  })
})

/**
 * The export is in iCloud but not readable on this iPhone. **Never blame the Mac for that.**
 *
 * One `null` for "no file" and "could not read it" left the screen saying "waiting for the
 * Mac to export" on a phone outside, with the Mac long done and iCloud synced. The shell now
 * refuses such a read with its reason; the screen keeps the reason, asks iCloud for the
 * file once on its own, and leaves a button for the next try.
 */
describe('when iCloud holds the export but this iPhone could not read it', () => {
  /** A shell that refuses the snapshot with the reason, on a phone that has read nothing yet. */
  function withheld(reason = 'Not downloaded from iCloud to this iPhone yet'): Cloud {
    const bridge = new Cloud(snapshot())
    bridge.readSnapshot = () => Promise.reject(new FileUnavailableError(reason))
    useStore.setState({
      bridge,
      phase: 'starting',
      snapshot: EMPTY_SNAPSHOT,
      view: projectView(EMPTY_SNAPSHOT, []),
      loadedAt: '',
      exportUnavailable: '',
      exportAsked: false
    })
    return bridge
  }

  it('keeps the shell\'s reason instead of saying the Mac has not exported', async () => {
    const bridge = withheld()
    bridge.syncLatestMacState = () => Promise.reject(new Error('offline'))
    useStore.setState({ exportAsked: true })

    await useStore.getState().refresh()

    expect(useStore.getState().phase).toBe('ready')
    expect(useStore.getState().view.generatedAt).toBe('')
    expect(useStore.getState().exportUnavailable).toBe('Not downloaded from iCloud to this iPhone yet')
    expect(useStore.getState().loadedAt, 'nothing was synced, so nothing says it was').toBe('')
  })

  it('asks iCloud for the export on its own once nothing is on screen, and shows it when that works', async () => {
    const bridge = withheld()
    let fetched = 0
    bridge.syncLatestMacState = () => {
      fetched += 1
      bridge.readSnapshot = () => Promise.resolve(JSON.stringify(snapshot()))
      return Promise.resolve()
    }

    await useStore.getState().refresh()

    expect(fetched).toBe(1)
    expect(useStore.getState().view.tasks).toHaveLength(1)
    expect(useStore.getState().exportUnavailable).toBe('')
    expect(useStore.getState().loadedAt).not.toBe('')
  })

  it('shows why the fetch failed and does not stack another one every re-read', async () => {
    const bridge = withheld()
    let fetched = 0
    bridge.syncLatestMacState = () => {
      fetched += 1
      return Promise.reject(new Error('Could not fetch the latest version from iCloud: offline'))
    }

    await useStore.getState().refresh()
    expect(useStore.getState().phase).toBe('ready')
    expect(useStore.getState().exportUnavailable).toContain('offline')

    // The next re-read reports what it found itself; the fetch is not repeated
    await useStore.getState().refresh()
    expect(fetched, 'the next attempt is a human\'s call').toBe(1)
    expect(useStore.getState().exportUnavailable).toBe('Not downloaded from iCloud to this iPhone yet')
  })

  it('treats a file that does not exist as the Mac not having exported yet, without fetching', async () => {
    const bridge = withheld()
    bridge.readSnapshot = () => Promise.resolve(null)
    let fetched = 0
    bridge.syncLatestMacState = () => {
      fetched += 1
      return Promise.resolve()
    }

    await useStore.getState().refresh()

    expect(fetched).toBe(0)
    expect(useStore.getState().phase).toBe('ready')
    expect(useStore.getState().view.generatedAt).toBe('')
    expect(useStore.getState().exportUnavailable).toBe('')
  })

  it('surfaces a snapshot that is there but does not read, instead of waiting for the Mac forever', async () => {
    const bridge = withheld()
    bridge.readSnapshot = () => Promise.resolve(JSON.stringify({ version: 99 }))
    let fetched = 0
    bridge.syncLatestMacState = () => {
      fetched += 1
      return Promise.resolve()
    }

    await useStore.getState().refresh()

    expect(fetched, 'no fetch fixes a file this screen cannot read').toBe(0)
    expect(useStore.getState().exportUnavailable).toContain('version')
  })

  it('keeps the list, and does not stamp the iPhone as synced, while a newer export could not be read', async () => {
    const bridge = new Cloud(snapshot())
    bridge.readSnapshot = () => Promise.reject(new FileUnavailableError('Could not read from iCloud: offline'))
    let fetched = 0
    bridge.syncLatestMacState = () => {
      fetched += 1
      return Promise.resolve()
    }
    useStore.setState({ bridge, loadedAt: 'before', exportAsked: false })

    await useStore.getState().refresh()

    expect(useStore.getState().view.tasks).toHaveLength(1)
    expect(useStore.getState().phase).toBe('ready')
    expect(useStore.getState().loadedAt).toBe('before')
    expect(useStore.getState().exportUnavailable).toContain('offline')
    expect(fetched, 'something is on screen; a fetch is the button\'s job').toBe(0)
  })

  it('says why a conversation could not be read rather than calling it empty', async () => {
    cloud.readDetail = () => Promise.reject(new FileUnavailableError('Not downloaded from iCloud to this iPhone yet'))

    await useStore.getState().openTask('t1')

    expect(useStore.getState().detail).toBeNull()
    expect(useStore.getState().detailUnavailable).toContain('Not downloaded')
    expect(useStore.getState().detailLoading).toBe(false)

    useStore.getState().open({ kind: 'list' })
    expect(useStore.getState().detailUnavailable, 'the reason belongs to the task that was open').toBe('')
  })
})
