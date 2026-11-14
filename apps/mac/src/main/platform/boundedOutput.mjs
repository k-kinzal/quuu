import { closeSync, openSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs'

// These are execution receipts, never an archive. The head identifies a session and the tail
// classifies its exit. In particular, a multi-day run must use the same space as a short run.
export const OUTPUT_HEAD_BYTES = 64 * 1024
export const OUTPUT_TAIL_BYTES = 64 * 1024
export const OUTPUT_PREFIX = '# Quuu transient output v1\n'
export const OUTPUT_GAP = '\n\n[Intermediate execution output omitted]\n\n'
export const OUTPUT_MAX_BYTES = Buffer.byteLength(OUTPUT_PREFIX + OUTPUT_GAP) + OUTPUT_HEAD_BYTES + OUTPUT_TAIL_BYTES

export class BoundedOutput {
  head = Buffer.alloc(0)
  tail = Buffer.alloc(0)
  bytes = 0

  append(chunk) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.bytes += data.length
    const take = Math.min(OUTPUT_HEAD_BYTES - this.head.length, data.length)
    if (take) this.head = Buffer.concat([this.head, data.subarray(0, take)])
    const rest = data.subarray(take)
    if (rest.length) this.tail = Buffer.from(Buffer.concat([this.tail, rest.subarray(-OUTPUT_TAIL_BYTES)]).subarray(-OUTPUT_TAIL_BYTES))
  }

  snapshot() {
    return Buffer.concat([Buffer.from(OUTPUT_PREFIX), this.head,
      Buffer.from(this.bytes > OUTPUT_HEAD_BYTES + OUTPUT_TAIL_BYTES ? OUTPUT_GAP : ''), this.tail])
  }
}

/** Bounded reads also migrate old multi-gigabyte receipts without loading them into memory. */
export function outputSnapshot(path) {
  const output = new BoundedOutput()
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const head = Buffer.alloc(OUTPUT_HEAD_BYTES + Buffer.byteLength(OUTPUT_PREFIX))
    const read = readSync(fd, head, 0, head.length, 0)
    const prefix = head.subarray(0, Buffer.byteLength(OUTPUT_PREFIX)).toString() === OUTPUT_PREFIX
    if (prefix && size <= OUTPUT_MAX_BYTES) {
      const data = Buffer.alloc(size)
      return data.subarray(0, readSync(fd, data, 0, size, 0))
    }
    output.append(head.subarray(prefix ? Buffer.byteLength(OUTPUT_PREFIX) : 0, read))
    const offset = Math.max(read, size - OUTPUT_TAIL_BYTES)
    const tail = Buffer.alloc(Math.min(OUTPUT_TAIL_BYTES, size - offset))
    output.append(tail.subarray(0, readSync(fd, tail, 0, tail.length, offset)))
    output.bytes = size
    return output.snapshot()
  } finally { closeSync(fd) }
}

/** Readers see either complete snapshot; the temporary sibling has the same fixed bound. */
export function writeOutputSnapshot(path, data) {
  if (data.length > OUTPUT_MAX_BYTES) throw new Error('Execution output exceeds its bound')
  writeFileSync(path + '.tmp', data, { mode: 0o600 })
  renameSync(path + '.tmp', path)
}
