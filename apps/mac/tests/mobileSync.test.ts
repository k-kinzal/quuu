import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUT, detailPath, intentFileName } from '../src/main/mobile-sync/layout.js'
import { appBundlePath } from '../src/main/mobile-sync/appDistribution.js'
import { parseAppManifest } from '../src/main/mobile-sync/readAppManifest.js'
import { parseReceipts } from '../../mobile/src/sync/receipts.js'
import { parseSnapshot } from '../../mobile/src/sync/readSnapshot.js'
import type { SyncIntent } from '../src/main/mobile-sync/protocol.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { inflateRawSync } from 'node:zlib'
import { AppPublisher } from '../src/main/mobile-sync/appPublisher.js'
import { SyncExporter } from '../src/main/mobile-sync/exportSnapshot.js'
import { SyncFolder } from '../src/main/mobile-sync/folder.js'
import { SyncImporter } from '../src/main/mobile-sync/importIntent.js'
import type { IntentTarget } from '../src/main/mobile-sync/importIntent.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/**
 * How many times the session log was actually read. **Directly measures export cost.**
 * Whether we got away with `stat` or really read the file is only observable here.
 */
const probe = vi.hoisted(() => ({ reads: 0 }))

vi.mock('../src/main/mobile-sync/sessionText.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/main/mobile-sync/sessionText.js')>(
      '../src/main/mobile-sync/sessionText.js'
    )
  return {
    ...actual,
    readConversationTail(...args: Parameters<typeof actual.readConversationTail>) {
      probe.reads += 1
      return actual.readConversationTail(...args)
    }
  }
})

/**
 * Hand-off through the iCloud folder (Mac side).
 *
 * The decision rules themselves are covered by the sync decision tests. What we check
 * here is **what ends up in the files, and that what arrives goes through the regular
 * operations**.
 */

let db: Db
let dir: string
let folder: SyncFolder
let projectId: string

/** Stand-in for `QuuuApp`. Records which entry point each intent from the iPhone went through. */
function targetOf(
  db: Db,
  runResult: { ok: boolean; reason?: string } = { ok: true }
): IntentTarget & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    createTask(input, id) {
      calls.push(`create:${id ?? '?'}`)
      return repo.insertTask(
        db,
        { projectId: input.projectId, title: input.title, prompt: input.prompt, status: input.status },
        id
      )
    },
    updateTask(id, patch) {
      calls.push(`update:${id}`)
      return repo.patchTask(db, id, patch)
    },
    enqueueTask(id) {
      calls.push(`enqueue:${id}`)
      return repo.setTaskStatus(db, id, 'queued')
    },
    holdTask(id) {
      calls.push(`hold:${id}`)
      return repo.setTaskStatus(db, id, 'held')
    },
    markDone(id) {
      calls.push(`done:${id}`)
      return repo.setTaskStatus(db, id, 'done')
    },
    sendBack(id, note) {
      calls.push(`sendBack:${id}`)
      if (note) repo.setPendingMessage(db, id, note)
      return repo.setTaskStatus(db, id, 'queued')
    },
    archiveTask(id, archived) {
      calls.push(`archive:${id}`)
      return repo.setTaskArchived(db, id, archived)
    },
    reserveMessage(id, message) {
      const old = repo.getTask(db, id)?.reservedMessage ?? ''
      return repo.setReservedMessage(db, id, [old, message].filter(Boolean).join('\n\n'))
    },
    runNow(id) {
      calls.push(`runNow:${id}`)
      if (runResult.ok) repo.setTaskStatus(db, id, 'running')
      return Promise.resolve(runResult)
    }
  }
}

/** Creates run history. `runSeq` is the key to "did it run again after the answer was read". */
function addRun(db: Db, taskId: string, agentId: string, id: string): void {
  repo.insertRun(db, {
    id,
    taskId,
    agentId,
    resolvedFromGroupId: null,
    sessionId: `sess-${id}`,
    kind: 'initial',
    status: 'succeeded',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: '/tmp',
    command: 'echo',
    args: [],
    promptPreview: '',
    exitCode: 0,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: null,
    stdoutLogPath: `/tmp/${id}.log`
  })
}

function putIntent(intent: SyncIntent): void {
  folder.ensure()
  writeFileSync(
    join(dir, LAYOUT.intents, intentFileName(intent.seq, intent.id)),
    JSON.stringify(intent),
    'utf8'
  )
}

