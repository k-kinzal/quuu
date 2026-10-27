import { expect, it } from 'vitest'
import { wire } from '../src/api/generated/wire.js'
import { decodeWire, encodeWire } from '../src/api/wire.js'

it('keeps nullable fields in the oneof representation understood by existing clients', () => {
  const shape = wire['tasks.update'].input
  const request = { id: 'task', patch: { scheduledAt: null } }
  const legacy = { id: 'task', patch: { scheduledAt: { variant2: 'NULL_VALUE' } } }
  expect(encodeWire(shape, request)).toEqual(legacy)
  expect(decodeWire(shape, legacy)).toEqual(request)
})

it('keeps review file intersections in the existing protobuf Value field', () => {
  const shape = wire['review.file'].input
  const request = { taskId: 'task', request: { source: 'commit', ref: 'abc123', path: 'README.md' } }
  expect(encodeWire(shape, request)).toEqual(request)
  expect(decodeWire(shape, request)).toEqual(request)
})
