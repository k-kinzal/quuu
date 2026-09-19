import { LAYOUT, detailPath } from '../sync/layout.js'
import type { SyncSnapshot, SyncTaskDetail } from '../sync/protocol.js'
import { SYNC_VERSION } from '../sync/protocol.js'
import type { Bridge, FolderState } from './contract.js'

/**
 * A fake iCloud for building screens in a browser. **Never build a screen that can
 * only be touched on a real device.**
 *
 * It is backed by `localStorage`. Everything under `mac/` is filled with made-up data,
 * and `phone/` accumulates in exactly the real shape. From the screen's side the two
 * are indistinguishable.
 */

const KEY = 'quuu.mobile.fakeCloud'

interface Cloud {
  files: Record<string, string>
}

/**
 * `localStorage` is sometimes absent (test environments, for one).
 * The screen runs without it — nothing is remembered, but the made-up data is
 * rebuilt from scratch every time.
 */
function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function load(): Cloud {
  try {
    const raw = store()?.getItem(KEY)
    if (raw) return JSON.parse(raw) as Cloud
  } catch {
    // Rebuild if it cannot be read
  }
  const cloud: Cloud = { files: {} }
  seed(cloud)
  save(cloud)
  return cloud
}

function save(cloud: Cloud): void {
  try {
    store()?.setItem(KEY, JSON.stringify(cloud))
  } catch {
    // Keep the screen running even when the quota overflows
  }
}

export class MemoryBridge implements Bridge {
  private cloud = load()
  private readonly listeners = new Set<() => void>()

  deviceId(): Promise<string> {
    let id = store()?.getItem('quuu.mobile.deviceId') ?? null
    if (!id) {
      id = `browser-${Math.random().toString(36).slice(2, 8)}`
      store()?.setItem('quuu.mobile.deviceId', id)
    }
    return Promise.resolve(id)
  }

  appReady(): Promise<void> {
    // A browser has no shell. Delivery itself does not exist here
    return Promise.resolve()
  }

  folderState(): Promise<FolderState> {
    return Promise.resolve({ configured: true, name: 'Quuu (fake)', readable: true })
  }

  requestAccess(): Promise<FolderState> {
    return this.folderState()
  }

  syncLatestMacState(): Promise<void> {
    // The fake iCloud is always local to the device; there is nothing to fetch
    return Promise.resolve()
  }

  syncPendingIntents(): Promise<void> {
    return Promise.resolve()
  }

  readSnapshot(): Promise<string | null> {
    return Promise.resolve(this.cloud.files[LAYOUT.snapshot] ?? null)
  }

  readDetail(taskId: string): Promise<string | null> {
    return Promise.resolve(this.cloud.files[detailPath(taskId)] ?? null)
  }

  readReceipts(): Promise<string | null> {
    return Promise.resolve(this.cloud.files[LAYOUT.receipts] ?? null)
  }

  listIntents(): Promise<string[]> {
    const prefix = `${LAYOUT.intents}/`
    return Promise.resolve(
      Object.keys(this.cloud.files)
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length))
        .sort()
    )
  }

  readIntent(name: string): Promise<string | null> {
    return Promise.resolve(this.cloud.files[`${LAYOUT.intents}/${name}`] ?? null)
  }

  writeIntent(name: string, body: string): Promise<void> {
    this.cloud.files[`${LAYOUT.intents}/${name}`] = body
    save(this.cloud)
    return Promise.resolve()
  }

  removeIntent(name: string): Promise<void> {
    delete this.cloud.files[`${LAYOUT.intents}/${name}`]
    save(this.cloud)
    return Promise.resolve()
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /**
   * Imitates receiving the screen itself. **Never build a bar that can only be seen
   * on a real device.**
   *
   * The real one appears only while 2.8MB comes down from iCloud. If it cannot be
   * seen while building screens in a browser, it goes to the device with neither its
   * placement nor its height ever checked (the same reason the made-up tasks are here).
   */
  onUpdate(cb: (active: boolean, ratio: number | null) => void): () => void {
    let step = 0
    cb(true, null)
    const timer = setInterval(() => {
      step += 1
      if (step > 8) {
        clearInterval(timer)
        cb(false, null)
        return
      }
      // Early on, iCloud does not report progress either
      cb(true, step < 3 ? null : (step - 2) / 6)
    }, 400)
    return () => clearInterval(timer)
  }
}

