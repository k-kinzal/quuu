import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { setImmediate as yieldToApp } from 'node:timers/promises'
import { userDataDir } from '../appPaths.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { isProcessAlive } from '../platform/runProcess.js'
import { processStartedAt } from '../platform/processProbe.js'
import { isOutputSnapshot, removeRuntimeOutput } from '../platform/runOutput.js'
import { auxiliaryReadTarget, type AuxiliarySource } from '../session/auxiliaryLogs.js'
import { SessionIndex, sessionKey } from '../session/index.js'
import { sessionReadTarget, type SessionReadTarget } from '../session/sessionAttach.js'
import type { Run } from './types.js'

const ACTIVE = new Set(['queued', 'starting', 'running', 'generating'])

/** Receipts live only until their owner has settled and its conversation has been captured. */
export class OutputCleanup {
  private stopped = false
  private work: Promise<void> | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private db: Db, private sessions: SessionIndex, private root = userDataDir()) {}

  start(): void {
    void this.sweep()
    this.timer = setInterval(() => { void this.sweep() }, 5000)
    this.timer.unref()
  }
  stop(): void { this.stopped = true; if (this.timer) clearInterval(this.timer) }
  sweep(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    this.work ??= this.collect().catch(error => {
      if (!this.stopped) console.warn('Cannot collect execution output', error)
    }).finally(() => { this.work = null })
    return this.work
  }

  private async preserve(path: string, target: SessionReadTarget, run?: Run): Promise<void> {
    // Never reparse a legacy raw log over an already saved conversation. In particular the
    // migration of a 20 GB receipt must not move those bytes into SQLite instead.
    const saved = repo.getSessionIndex(this.db, sessionKey(target))
    if (!(saved && target.logPath === path && !isOutputSnapshot(path))) {
      if (run) this.sessions.request(run, target, true)
      else this.sessions.requestAuxiliary(target, false)
      await this.sessions.ready(sessionKey(target))
    }
    if (!this.stopped) removeRuntimeOutput(path, this.root)
  }

  private async collect(): Promise<void> {
    await yieldToApp()
    if (this.stopped) return
    const reports = new Map(repo.listOutputReports(this.db).map(row => [resolve(row.logPath), row]))
    for (const path of new Set([...outputFiles(join(this.root, 'logs')), ...outputFiles(join(this.root, 'reports'))])) {
      if (this.stopped) return
      try {
        const id = basename(path, '.log')
        const run = repo.getRun(this.db, id)
        const hook = repo.getHookRun(this.db, id)
        const report = reports.get(resolve(path))
        const remote = repo.getRemoteJob(this.db, id)
        const owner = run ?? hook ?? report
        if (owner && (ACTIVE.has(owner.status) || stillWriting(owner))) continue
        if (remote && remote.status !== 'finished') continue
        if (run) {
          // Imported paths belong to the CLI, even if somebody placed one in our data tree.
          if (run.source === 'imported' || resolve(run.stdoutLogPath) !== resolve(path)) continue
          await this.preserve(path, sessionReadTarget(this.db, run), run)
        } else if (hook || report) {
          const source: AuxiliarySource = hook
            ? { ...hook, startedAt: hook.startedAt ?? hook.createdAt, adapter: hook.logAdapter, running: false }
            : { ...report!, ...report!.conversation, adapter: report!.conversation?.adapter, running: false }
          if (remote) {
            source.mirroredPath = remote.sessionPath
            source.sessionId = remote.result?.sessionId ?? source.sessionId ?? remote.spec.sessionId
            source.adapter ??= remote.spec.adapter
          }
          const target = auxiliaryReadTarget(source)
          // Keep the lookup key after stdout (which originally announced the identity) goes away.
          if (target.logPath !== path) {
            if (hook) repo.saveHookRun(this.db, { ...hook, sessionId: target.sessionId, sessionLogPath: target.logPath })
            else if (report) {
              const bound = { ...report, conversation: { adapter: target.mode, sessionId: target.sessionId,
                input: report.conversation?.input ?? '', sessionLogPath: target.logPath } }
              if ('taskId' in bound) repo.saveTaskReport(this.db, bound)
              else repo.saveProjectReport(this.db, bound)
            }
          }
          await this.preserve(path, target)
        } else if (Date.now() - receiptModifiedAt(path) > 5 * 60_000) {
          // Deleted owners and superseded report generations have no remaining consumer.
          removeRuntimeOutput(path, this.root)
        }
      } catch (error) {
        if (!this.stopped) console.warn('Cannot release execution output', error)
      }
      await yieldToApp()
    }
  }
}

function stillWriting(owner: { pid: number | null; startedAt: string | null; endedAt: string | null }): boolean {
  if (owner.pid === null || !isProcessAlive(owner.pid)) return false
  const started = processStartedAt(owner.pid)
  return started === null || started >= Date.parse(owner.startedAt ?? '') - 1000 &&
    (owner.endedAt === null || started <= Date.parse(owner.endedAt) + 1000)
}

function* outputFiles(root: string): Generator<string> {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) yield* outputFiles(path)
    else if (entry.isFile() && /^(?:run|hook|rpt)_[\w-]+\.(?:log(?:\.tmp)?|exit(?:\.pid)?)$/.test(entry.name)) {
      const output = path.replace(/\.(?:log(?:\.tmp)?|exit(?:\.pid)?)$/, '.log')
      yield output
    }
  }
}

function receiptModifiedAt(path: string): number {
  return Math.max(...[path, path + '.tmp', path.replace(/\.log$/, '.exit'), path.replace(/\.log$/, '.exit.pid')]
    .filter(existsSync).map(file => statSync(file).mtimeMs))
}