function intent(over: Partial<SyncIntent> & { op: SyncIntent['op'] }): SyncIntent {
  return {
    version: 1,
    id: over.id ?? `i-${over.seq ?? 1}`,
    device: 'iphone',
    seq: over.seq ?? 1,
    createdAt: over.createdAt ?? '2026-08-23T10:00:00.000Z',
    baseRev: 1,
    expect: over.expect ?? null,
    ...over
  }
}

beforeEach(() => {
  db = memoryDb()
  dir = mkdtempSync(join(tmpdir(), 'quuu-sync-'))
  folder = new SyncFolder(dir)
  const agentId = makeAgent(db, { name: 'A' })
  projectId = makeProject(db, { name: 'P', targetId: agentId })
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('export', () => {
  it('writes what the list needs, plus per-task detail for opening and reading', () => {
    const taskId = makeTask(db, projectId, 'やること')
    new SyncExporter(db).export(folder, true)

    const snapshot = parseSnapshot(readFileSync(join(dir, LAYOUT.snapshot), 'utf8'))
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    expect(snapshot.value.tasks.map((t) => t.id)).toEqual([taskId])
    expect(snapshot.value.projects.map((p) => p.name)).toEqual(['P'])
    expect(snapshot.value.scheduler.running).toBe(true)
    expect(readFileSync(join(dir, detailPath(taskId)), 'utf8')).toContain('やること')
  })

  it('carries Codex conversations to the iPhone with roles, from the structured log', () => {
    const codex = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'codex' })
    const taskId = makeTask(db, projectId, 'Codex の結果')
    const logPath = join(dir, 'codex.jsonl')
    writeFileSync(
      logPath,
      [
        JSON.stringify({
          type: 'response_item',
          payload: { type: 'message', role: 'user', content: [{ type: 'text', text: '調査して' }] }
        }),
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: '原因を直しました' }]
          }
        })
      ].join('\n')
    )
    addRun(db, taskId, codex, 'codex')
    repo.updateRun(db, 'codex', { sessionLogPath: logPath })

    new SyncExporter(db).export(folder, true)

    const detail = JSON.parse(readFileSync(join(dir, detailPath(taskId)), 'utf8')) as {
      messages: Array<{ role: string; text: string }>
    }
    expect(detail.messages).toEqual([
      expect.objectContaining({ role: 'user', text: '調査して' }),
      expect.objectContaining({ role: 'assistant', text: '原因を直しました' })
    ])
  })

  it('leaves an explanation for someone who opens the folder in the Files app', () => {
    new SyncExporter(db).export(folder, true)
    expect(readFileSync(join(dir, LAYOUT.readme), 'utf8')).toContain('written by the Mac')
  })

  it('does not rewrite when content is unchanged — no sync traffic on a day when nothing happened', () => {
    makeTask(db, projectId, 'やること')
    const exporter = new SyncExporter(db)
    expect(exporter.export(folder, true).wrote).toBe(true)
    expect(exporter.export(folder, true).wrote).toBe(false)
  })

  it('a change bumps the revision by one', () => {
    const exporter = new SyncExporter(db)
    makeTask(db, projectId, '1 件目')
    const first = exporter.export(folder, true).rev
    makeTask(db, projectId, '2 件目')
    expect(exporter.export(folder, true).rev).toBe(first + 1)
  })

  it('the Mac decides list order (the iPhone gets no sorting rules)', () => {
    const high = makeTask(db, projectId, '急ぎ', 0)
    const low = makeTask(db, projectId, '後で', 3)
    new SyncExporter(db).export(folder, true)
    const snapshot = parseSnapshot(readFileSync(join(dir, LAYOUT.snapshot), 'utf8'))
    if (!snapshot.ok) throw new Error('unreadable')
    expect(snapshot.value.tasks.map((t) => t.id)).toEqual([high, low])
    expect(snapshot.value.tasks.map((t) => t.order)).toEqual([0, 1])
  })

  it('exports only recent done tasks and notes how many were cut (no drawing hundreds of rows on a phone)', () => {
    // 1 unfinished task + 60 done
    makeTask(db, projectId, '未完了のもの')
    for (let i = 0; i < 60; i++) {
      repo.setTaskStatus(db, makeTask(db, projectId, `完了 ${i}`), 'done')
    }
    new SyncExporter(db).export(folder, true)
    const snapshot = parseSnapshot(readFileSync(join(dir, LAYOUT.snapshot), 'utf8'))
    if (!snapshot.ok) throw new Error('unreadable')

    const done = snapshot.value.tasks.filter((t) => t.status === 'done')
    expect(done).toHaveLength(50)
    expect(snapshot.value.omittedDone).toBe(10)
    // not a single unfinished task is dropped
    expect(snapshot.value.tasks.filter((t) => t.status !== 'done')).toHaveLength(1)
  })

  it('archived tasks are not included', () => {
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskArchived(db, taskId, true)
    new SyncExporter(db).export(folder, true)
    const snapshot = parseSnapshot(readFileSync(join(dir, LAYOUT.snapshot), 'utf8'))
    if (!snapshot.ok) throw new Error('unreadable')
    expect(snapshot.value.tasks).toEqual([])
  })

  it('cleans up detail files that fell out of scope (no leftover conversations for deleted tasks)', () => {
    const taskId = makeTask(db, projectId, 'やること')
    const exporter = new SyncExporter(db)
    exporter.export(folder, true)
    expect(folder.exists(detailPath(taskId))).toBe(true)

    repo.deleteTask(db, taskId)
    exporter.export(folder, true)
    expect(folder.exists(detailPath(taskId))).toBe(false)
  })

  it('never shows the other side a half-written file (write to a temp file, then replace)', () => {
    makeTask(db, projectId, 'やること')
    new SyncExporter(db).export(folder, true)
    // no .tmp left behind = the replace step completed
    expect(folder.list(LAYOUT.mac).some((n) => n.endsWith('.tmp'))).toBe(false)
  })
})

