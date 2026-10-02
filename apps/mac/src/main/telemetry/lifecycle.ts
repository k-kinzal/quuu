import { SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import type { HookEvent } from '../hooks/types.js'
import type { Task } from '../tasks/types.js'
import { ATTR, EVENT, SPAN } from './attributes.js'
import { emitEvent, recordRunDuration, telemetryActive, tracer, truncate } from './index.js'

/** Run endings that mean something went wrong, as opposed to a limit or a person stopping it. */
const FAILED_RUNS = new Set<Run['status']>(['failed', 'timeout'])

/**
 * Report each task's committed lifecycle facts, and each finished run as a span.
 *
 * Together these answer how work actually moves: how long a task waits, how many follow-ups it takes
 * to reach done, which agent hit a limit and fell back, and which runs fail and why.
 */
export function observeTaskLifecycle(db: Db): () => void {
  return repo.observeLifecycle(db, (task, event, run) => {
    // Export can be switched off while the app runs; then describing a fact is wasted reads.
    if (!telemetryActive()) return
    try { report(db, task, event, run) }
    catch (error) { console.warn('Cannot describe a task lifecycle event for telemetry', error) }
  })
}

function report(db: Db, task: Task, event: HookEvent, run?: Run): void {
  const attributes: Attributes = { ...taskAttributes(db, task), [ATTR.taskLifecycle]: event }
  if (run) Object.assign(attributes, runAttributes(db, run))
  if (event === 'completed' || event === 'failed' || event === 'review') {
    const runs = repo.listRunsByTask(db, task.id).filter(entry => entry.source !== 'imported')
    attributes[ATTR.taskRunCount] = runs.length
    attributes[ATTR.taskFollowupCount] = runs.filter(entry => entry.kind === 'followup').length
  }
  emitEvent(EVENT.taskLifecycle, attributes)
  if (event === 'stopped' && run) reportRun(run, attributes)
}

function reportRun(run: Run, attributes: Attributes): void {
  const active = tracer()
  if (!active) return
  const started = Date.parse(run.startedAt)
  const ended = run.endedAt ? Date.parse(run.endedAt) : Date.now()
  // A root of its own: the run began long before whichever call happened to end it.
  const span = active.startSpan(SPAN.run, { kind: SpanKind.INTERNAL, root: true, startTime: started, attributes })
  if (FAILED_RUNS.has(run.status)) span.setStatus({ code: SpanStatusCode.ERROR, message: truncate(run.errorMessage || run.status, 1000) })
  span.end(ended)
  if (Number.isFinite(started) && ended >= started) {
    recordRunDuration((ended - started) / 1000, {
      [ATTR.agentAdapter]: attributes[ATTR.agentAdapter] ?? 'unknown',
      [ATTR.runStatus]: run.status,
      [ATTR.runKind]: run.kind
    })
  }
}

export function taskAttributes(db: Db, task: Task): Attributes {
  const project = repo.getProject(db, task.projectId)
  return {
    [ATTR.taskId]: task.id,
    [ATTR.taskStatus]: task.status,
    [ATTR.taskPriority]: task.priority,
    [ATTR.taskSource]: task.source,
    [ATTR.taskAutomated]: task.ruleId !== null,
    [ATTR.taskAgentPinned]: task.agentOverrideId !== null,
    [ATTR.taskDependencies]: task.dependsOn.length,
    [ATTR.taskAgeSeconds]: Math.max(0, Math.round((Date.now() - Date.parse(task.createdAt)) / 1000)),
    [ATTR.projectId]: task.projectId,
    ...(project ? { [ATTR.projectName]: project.name } : {})
  }
}

function runAttributes(db: Db, run: Run): Attributes {
  const agent = repo.getAgent(db, run.agentId)
  return {
    [ATTR.runId]: run.id,
    [ATTR.runKind]: run.kind,
    [ATTR.runStatus]: run.status,
    [ATTR.runAttempt]: run.attempt,
    [ATTR.runFallback]: run.fallbackFromRunId !== null,
    [ATTR.runRemote]: Boolean(run.runnerId),
    [ATTR.runSource]: run.source,
    [ATTR.agentId]: run.agentId,
    ...(run.errorKind ? { [ATTR.runErrorKind]: run.errorKind } : {}),
    ...(run.exitCode !== null ? { [ATTR.runExitCode]: run.exitCode } : {}),
    ...(run.resolvedFromGroupId ? { [ATTR.agentGroupId]: run.resolvedFromGroupId } : {}),
    ...(agent ? { [ATTR.agentName]: agent.name } : {}),
    [ATTR.agentAdapter]: run.logAdapter ?? agent?.logAdapter ?? 'unknown'
  }
}
