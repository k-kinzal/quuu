import { describe, expect, it } from 'vitest'
import { ClaudeSessionParser } from '../src/main/agent-adapters/claude/parser.js'
import { imageSize } from '../src/main/session/imageMeta.js'

/**
 * Images appearing in the conversation.
 *
 * Images handed to the agent and images the agent read ARE the conversation's
 * content. Collapse them to a mere "(image)" placeholder and you can no longer
 * trace what the agent looked at when it decided.
 */

const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`

/** A PNG head carrying only dimensions. We never decode the body, so this is enough. */
function pngHead(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

/** SOI → APP0 (JFIF) → SOF0. Dimensions do not appear until the SOF marker. */
function jpegHead(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8])
  const app0 = Buffer.alloc(18)
  app0[0] = 0xff
  app0[1] = 0xe0
  app0.writeUInt16BE(16, 2)
  app0.write('JFIF', 4, 'ascii')
  const sof = Buffer.alloc(19)
  sof[0] = 0xff
  sof[1] = 0xc0
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([soi, app0, sof])
}

const PNG = pngHead(2940, 1666).toString('base64')

describe('image dimensions', () => {
  it('reads them from the PNG header', () => {
    expect(imageSize(pngHead(2940, 1666))).toEqual({ width: 2940, height: 1666 })
  })

  it('walks JPEG markers to the SOF to read them', () => {
    expect(imageSize(jpegHead(640, 480))).toEqual({ width: 640, height: 480 })
  })

  it('reads them from the GIF header', () => {
    const gif = Buffer.alloc(10)
    gif.write('GIF89a', 0, 'ascii')
    gif.writeUInt16LE(320, 6)
    gif.writeUInt16LE(200, 8)
    expect(imageSize(gif)).toEqual({ width: 320, height: 200 })
  })

  it('reads nothing from non-image data', () => {
    expect(imageSize(Buffer.from('not an image at all'))).toBeNull()
  })
})

describe('images in the conversation', () => {
  it('a pasted image stays as a block and its body can be fetched later', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'ここがずれています' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }
          ]
        }
      })
    ])

    const blocks = parser.messages[0].blocks
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'image'])
    const block = blocks[1]
    if (block.kind !== 'image') throw new Error('not an image block')
    expect(block.image.width).toBe(2940)
    expect(block.image.height).toBe(1666)
    // The body does not ride on the message; it is fetched at display time
    expect(parser.images.get(block.image.id)).toBe(`data:image/png;base64,${PNG}`)
  })

  it('an image a tool returned is attached to that tool', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/tmp/shot.png' } }
          ]
        }
      }),
      line({
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu1',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }
              ]
            }
          ]
        }
      })
    ])

    expect(parser.messages).toHaveLength(1)
    const block = parser.messages[0].blocks[0]
    if (block.kind !== 'tool') throw new Error('not a tool block')
    expect(block.tool.images).toHaveLength(1)
    // Do not mix "(image)" placeholder text into the result
    expect(block.tool.result).toBe('')
    expect(parser.images.get(block.tool.images[0].id)).toContain('data:image/png;base64,')
  })

  it('returns null for an image it does not hold (the view shows a missing mark)', () => {
    const parser = new ClaudeSessionParser()
    expect(parser.images.get('img_9999999')).toBeNull()
  })

  it('ids do not collide across sessions', () => {
    const a = new ClaudeSessionParser()
    const b = new ClaudeSessionParser()
    const first = a.images.add('image/png', PNG)
    const second = b.images.add('image/png', PNG)
    expect(first.id).not.toBe(second.id)
    expect(b.images.get(first.id)).toBeNull()
  })
})