describe('import', () => {
  it('a task created on the iPhone keeps the id the device assigned', () => {
    const target = targetOf(db)
    putIntent(
      intent({
        op: {
          kind: 'task.create',
          taskId: 'phone-1',
          projectId,
          title: '思いついたこと',
          prompt: '本文',
          priority: 1,
          enqueue: true
        }
      })
    )
    const result = new SyncImporter(db).sync(folder, target)
    expect(result.applied).toBe(1)
    expect(repo.getTask(db, 'phone-1')?.title).toBe('思いついたこと')
    expect(target.calls).toEqual(['create:phone-1'])
  })

  it('a task added as held goes to held, not into the queue', () => {
    const target = targetOf(db)
    putIntent(
      intent({
        version: 2,
        op: {
          kind: 'task.create',
          taskId: 'phone-held',
          projectId,
          title: 'あとでやること',
          prompt: '指示',
          priority: 2,
          enqueue: false,
          action: 'held'
        }
      })
    )

    new SyncImporter(db).sync(folder, target)

    expect(repo.getTask(db, 'phone-held')?.status).toBe('held')
    expect(target.calls).toEqual(['create:phone-held'])
  })

  it('a task added as run-now goes straight to manual run, skipping the queue', () => {
    const target = targetOf(db)
    putIntent(
      intent({
        version: 2,
        op: {
          kind: 'task.create',
          taskId: 'phone-now',
          projectId,
          title: 'いまやること',
          prompt: '指示',
          priority: 2,
          enqueue: false,
          action: 'now'
        }
      })
    )

    new SyncImporter(db).sync(folder, target)

    expect(repo.getTask(db, 'phone-now')?.status).toBe('running')
    expect(target.calls).toEqual(['create:phone-now', 'runNow:phone-now'])
  })

  it('when run-now is not possible, the task is queued rather than left as a draft', async () => {
    const target = targetOf(db, { ok: false, reason: 'no execution slot' })
    putIntent(
      intent({
        version: 2,
        op: {
          kind: 'task.create',
          taskId: 'phone-now-queued',
          projectId,
          title: '空き次第やること',
          prompt: '指示',
          priority: 2,
          enqueue: false,
          action: 'now'
        }
      })
    )

    new SyncImporter(db).sync(folder, target)

    await vi.waitFor(() => expect(repo.getTask(db, 'phone-now-queued')?.status).toBe('queued'))
    expect(target.calls).toEqual([
      'create:phone-now-queued',
      'runNow:phone-now-queued',
      'enqueue:phone-now-queued'
    ])
  })

  it('the same intent arriving twice is not applied twice', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'review')
    putIntent(intent({ op: { kind: 'task.done', taskId } }))

    const importer = new SyncImporter(db)
    expect(importer.sync(folder, target).applied).toBe(1)
    // the file stays behind (cleanup is the iPhone's job)
    expect(importer.sync(folder, target).applied).toBe(0)
    expect(target.calls).toEqual([`done:${taskId}`])
  })

  it('while an intent file remains, the receipt is rewritten even if already applied', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'review')
    putIntent(intent({ op: { kind: 'task.done', taskId } }))

    const importer = new SyncImporter(db)
    expect(importer.sync(folder, target).applied).toBe(1)
    writeFileSync(join(dir, LAYOUT.receipts), '古い受領書', 'utf8')

    expect(importer.sync(folder, target).applied).toBe(0)
    const receipts = parseReceipts(readFileSync(join(dir, LAYOUT.receipts), 'utf8'))
    expect(receipts.ok && receipts.value.entries[0].taskId).toBe(taskId)
    expect(target.calls).toEqual([`done:${taskId}`])
  })

  it('reorders to press order before applying (iCloud does not guarantee arrival order)', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること', 2, 'draft')
    // deliberately drop the later one in first
    putIntent(intent({ seq: 2, id: 'i-b', op: { kind: 'task.unqueue', taskId } }))
    putIntent(intent({ seq: 1, id: 'i-a', op: { kind: 'task.enqueue', taskId } }))

    new SyncImporter(db).sync(folder, target)
    expect(target.calls).toEqual([`enqueue:${taskId}`, `hold:${taskId}`])
    expect(repo.getTask(db, taskId)?.status).toBe('held')
  })

  it('if it ran again after being read, do not mark done, and write the reason to the receipt', () => {
    const target = targetOf(db)
    const agentId = makeAgent(db, { name: 'B' })
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'review')
    // the iPhone was looking at run 1; it ran once more after that
    addRun(db, taskId, agentId, 'r1')
    addRun(db, taskId, agentId, 'r2')

    putIntent(
      intent({
        op: { kind: 'task.done', taskId },
        expect: { status: 'review', updatedAt: '2026-08-23T09:00:00.000Z', runSeq: 1 }
      })
    )
    const result = new SyncImporter(db).sync(folder, target)
    expect(result.applied).toBe(0)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].reason).toContain('run again')
    expect(repo.getTask(db, taskId)?.status).toBe('review')

    const receipts = parseReceipts(readFileSync(join(dir, LAYOUT.receipts), 'utf8'))
    expect(receipts.ok && receipts.value.entries[0].outcome).toBe('conflict')
  })

  it('a follow-up arriving mid-run is held as "send when it finishes" (not silently dropped)', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'running')
    putIntent(intent({ op: { kind: 'task.sendBack', taskId, message: 'あとで足す' } }))

    const result = new SyncImporter(db).sync(folder, target)
    expect(result.deferred).toBe(1)
    expect(repo.getTask(db, taskId)?.reservedMessage).toBe('あとで足す')
    // no regular operation that touches a running task gets called
    expect(target.calls).toEqual([])
  })

  it('a second held message is appended, not overwritten', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'running')
    putIntent(intent({ seq: 1, id: 'a', op: { kind: 'task.sendBack', taskId, message: '1 通目' } }))
    putIntent(intent({ seq: 2, id: 'b', op: { kind: 'task.sendBack', taskId, message: '2 通目' } }))

    new SyncImporter(db).sync(folder, target)
    expect(repo.getTask(db, taskId)?.reservedMessage).toBe('1 通目\n\n2 通目')
  })

  it('a broken file does not stop the other intents from applying', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'review')
    folder.ensure()
    writeFileSync(join(dir, LAYOUT.intents, '000000000001-broken.json'), '{ "half', 'utf8')
    putIntent(intent({ seq: 2, id: 'ok', op: { kind: 'task.done', taskId } }))

    const result = new SyncImporter(db).sync(folder, target)
    expect(result.applied).toBe(1)
    expect(result.unreadable).toBe(1)
  })

  it('applying goes through the regular operations — side effects that wake the scheduler are not lost', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること', 2, 'draft')
    putIntent(intent({ op: { kind: 'task.enqueue', taskId } }))
    new SyncImporter(db).sync(folder, target)
    expect(target.calls).toEqual([`enqueue:${taskId}`])
  })

  it('the receipt never lists the same row twice (handled records are re-read from the DB)', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'review')
    putIntent(intent({ op: { kind: 'task.done', taskId } }))

    new SyncImporter(db).sync(folder, target)
    const receipts = parseReceipts(readFileSync(join(dir, LAYOUT.receipts), 'utf8'))
    expect(receipts.ok && receipts.value.entries).toHaveLength(1)
  })

  it('conflicts are recorded too, so the same decision is not repeated every cycle', () => {
    const target = targetOf(db)
    const taskId = makeTask(db, projectId, 'やること')
    repo.setTaskStatus(db, taskId, 'running')
    putIntent(intent({ op: { kind: 'task.done', taskId } }))

    const importer = new SyncImporter(db)
    expect(importer.sync(folder, target).conflicts).toHaveLength(1)
    expect(importer.sync(folder, target).conflicts).toHaveLength(0)
  })
})

