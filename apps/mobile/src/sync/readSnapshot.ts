import { arr, asRecord, bool, fail, isRunStatus, num, str, versionOk, type ParseResult } from './json.js'
import type { SyncSnapshot, SyncTaskDetail } from './protocol.js'
import { SYNC_VERSION } from './protocol.js'
import type { RunStatus } from './task.js'
import { isPriority, isTaskStatus } from './task.js'


export function parseSnapshot(text: string): ParseResult<SyncSnapshot> {
  const r = asRecord(text)
  if (!r.ok) return r
  const o = r.value
  if (!versionOk(o.version)) return fail(`unreadable version (version=${str(o.version, '?')})`)

  if (!Number.isSafeInteger(o.rev) || Number(o.rev) < 0 || typeof o.generatedAt !== 'string') return fail('cannot read the list revision and generated time')
  if (!Array.isArray(o.projects) || !Array.isArray(o.tasks)) return fail('the lists are missing')
  for (const value of o.projects) {
    if (!value || typeof value !== 'object') return fail('cannot read a project')
    const project = value as Record<string, unknown>
    /*
     * A project's priority is an open number on the Mac ("lower comes first"), not the task
     * scale of 0-3. Held to the task scale, one project set to 5 sank the whole snapshot,
     * and the iPhone said it was waiting for the Mac for good (that actually happened)
     */
    if (typeof project.id !== 'string' || typeof project.name !== 'string' || typeof project.priority !== 'number' || !Number.isFinite(project.priority) || typeof project.enabled !== 'boolean') return fail('cannot read a required project field')
  }
  for (const value of o.tasks) {
    if (!value || typeof value !== 'object') return fail('cannot read a task')
    const task = value as Record<string, unknown>
    if (typeof task.id !== 'string' || typeof task.projectId !== 'string' || typeof task.title !== 'string' || !isTaskStatus(task.status) || !isPriority(task.priority)) return fail('cannot read a required task field')
    if (typeof task.updatedAt !== 'string' || !Number.isSafeInteger(task.runSeq) || Number(task.runSeq) < 0) return fail('cannot read the updatedAt and run count the approval targets')
    if (task.lastRun && (typeof task.lastRun !== 'object' || !isRunStatus((task.lastRun as Record<string, unknown>).status))) return fail('cannot read the run status')
  }
  const scheduler = (o.scheduler ?? {}) as Record<string, unknown>
  return {
    ok: true,
    value: {
      version: num(o.version, SYNC_VERSION),
      rev: num(o.rev),
      generatedAt: str(o.generatedAt),
      omittedDone: num(o.omittedDone),
      scheduler: {
        running: bool(scheduler.running),
        activeRuns: num(scheduler.activeRuns),
        queued: num(scheduler.queued)
      },
      projects: arr(o.projects).flatMap((p) => {
        const x = p as Record<string, unknown>
        if (typeof x?.id !== 'string') return []
        return [
          {
            id: x.id,
            name: str(x.name),
            color: str(x.color, '#4EA8DE'),
            priority: num(x.priority, 2),
            enabled: bool(x.enabled, true)
          }
        ]
      }),
      tasks: arr(o.tasks).flatMap((t) => {
        const x = t as Record<string, unknown>
        if (typeof x?.id !== 'string') return []
        if (!isTaskStatus(x.status)) return []
        const priority = isPriority(x.priority) ? x.priority : 2
        const lastRun = x.lastRun as Record<string, unknown> | null | undefined
        return [
          {
            id: x.id,
            projectId: str(x.projectId),
            title: str(x.title),
            excerpt: str(x.excerpt),
            status: x.status,
            priority,
            order: num(x.order),
            updatedAt: str(x.updatedAt),
            runSeq: num(x.runSeq),
            lastRun:
              lastRun && typeof lastRun.status === 'string'
                ? {
                  status: lastRun.status as RunStatus,
                  endedAt: typeof lastRun.endedAt === 'string' ? lastRun.endedAt : null,
                  errorKind: str(lastRun.errorKind)
                }
                : null,
            hasPending: bool(x.hasPending),
            hasReserved: bool(x.hasReserved),
            detailHash: str(x.detailHash)
          }
        ]
      })
    }
  }
}


export function parseDetail(text: string): ParseResult<SyncTaskDetail> {
  const r = asRecord(text)
  if (!r.ok) return r
  const o = r.value
  if (!versionOk(o.version)) return fail('unreadable version')
  if (typeof o.taskId !== 'string') return fail('taskId is missing')
  if (!isTaskStatus(o.status)) return fail('cannot read status')
  if (typeof o.hash !== 'string' || typeof o.generatedAt !== 'string' || !Number.isSafeInteger(o.runSeq) || Number(o.runSeq) < 0) return fail('cannot read the detail identity fields')
  if (typeof o.title !== 'string' || typeof o.prompt !== 'string') return fail('a required detail field is missing')
  if (!Array.isArray(o.runs) || o.runs.some(v => !v || typeof v !== 'object' || !isRunStatus((v as Record<string, unknown>).status))) return fail('cannot read the run history')

  return {
    ok: true,
    value: {
      version: num(o.version, SYNC_VERSION),
      taskId: o.taskId,
      hash: str(o.hash),
      generatedAt: str(o.generatedAt),
      title: str(o.title),
      prompt: str(o.prompt),
      status: o.status,
      runSeq: num(o.runSeq),
      pendingMessage: str(o.pendingMessage),
      reservedMessage: str(o.reservedMessage),
      truncated: bool(o.truncated),
      messages: arr(o.messages).flatMap((m) => {
        const x = m as Record<string, unknown>
        const role = str(x?.role)
        if (role !== 'user' && role !== 'assistant' && role !== 'system') return []
        return [
          {
            id: str(x.id),
            role,
            at: typeof x.at === 'string' ? x.at : null,
            text: str(x.text),
            tools: num(x.tools)
          }
        ]
      }),
      runs: arr(o.runs).flatMap((v) => {
        const x = v as Record<string, unknown>
        if (typeof x?.id !== 'string') return []
        return [
          {
            id: x.id,
            status: str(x.status, 'failed') as RunStatus,
            agentName: str(x.agentName),
            startedAt: str(x.startedAt),
            endedAt: typeof x.endedAt === 'string' ? x.endedAt : null,
            errorKind: str(x.errorKind),
            errorMessage: str(x.errorMessage)
          }
        ]
      })
    }
  }
}