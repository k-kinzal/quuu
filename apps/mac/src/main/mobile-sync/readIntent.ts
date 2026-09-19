import { asRecord, bool, fail, intentVersionOk, isAddAction, isPriority, isTaskStatus, num, str, type ParseResult } from './json.js'
import type { SyncIntent, SyncOp } from './protocol.js'


const OP_KINDS = [
  'task.create',
  'task.edit',
  'task.enqueue',
  'task.unqueue',
  'task.done',
  'task.sendBack',
  'task.archive'
]


function parseOp(v: unknown, version: number): SyncOp | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const kind = str(o.kind)
  const taskId = str(o.taskId)
  if (!OP_KINDS.includes(kind) || !taskId) return null

  switch (kind) {
    case 'task.create':
      if (typeof o.projectId !== 'string' || !o.projectId || typeof o.title !== 'string' || typeof o.prompt !== 'string' || !isPriority(o.priority)) return null
      if (version === 1 && typeof o.enqueue !== 'boolean') return null
      if (version >= 2 && !isAddAction(o.action)) return null
      return {
        kind: 'task.create',
        taskId,
        projectId: str(o.projectId),
        title: str(o.title),
        prompt: str(o.prompt),
        priority: isPriority(o.priority) ? o.priority : 2,
        enqueue: bool(o.enqueue),
        ...(version >= 2 && isAddAction(o.action) ? { action: o.action } : {})
      }
    case 'task.edit': {
      if (o.title !== undefined && typeof o.title !== 'string' || o.prompt !== undefined && typeof o.prompt !== 'string' || o.projectId !== undefined && typeof o.projectId !== 'string' || o.priority !== undefined && !isPriority(o.priority)) return null
      const op: SyncOp = { kind: 'task.edit', taskId }
      if (typeof o.title === 'string') op.title = o.title
      if (typeof o.prompt === 'string') op.prompt = o.prompt
      if (isPriority(o.priority)) op.priority = o.priority
      if (typeof o.projectId === 'string') op.projectId = o.projectId
      return op
    }
    case 'task.sendBack':
      if (typeof o.message !== 'string') return null
      return { kind: 'task.sendBack', taskId, message: str(o.message) }
    case 'task.enqueue':
    case 'task.unqueue':
    case 'task.done':
    case 'task.archive':
      return { kind, taskId }
    default:
      return null
  }
}


export function parseIntent(text: string): ParseResult<SyncIntent> {
  const r = asRecord(text)
  if (!r.ok) return r
  const o = r.value
  if (!intentVersionOk(o.version)) return fail('unreadable version')
  if (typeof o.id !== 'string' || !o.id) return fail('no id')
  const version = num(o.version, -1)
  const op = parseOp(o.op, version)
  if (!op) return fail('op is unreadable')

  if (typeof o.device !== 'string' || !o.device || typeof o.seq !== 'number' || !Number.isInteger(o.seq) || o.seq < 0 || typeof o.createdAt !== 'string' || typeof o.baseRev !== 'number' || !Number.isInteger(o.baseRev) || o.baseRev < 0) return fail('required intent fields are missing')
  if (o.expect != null && (typeof o.expect !== 'object' || !isTaskStatus((o.expect as Record<string, unknown>).status) || typeof (o.expect as Record<string, unknown>).updatedAt !== 'string' || typeof (o.expect as Record<string, unknown>).runSeq !== 'number' || !Number.isInteger((o.expect as Record<string, unknown>).runSeq) || Number((o.expect as Record<string, unknown>).runSeq) < 0)) return fail('the expected state is unreadable')
  const rawExpect = o.expect as Record<string, unknown> | null | undefined
  const expect =
    rawExpect && isTaskStatus(rawExpect.status)
      ? {
        status: rawExpect.status,
        updatedAt: str(rawExpect.updatedAt),
        runSeq: num(rawExpect.runSeq)
      }
      : null

  return {
    ok: true,
    value: {
      version,
      id: o.id,
      device: str(o.device, 'unknown'),
      seq: num(o.seq),
      createdAt: str(o.createdAt),
      baseRev: num(o.baseRev),
      op,
      expect
    }
  }
}