/**
 * The made-up data. Built out far enough that **digit counts change, bodies run long,
 * and every status is present.** Verify against tidy data only and whatever breaks on
 * a real device stays hidden until the end.
 */
function seed(cloud: Cloud): void {
  const now = new Date('2026-08-23T10:00:00.000Z')
  const iso = (minutesAgo: number): string =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString()

  const snapshot: SyncSnapshot = {
    version: SYNC_VERSION,
    rev: 42,
    generatedAt: iso(1),
    omittedDone: 0,
    scheduler: { running: true, activeRuns: 1, queued: 3 },
    projects: [
      { id: 'p1', name: 'Quuu', color: '#4EA8DE', priority: 1, enabled: true },
      { id: 'p2', name: 'A project with a very long name indeed', color: '#9D7CD8', priority: 2, enabled: true }
    ],
    tasks: [
      task('t1', 'p1', 'Read the review and decide whether it can be marked done', 'review', 0, 0, iso(12), 2),
      task('t2', 'p1', 'It failed, so look at why', 'failed', 1, 1, iso(30), 3),
      task('t3', 'p2', 'The one running right now', 'running', 2, 2, iso(2), 1),
      task('t4', 'p2', 'The one waiting in the queue', 'queued', 3, 2, iso(60), 0),
      task('t5', 'p1', 'Half-written', 'draft', 4, 2, iso(240), 0),
      task('t6', 'p1', 'The finished one', 'done', 5, 3, iso(1440), 1)
    ]
  }
  cloud.files[LAYOUT.snapshot] = JSON.stringify(snapshot)

  cloud.files[detailPath('t1')] = JSON.stringify(
    detail('t1', 'Read the review and decide whether it can be marked done', 'review', 2, [
      {
        id: 'm1',
        role: 'user',
        at: iso(20),
        text: 'Find out why the tests are failing and fix it',
        tools: 0
      },
      {
        id: 'm2',
        role: 'assistant',
        at: iso(12),
        text: [
          'The cause was **ordering**.',
          '',
          '- `orderTasks` was putting prerequisites last',
          '- Fixed it to push on the way back up from the depth-first walk',
          '',
          '```ts',
          'for (const dep of task.dependsOn) visit(byId.get(dep.taskId))',
          '```',
          '',
          'The tests pass (777 of them).'
        ].join('\n'),
        tools: 14
      }
    ])
  )
  cloud.files[detailPath('t2')] = JSON.stringify(
    detail('t2', 'It failed, so look at why', 'failed', 3, [
      { id: 'm1', role: 'user', at: iso(40), text: 'Work through the PRs every morning', tools: 0 },
      {
        id: 'm2',
        role: 'assistant',
        at: iso(30),
        text: 'Hit the usage limit. The fallback is blocked too.',
        tools: 3
      }
    ])
  )
}

function task(
  id: string,
  projectId: string,
  title: string,
  status: SyncSnapshot['tasks'][number]['status'],
  order: number,
  priority: 0 | 1 | 2 | 3,
  updatedAt: string,
  runSeq: number
): SyncSnapshot['tasks'][number] {
  return {
    id,
    projectId,
    title,
    excerpt: 'The first line of the instructions goes here. When long it clips at the edge.',
    status,
    priority,
    order,
    updatedAt,
    runSeq,
    lastRun:
      runSeq > 0
        ? {
          status: status === 'failed' ? 'limited' : 'succeeded',
          endedAt: updatedAt,
          errorKind: status === 'failed' ? 'limit' : ''
        }
        : null,
    hasPending: false,
    hasReserved: false,
    detailHash: `${id}-1`
  }
}

function detail(
  taskId: string,
  title: string,
  status: SyncTaskDetail['status'],
  runSeq: number,
  messages: SyncTaskDetail['messages']
): SyncTaskDetail {
  return {
    version: SYNC_VERSION,
    taskId,
    hash: `${taskId}-1`,
    generatedAt: '2026-08-23T10:00:00.000Z',
    title,
    prompt: 'The full instructions go here.',
    status,
    runSeq,
    pendingMessage: '',
    reservedMessage: '',
    messages,
    truncated: false,
    runs: []
  }
}
