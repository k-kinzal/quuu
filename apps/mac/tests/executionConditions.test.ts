import { describe, expect, it } from 'vitest'
import { PRIORITIES, TASK_STATUSES, canHoldTask, holdsSlot } from '../src/main/tasks/status.js'
import { canClaimTask, cooldownUntil, runDisposition, shouldRetryRun, consecutiveFailures, slotAvailability, cooldownSeconds, MAX_LIMIT_COOLDOWN_SECONDS } from '../src/main/execution/conditions.js'
import { dependencyCleared, wouldCycle } from '../src/main/tasks/ordering.js'
import { mayContinueSession } from '../src/main/agents/types.js'
import type { RunErrorKind } from '../src/main/execution/types.js'
import type { RunStatus } from '../src/main/tasks/status.js'

const errors: RunErrorKind[] = ['limit', 'auth', 'timeout', 'spawn', 'nonzero-exit', 'orphaned', 'canceled', 'no-agent']

describe('run outcomes and human authority', () => {
  it('no combination of success, failure, retry and reserved send marks done automatically', () => {
    for (const error of [null, ...errors]) {
      for (const reservedMessage of ['', '続けてください']) {
        for (const retry of [false, true]) {
          expect(runDisposition({ reservedMessage }, error, retry).status).not.toBe('done')
        }
      }
    }
  })
  it('only success moves the reserved message to pending send; whitespace-only goes to review', () => {
    expect(runDisposition({ reservedMessage: ' 続けて ' }, null, false)).toEqual({
      kind: 'send-reserved', status: 'queued', pendingMessage: '続けて'
    })
    expect(runDisposition({ reservedMessage: '  ' }, null, false)).toEqual({
      kind: 'review', status: 'review', pendingMessage: ''
    })
    for (const error of errors) {
      expect(runDisposition({ reservedMessage: '消さない' }, error, false)).not.toHaveProperty('pendingMessage')
    }
  })
  it('cancellation goes back to human review even with a retry candidate', () => {
    expect(runDisposition({ reservedMessage: '' }, 'canceled', true)).toEqual({ kind: 'interrupted', status: 'review' })
  })
  it('only P0 keeps a run slot; every lower priority competes for one', () => {
    for (const priority of PRIORITIES) expect(holdsSlot(priority)).toBe(priority === 0)
  })
  it('a running task cannot be held (stopping one is what cancel is for)', () => {
    expect(canHoldTask('running')).toBe(false)
    expect(canHoldTask('queued')).toBe(true)
  })
})

describe('automatic retry', () => {
  it('temporary limits can wait on the same agent, but auth and spawn failures require another candidate', () => {
    for (const error of ['limit', 'timeout'] as const) expect(shouldRetryRun(error, 4, true, false)).toBe(true)
    for (const error of ['auth', 'spawn', 'nonzero-exit'] as const) {
      expect(shouldRetryRun(error, 1, true, false)).toBe(false)
      expect(shouldRetryRun(error, 1, true, true)).toBe(true)
    }
  })
  it('after 5 failures, or with no candidate, no failure kind auto-retries', () => {
    for (const error of errors) {
      expect(shouldRetryRun(error, 5, true, true)).toBe(false)
      expect(shouldRetryRun(error, 0, false, true)).toBe(false)
    }
  })
  it('failures before a success or cancellation do not carry over, and running is not counted as failure', () => {
    const runs = (statuses: RunStatus[]) => statuses.map((status) => ({ status }))
    expect(consecutiveFailures(runs(['failed', 'running', 'limited', 'succeeded', 'failed']))).toBe(2)
    expect(consecutiveFailures(runs(['canceled', 'failed']))).toBe(0)
  })
  it('Limit uses the configured cooldown; auth failures use a short one', () => {
    expect(cooldownSeconds('limit', 60)).toBe(60)
    expect(cooldownSeconds('limit', undefined)).toBe(900)
    expect(cooldownSeconds('auth', 900)).toBe(300)
    expect(cooldownSeconds(null, 900)).toBeNull()
  })
})

