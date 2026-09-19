import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuuuApp } from '../apps/mac/src/main/bootstrap.js'
import * as repo from '../apps/mac/src/main/db/repo.js'
import { SyncExporter } from '../apps/mac/src/main/mobile-sync/exportSnapshot.js'
import { SyncImporter } from '../apps/mac/src/main/mobile-sync/importIntent.js'
import { SyncFolder } from '../apps/mac/src/main/mobile-sync/folder.js'
import { parseIntent as macReadIntent } from '../apps/mac/src/main/mobile-sync/readIntent.js'
import { LAYOUT, detailPath, intentFileName } from '../apps/mobile/src/sync/layout.js'
import { parseDetail, parseSnapshot } from '../apps/mobile/src/sync/readSnapshot.js'
import { parseReceipts } from '../apps/mobile/src/sync/receipts.js'
import { makeIntent } from '../apps/mobile/src/sync/writeIntent.js'
import type { SyncSnapshot } from '../apps/mobile/src/sync/protocol.js'

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/mobile-sync/${name}.json`, import.meta.url), 'utf8')
let app: QuuuApp
let directory: string
let folder: SyncFolder
beforeEach(() => {
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
  directory = mkdtempSync(join(tmpdir(), 'quuu-compat-'))
  folder = new SyncFolder(directory)
  folder.ensure()
})
afterEach(() => { app.shutdown(); app.db.close(); rmSync(directory, { recursive: true, force: true }) })

describe('communication between a Mac and an iPhone shipped at different times', () => {
  it('reads the established format from pinned examples, and keeps the same meaning when extra fields are present', () => {
    const old = JSON.parse(fixture('snapshot-v1')) as SyncSnapshot
    expect(parseSnapshot(fixture('snapshot-v1'))).toEqual({ ok: true, value: old })
    expect(parseSnapshot(JSON.stringify({ ...old, futureMetadata: 'ignored' }))).toEqual({ ok: true, value: old })
    expect(parseDetail(fixture('detail-v1'))).toEqual({ ok: true, value: JSON.parse(fixture('detail-v1')) as unknown })
    expect(parseReceipts(fixture('receipts-v1'))).toEqual({ ok: true, value: JSON.parse(fixture('receipts-v1')) as unknown })
    for (const version of [1, 2]) expect(macReadIntent(fixture(`intent-v${version}`))).toEqual({ ok: true, value: JSON.parse(fixture(`intent-v${version}`)) as unknown })
  })

  it('the iPhone reads what the Mac actually exported, and the Mac applies the phone request and returns a receipt', () => {
    const project = app.projects.createProject({ name: '確認', path: directory })
    const task = app.tasks.createTask({ projectId: project.id, title: '読む', prompt: '**本文**', status: 'held' })
    new SyncExporter(app.db).export(folder, false)
    const snapshot = parseSnapshot(folder.read(LAYOUT.snapshot)!)
    expect(snapshot.ok && snapshot.value.tasks.find(t => t.id === task.id)?.status).toBe('held')
    const detail = parseDetail(folder.read(detailPath(task.id))!)
    expect(detail.ok && detail.value).toMatchObject({ taskId: task.id, title: '読む', prompt: '**本文**', status: 'held', runSeq: 0 })
    const intent = makeIntent({ id: 'phone-1', device: 'phone', seq: 1, createdAt: new Date().toISOString(), baseRev: 1, op: { kind: 'task.edit', taskId: task.id, title: '変更済み' }, expect: null })
    const body = JSON.stringify(intent)
    expect(macReadIntent(body)).toEqual({ ok: true, value: intent })
    folder.write(`${LAYOUT.intents}/${intentFileName(intent.seq, intent.id)}`, body)
    const importer = new SyncImporter(app.db)
    expect(importer.sync(folder, app.tasks).applied).toBe(1)
    expect(app.tasks.getTask(task.id)?.title).toBe('変更済み')
    const receipts = parseReceipts(folder.read(LAYOUT.receipts)!)
    expect(receipts.ok && receipts.value.entries[0].outcome).toBe('applied')
    expect(importer.sync(folder, app.tasks).applied).toBe(0)
  })

  it('rolls back a change and its notification when it fails midway, then records only the rejected receipt', () => {
    const project = app.projects.createProject({ name: '確認', path: directory })
    const task = app.tasks.createTask({ projectId: project.id, title: '元の名前' })
    let notifications = 0
    app.on('changed', () => { notifications++ })
    const original = app.tasks.updateTask.bind(app.tasks)
    app.tasks.updateTask = (id, patch) => { original(id, patch); throw new Error('failure midway through saving') }
    const intent = makeIntent({ id: 'failed-edit', device: 'phone', seq: 1, createdAt: '2026-09-06', baseRev: 1, op: { kind: 'task.edit', taskId: task.id, title: '残ってはいけない' }, expect: null })
    folder.write(`${LAYOUT.intents}/${intentFileName(intent.seq, intent.id)}`, JSON.stringify(intent))
    expect(new SyncImporter(app.db).sync(folder, app.tasks).conflicts).toHaveLength(1)
    expect(app.tasks.getTask(task.id)?.title).toBe('元の名前')
    expect(notifications).toBe(0)
    expect(repo.appliedIntentIds(app.db).has(intent.id)).toBe(true)
  })

  it('a failed post-save notification does not turn an applied result into a rejection, and a resend does not apply it twice', () => {
    const project = app.projects.createProject({ name: '確認', path: directory })
    const task = app.tasks.createTask({ projectId: project.id, title: '元の名前' })
    app.on('changed', () => { throw new Error('the notification target went away') })
    const intent = makeIntent({ id: 'notify-failed', device: 'phone', seq: 1, createdAt: '2026-09-06', baseRev: 1, op: { kind: 'task.edit', taskId: task.id, title: '保存済み' }, expect: null })
    folder.write(`${LAYOUT.intents}/${intentFileName(intent.seq, intent.id)}`, JSON.stringify(intent))
    const warning = vi.spyOn(console, 'error').mockImplementation(() => { })
    try {
      const importer = new SyncImporter(app.db)
      expect(importer.sync(folder, app.tasks).applied).toBe(1)
      expect(app.tasks.getTask(task.id)?.title).toBe('保存済み')
      const receipts = parseReceipts(folder.read(LAYOUT.receipts)!)
      expect(receipts.ok && receipts.value.entries[0].outcome).toBe('applied')
      expect(importer.sync(folder, app.tasks).applied).toBe(0)
    } finally { warning.mockRestore() }
  })

  it.each(['runSeq', 'updatedAt'])('refuses to build an intent from a list missing %s on the task it approves', (field) => {
    const old = JSON.parse(fixture('snapshot-v1')) as SyncSnapshot
    expect(parseSnapshot(JSON.stringify({ ...old, tasks: old.tasks.map(task => ({ ...task, [field]: undefined })) })).ok).toBe(false)
  })

  it('never fills in an unknown status, an unknown operation, or a missing required field with another meaning', () => {
    const old = JSON.parse(fixture('snapshot-v1')) as SyncSnapshot
    expect(parseSnapshot(JSON.stringify({ ...old, tasks: [{ ...old.tasks[0], status: 'future' }] })).ok).toBe(false)
    expect(parseSnapshot(JSON.stringify({ ...old, tasks: [{ id: 'x', status: 'draft' }] })).ok).toBe(false)
    const intent = JSON.parse(fixture('intent-v1')) as Record<string, unknown>
    expect(macReadIntent(JSON.stringify({ ...intent, op: { kind: 'task.unknown', taskId: 't1' } })).ok).toBe(false)
    expect(macReadIntent(JSON.stringify({ ...intent, version: 999 })).ok).toBe(false)
  })
})
