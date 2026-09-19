import { describe, expect, it } from 'vitest'
import { missingSeqs, orderIntents } from '../src/main/mobile-sync/order.js'
import type { SyncIntent } from '../src/main/mobile-sync/protocol.js'

function intent(device: string, seq: number, createdAt: string): SyncIntent {
  return {
    version: 1,
    id: `${device}-${seq}`,
    device,
    seq,
    createdAt,
    baseRev: 1,
    op: { kind: 'task.done', taskId: `t${seq}` },
    expect: null
  }
}

const ids = (list: SyncIntent[]): string[] => list.map((i) => i.id)

describe('putting arrived intents back into the order they were pressed', () => {
  it('always keeps the order within a device, however out of order iCloud brings them down', () => {
    const shuffled = [
      intent('a', 3, '2026-08-23T10:00:03.000Z'),
      intent('a', 1, '2026-08-23T10:00:01.000Z'),
      intent('a', 2, '2026-08-23T10:00:02.000Z')
    ]
    expect(ids(orderIntents(shuffled))).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('keeps the order of a device by seq even when its clock runs backwards', () => {
    const skewed = [
      intent('a', 1, '2026-08-23T10:00:05.000Z'),
      // By timestamp alone it comes before 1, but it was pressed after
      intent('a', 2, '2026-08-23T09:59:00.000Z'),
      intent('a', 3, '2026-08-23T10:00:06.000Z')
    ]
    expect(ids(orderIntents(skewed))).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('mixes across devices by timestamp', () => {
    const mixed = [
      intent('b', 1, '2026-08-23T10:00:02.000Z'),
      intent('a', 1, '2026-08-23T10:00:01.000Z'),
      intent('a', 2, '2026-08-23T10:00:03.000Z')
    ]
    expect(ids(orderIntents(mixed))).toEqual(['a-1', 'b-1', 'a-2'])
  })

  it('settles the order even for identical timestamps (it does not change from run to run)', () => {
    const tie = [
      intent('b', 1, '2026-08-23T10:00:00.000Z'),
      intent('a', 1, '2026-08-23T10:00:00.000Z')
    ]
    expect(ids(orderIntents(tie))).toEqual(['a-1', 'b-1'])
    expect(ids(orderIntents([...tie].reverse()))).toEqual(['a-1', 'b-1'])
  })

  it('does not damage the original array', () => {
    const list = [intent('a', 2, 'z'), intent('a', 1, 'y')]
    orderIntents(list)
    expect(ids(list)).toEqual(['a-2', 'a-1'])
  })
})

describe('counting what has not arrived yet', () => {
  it('returns how many seq numbers are missing (to show on screen, not to wait on)', () => {
    const arrived = [intent('a', 1, 'x'), intent('a', 4, 'x')]
    expect(missingSeqs(arrived, new Map([['a', 0]]))).toBe(2)
  })

  it('returns 0 when the numbering is contiguous', () => {
    const arrived = [intent('a', 1, 'x'), intent('a', 2, 'x')]
    expect(missingSeqs(arrived, new Map([['a', 0]]))).toBe(0)
  })

  it('looks only past what has already been taken in', () => {
    const arrived = [intent('a', 10, 'x')]
    expect(missingSeqs(arrived, new Map([['a', 9]]))).toBe(0)
  })
})