describe('how long an agent stays out after a Limit', () => {
  const now = '2026-09-18T02:16:00.000Z'
  const plus = (seconds: number): string => new Date(Date.parse(now) + seconds * 1000).toISOString()

  it('falls back to the configured cooldown when the CLI named no time', () => {
    expect(cooldownUntil('limit', 600, null, now)).toBe(plus(600))
    expect(cooldownUntil('limit', undefined, undefined, now)).toBe(plus(900))
    expect(cooldownUntil('auth', 600, null, now)).toBe(plus(300))
    expect(cooldownUntil(null, 600, null, now)).toBeNull()
  })

  it('believes the time the CLI named over the configured guess, in both directions', () => {
    // A limit that lifts tomorrow: a 15-minute guess would retry ~100 times against a dead account
    expect(cooldownUntil('limit', 900, plus(41 * 3600), now)).toBe(plus(41 * 3600))
    // And one that lifts in five: waiting the full 15 idles an account that is already back
    expect(cooldownUntil('limit', 900, plus(300), now)).toBe(plus(300))
  })

  it('never comes straight back, and never believes a date beyond the cap', () => {
    expect(cooldownUntil('limit', 900, plus(1), now)).toBe(plus(60))
    expect(cooldownUntil('limit', 900, plus(365 * 86400), now)).toBe(plus(MAX_LIMIT_COOLDOWN_SECONDS))
  })

  it('reads a named time only for a Limit', () => {
    expect(cooldownUntil('auth', 600, plus(41 * 3600), now)).toBe(plus(300))
  })
})

describe('claiming, prerequisites and execution slots', () => {
  const now = '2026-09-06T12:00:00.000Z'
  const task = { status: 'queued' as const, archived: false, scheduledAt: null }
  const project = { enabled: true, deletedAt: null }
  it('never auto-claims from held, pre-schedule, archived, or disabled projects', () => {
    expect(canClaimTask(task, project, now)).toBe(true)
    expect(canClaimTask({ ...task, scheduledAt: now }, project, now)).toBe(true)
    expect(canClaimTask({ ...task, scheduledAt: '2026-09-06T12:00:01.000Z' }, project, now)).toBe(false)
    for (const status of TASK_STATUSES) expect(canClaimTask({ ...task, status }, project, now)).toBe(status === 'queued')
    expect(canClaimTask({ ...task, archived: true }, project, now)).toBe(false)
    expect(canClaimTask(task, { ...project, enabled: false }, now)).toBe(false)
    expect(canClaimTask(task, { ...project, deletedAt: now }, now)).toBe(false)
  })
  it('the holder of a reservation is not blocked by other reservations, and never exceeds the running limit', () => {
    expect(slotAvailability(0, 2, 1)).toBe('reserved')
    expect(slotAvailability(0, 2, 1, true)).toBe('available')
    expect(slotAvailability(1, 2, 1, true)).toBe('busy')
  })
  it('waiting-for-done never skips review; waiting-for-finish is satisfied even by failure', () => {
    expect(dependencyCleared({ status: 'review', archived: false }, 'done')).toBe(false)
    expect(dependencyCleared({ status: 'failed', archived: false }, 'finished')).toBe(true)
    expect(dependencyCleared({ status: 'held', archived: false }, 'finished')).toBe(false)
    expect(wouldCycle(new Map([['b', ['a']]]), 'a', ['b'])).toBe(true)
  })
  it('an archived preceding task stops blocking, in whatever state it was archived', () => {
    for (const status of TASK_STATUSES) {
      expect(dependencyCleared({ status, archived: true }, 'done')).toBe(true)
    }
  })
  it('never auto-continues onto another agent, even if the same CLI can read the session', () => {
    expect(mayContinueSession('a', 'a', true)).toBe(true)
    expect(mayContinueSession('b', 'a', true)).toBe(false)
    expect(mayContinueSession('a', 'a', false)).toBe(false)
  })
})