describe('settings', () => {
  it('has sync turned on by default (never makes the person start it)', () => {
    expect(DEFAULT_SETTINGS.mobileSyncEnabled).toBe(true)
  })
})

describe('the folder', () => {
  it('reports a file that has not come down yet as unreadable, not as missing', () => {
    folder.ensure()
    // The stand-in for when iCloud has evicted the contents
    writeFileSync(join(dir, LAYOUT.intents, '.000000000001-x.json.icloud'), '', 'utf8')
    expect(folder.list(LAYOUT.intents)).toEqual(['000000000001-x.json'])
    expect(folder.read(`${LAYOUT.intents}/000000000001-x.json`)).toBeNull()
  })

  it('keeps half-written temp files out of the listing', () => {
    folder.ensure()
    writeFileSync(join(dir, LAYOUT.intents, 'a.json.tmp'), '{}', 'utf8')
    expect(folder.list(LAYOUT.intents)).toEqual([])
  })
})

/**
 * The cost of writing. **There is only one main process.**
 *
 * When this is heavy, IPC stalls for that whole time and **the log display in the UI lags**.
 * It was actually reported as "new agent log lines started showing up late".
 */
describe('the cost of writing', () => {
  /** Build one run's worth of session log. JSONL with `lines` lines. */
  function withLog(taskId: string, lines: number, pad = 0): string {
    const agentId = repo.listAgents(db)[0].id
    const logPath = join(dir, `session-${taskId}.jsonl`)
    const body: string[] = []
    for (let i = 0; i < lines; i += 1) {
      body.push(
        JSON.stringify({
          type: 'assistant',
          uuid: `u${i}`,
          timestamp: '2026-08-23T10:00:00.000Z',
          message: { content: [{ type: 'text', text: `${i}番目${'あ'.repeat(pad)}` }] }
        })
      )
    }
    writeFileSync(logPath, body.join('\n'), 'utf8')
    repo.insertRun(db, {
      id: `run-${taskId}`,
      taskId,
      agentId,
      resolvedFromGroupId: null,
      sessionId: `sess-${taskId}`,
      kind: 'initial',
      status: 'succeeded',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: '/tmp',
      command: 'echo',
      args: [],
      promptPreview: '',
      exitCode: 0,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: logPath,
      stdoutLogPath: `/tmp/run-${taskId}.log`
    })
    return logPath
  }

  it('reads only the tail of the log (never parses the whole thing)', () => {
    const taskId = makeTask(db, projectId, 'ながい会話')
    // Make it too big to fit inside the 2MB window
    withLog(taskId, 400, 8_000)
    new SyncExporter(db).export(folder, true)

    const detail = JSON.parse(readFileSync(join(dir, detailPath(taskId)), 'utf8')) as {
      messages: { text: string }[]
      truncated: boolean
    }
    expect(detail.messages.length).toBeGreaterThan(0)
    // The tail is included. The head was never read, so it is not
    expect(detail.messages[detail.messages.length - 1].text).toContain('399番目')
    expect(detail.messages.some((m) => m.text.startsWith('0番目'))).toBe(false)
    expect(detail.truncated).toBe(true)
  })

  it('does not re-read the log when nothing has moved', () => {
    const taskId = makeTask(db, projectId, 'やること')
    withLog(taskId, 5)

    const exporter = new SyncExporter(db)
    probe.reads = 0
    exporter.export(folder, true)
    expect(probe.reads, 'the first pass reads').toBe(1)

    // Second pass. Nothing moved, so `stat` alone is enough
    exporter.export(folder, true)
    expect(probe.reads, 'the second pass does not read').toBe(1)
  })

  it('re-reads once the log grows (never leaves a stale conversation showing)', () => {
    const taskId = makeTask(db, projectId, 'やること')
    const logPath = withLog(taskId, 2)

    const exporter = new SyncExporter(db)
    exporter.export(folder, true)
    probe.reads = 0
    const before = readFileSync(join(dir, detailPath(taskId)), 'utf8')

    appendFileSync(
      logPath,
      `\n${JSON.stringify({
        type: 'assistant',
        uuid: 'u-new',
        timestamp: '2026-08-23T11:00:00.000Z',
        message: { content: [{ type: 'text', text: 'あとから足した' }] }
      })}`,
      'utf8'
    )
    expect(exporter.export(folder, true).wrote).toBe(true)
    expect(probe.reads, 'it goes and reads what was added').toBe(1)

    const after = readFileSync(join(dir, detailPath(taskId)), 'utf8')
    expect(after).not.toBe(before)
    expect(after).toContain('あとから足した')
  })
})

