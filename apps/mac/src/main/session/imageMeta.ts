/**
 * Reads pixel dimensions from an image's leading bytes.
 *
 * Dimensions are needed to reserve the image's place in the conversation up
 * front. Loading happens only once it's in view, so without the dimensions
 * the height grows later and the reading position jumps. Not worth pulling
 * in a decoder — look at the header only (PNG / JPEG / GIF).
 */

export interface ImageSize {
  width: number
  height: number
}

export function imageSize(head: Buffer): ImageSize | null {
  return png(head) ?? jpeg(head) ?? gif(head)
}

function png(b: Buffer): ImageSize | null {
  if (b.length < 24) return null
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  // IHDR is always the first chunk. Width and height sit at its start
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null
  return size(b.readUInt32BE(16), b.readUInt32BE(20))
}

function jpeg(b: Buffer): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null

  let pos = 2
  while (pos + 9 < b.length) {
    if (b[pos] !== 0xff) {
      pos += 1 // fill byte; advance to the head of a marker
      continue
    }
    const marker = b[pos + 1]
    // Dimensions live in SOFn (0xC0-0xCF, excluding DHT / JPG / DAC / RSTn)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return size(b.readUInt16BE(pos + 7), b.readUInt16BE(pos + 5))
    const length = b.readUInt16BE(pos + 2)
    if (length < 2) return null
    pos += 2 + length
  }
  return null
}

function gif(b: Buffer): ImageSize | null {
  if (b.length < 10 || b.toString('ascii', 0, 4) !== 'GIF8') return null
  return size(b.readUInt16LE(6), b.readUInt16LE(8))
}

function size(width: number, height: number): ImageSize | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { width, height }
}