/**
 * Shipping the iPhone screens. **So they can be fixed without plugging in a cable.**
 *
 * Almost every fix lands on the screen (Web) side, yet a single character change meant
 * plugging the device into the Mac. Now the cable is only needed when the shell (Swift) changes.
 */
describe('shipping the screens', () => {
  let web: string

  beforeEach(() => {
    web = mkdtempSync(join(tmpdir(), 'quuu-web-'))
    mkdirSync(join(web, 'assets'), { recursive: true })
    writeFileSync(join(web, 'index.html'), '<html>いち</html>', 'utf8')
    writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)', 'utf8')
  })

  afterEach(() => rmSync(web, { recursive: true, force: true }))

  function manifestOf(): { build: string; files: { path: string; bytes: number }[] } {
    const parsed = parseAppManifest(readFileSync(join(dir, LAYOUT.appManifest), 'utf8'))
    if (!parsed.ok) throw new Error(parsed.reason)
    return parsed.value
  }

  it('writes the manifest and the contents', () => {
    const result = new AppPublisher().publish(folder, web)
    expect(result.published).toBe(true)

    const manifest = manifestOf()
    expect(manifest.files.map((f) => f.path).sort()).toEqual(['assets/app.js', 'index.html'])

    /*
     * The contents are one single blob. Slicing it by `bytes` in manifest order restores the files
     * (never make iCloud carry hundreds of files)
     */
    const blob = inflateRawSync(readFileSync(join(dir, appBundlePath(manifest.build))))
    let at = 0
    const cut = new Map<string, string>()
    for (const f of manifest.files) {
      cut.set(f.path, blob.subarray(at, at + f.bytes).toString('utf8'))
      at += f.bytes
    }
    expect(at).toBe(blob.byteLength)
    expect(cut.get('index.html')).toBe('<html>いち</html>')
    expect(cut.get('assets/app.js')).toBe('console.log(1)')
  })

  it('does not re-ship when the contents are identical (never runs iCloud for nothing)', () => {
    const publisher = new AppPublisher()
    expect(publisher.publish(folder, web).published).toBe(true)
    // A different instance, i.e. nothing remembered, still notices by reading the manifest
    expect(new AppPublisher().publish(folder, web).published).toBe(false)
  })

  it('re-ships when the manifest is there but the body is not (it still arrives after the way it travels changes)', () => {
    const publisher = new AppPublisher()
    publisher.publish(folder, web)
    const build = manifestOf().build

    // Delete only the contents (the old shape still looks "already shipped")
    rmSync(join(dir, appBundlePath(build)))
    expect(new AppPublisher().publish(folder, web).published).toBe(true)
    expect(existsSync(join(dir, appBundlePath(build)))).toBe(true)
  })

  it('ships a rebuild and leaves no old version behind', () => {
    const publisher = new AppPublisher()
    publisher.publish(folder, web)
    const first = manifestOf().build

    writeFileSync(join(web, 'index.html'), '<html>に</html>', 'utf8')
    expect(publisher.publish(folder, web).published).toBe(true)

    const second = manifestOf().build
    expect(second).not.toBe(first)
    expect(existsSync(join(dir, LAYOUT.app, first))).toBe(false)
    expect(existsSync(join(dir, LAYOUT.app, second))).toBe(true)
  })

  it('does not mix in source maps (they mean nothing to anyone without the sources)', () => {
    writeFileSync(join(web, 'assets', 'app.js.map'), '{}', 'utf8')
    new AppPublisher().publish(folder, web)
    expect(manifestOf().files.map((f) => f.path)).not.toContain('assets/app.js.map')
  })

  it('does not stop when there are no screens to ship (it keeps running on the baked-in screens)', () => {
    const result = new AppPublisher().publish(folder, join(web, 'missing'))
    expect(result.published).toBe(false)
    expect(existsSync(join(dir, LAYOUT.appManifest))).toBe(false)
  })
})
