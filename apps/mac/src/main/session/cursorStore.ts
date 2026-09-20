import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'

/**
 * With a static import, Vite 5 drops the `node:` prefix and resolution fails.
 * Fetch via require at runtime, same as db/database.ts.
 */
const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite')

/**
 * Reading a Cursor CLI (cursor-agent) chat.
 *
 * Layout (observed; `~/.cursor/chats/<md5(cwd)>/<chatId>/`):
 *
 *   meta.json … {schemaVersion, cwd, createdAtMs, updatedAtMs, hasConversation}
 *   store.db  … SQLite. Just two tables: `meta(key,value)` and `blobs(id, data)`
 *
 * The conversation is stored **content-addressed**. `meta['0']` is
 * hex-encoded JSON whose `latestRootBlobId` points at the current
 * conversation root. The root blob is protobuf; its field number 1 lists the
 * utterance blob IDs (32 bytes) in order. Utterance blobs themselves are JSON.
 * Field 4 holds inline JSON for assistant tool calls that are still running;
 * they do not move into field 1 until the tool returns.
 *
 * So this is **not an append-only log**. The root is swapped every turn, so
 * the "read on from a byte position" follow that other adapters use is
 * impossible. Re-read on change (SessionWatcher's snapshot mode).
 *
 * The protobuf definition is not published, so scan the wire format without
 * holding a schema. Unknown fields can be skipped by type, so Cursor adding
 * fields won't break this. When it becomes unreadable, fall back to
 * "not there yet".
 */

/** Field numbers of the root blob (observed). */
const FIELD_MESSAGE_IDS = 1
const FIELD_PENDING_TOOL_CALLS = 4
const FIELD_WORKSPACE_URI = 9
const FIELD_ENTRYPOINT = 22
const FIELD_UPDATED_MS = 26

/** A blob ID is a 32-byte hash. The length alone picks out utterance blob references. */
const BLOB_ID_BYTES = 32

export interface CursorMessage {
  role: string
  content: unknown
}

export interface CursorChat {
  chatId: string
  /** Chat name. When unset, a default like `New Agent`. */
  name: string | null
  /**
   * What started this chat. Launched from the CLI: `cli`.
   * Chats created in the IDE don't carry this marker.
   */
  entrypoint: string | null
  workspacePath: string | null
  updatedAtMs: number | null
  messages: CursorMessage[]
}

/**
 * Reads store.db and assembles the conversation. null when unreadable.
 *
 * Reads can happen mid-write, so failure is treated as a normal outcome
 * (just re-read next cycle; throwing here would crash the conversation view).
 */
export function readCursorChat(
  storePath: string,
  chatId: string,
  options: {
    /**
     * How many items to read from the start. Import only wants identity and
     * title, so this cap avoids reading the whole conversation (tens of MB).
     */
    maxMessages?: number
  } = {}
): CursorChat | null {
  let db: DatabaseSyncType
  try {
    db = new DatabaseSync(storePath, { readOnly: true })
  } catch {
    return null
  }

  try {
    // Read the root and its referenced blobs from one committed SQLite snapshot.
    db.exec('BEGIN')
    const meta = readMeta(db)
    if (!meta) return null

    const root = meta.latestRootBlobId ? readBlob(db, meta.latestRootBlobId) : null
    if (!root) {
      if (meta.latestRootBlobId) return null
      // No root yet (just created). Return identity only, with an empty conversation.
      return {
        chatId,
        name: meta.name,
        entrypoint: null,
        workspacePath: null,
        updatedAtMs: null,
        messages: []
      }
    }

    const fields = scanFields(root)
    const limit = options.maxMessages ?? Number.POSITIVE_INFINITY
    const messages: CursorMessage[] = []
    for (const field of fields) {
      if (messages.length >= limit) break
      if (field.number !== FIELD_MESSAGE_IDS || field.bytes === null) continue
      if (field.bytes.length !== BLOB_ID_BYTES) continue
      const blob = readBlob(db, Buffer.from(field.bytes).toString('hex'))
      const message = blob === null ? null : parseMessage(blob)
      // An incomplete read must not be cached as a shorter, successfully read conversation.
      if (!message) return null
      messages.push(message)
    }

    for (const field of fields) {
      if (messages.length >= limit) break
      if (field.number !== FIELD_PENDING_TOOL_CALLS || field.bytes === null) continue
      const message = parseMessage(field.bytes)
      if (!message) return null
      messages.push(message)
    }

    return {
      chatId,
      name: meta.name,
      entrypoint: stringField(fields, FIELD_ENTRYPOINT),
      workspacePath: pathFromUri(stringField(fields, FIELD_WORKSPACE_URI)),
      updatedAtMs: numberField(fields, FIELD_UPDATED_MS),
      messages
    }
  } catch {
    return null
  } finally {
    try {
      db.close()
    } catch {
      // Even if it can't be closed, return what was read
    }
  }
}

// ---------------------------------------------------------------------------

interface CursorMeta {
  latestRootBlobId: string | null
  name: string | null
}

/** `meta['0']` is hex-encoded JSON. */
function readMeta(db: DatabaseSyncType): CursorMeta | null {
  let row: { value?: unknown } | undefined
  try {
    row = db.prepare("SELECT value FROM meta WHERE key = '0'").get()
  } catch {
    // No meta table (an aborted chat)
    return null
  }
  if (typeof row?.value !== 'string') return null

  let decoded: string
  try {
    decoded = Buffer.from(row.value, 'hex').toString('utf8')
  } catch {
    return null
  }

  try {
    const json = JSON.parse(decoded) as { latestRootBlobId?: unknown; name?: unknown }
    return {
      latestRootBlobId: typeof json.latestRootBlobId === 'string' ? json.latestRootBlobId : null,
      name: typeof json.name === 'string' ? json.name : null
    }
  } catch {
    return null
  }
}

function readBlob(db: DatabaseSyncType, id: string): Uint8Array | null {
  try {
    const row = db.prepare('SELECT data FROM blobs WHERE id = ?').get(id) as
      | { data?: unknown }
      | undefined
    const data = row?.data
    if (data instanceof Uint8Array) return data
    if (typeof data === 'string') return Buffer.from(data, 'utf8')
    return null
  } catch {
    return null
  }
}

function parseMessage(blob: Uint8Array): CursorMessage | null {
  // Utterance blobs are JSON. Protobuf blobs (internal) don't start with `{`, so they get rejected.
  if (blob.length === 0 || blob[0] !== 0x7b) return null
  try {
    const json = JSON.parse(Buffer.from(blob).toString('utf8')) as {
      role?: unknown
      content?: unknown
    }
    if (typeof json.role !== 'string') return null
    return { role: json.role, content: json.content }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// protobuf wire format (no schema)
// ---------------------------------------------------------------------------

interface WireField {
  number: number
  /** Content of a length-delimited field. null otherwise. */
  bytes: Uint8Array | null
  /** Value of a varint. null otherwise. */
  value: number | null
}

/**
 * Reads fields from the start in order. **Does not descend into nesting.**
 *
 * Descending would mistake a 32-byte string inside a nested message for an
 * utterance reference. What we want is the order of utterances directly
 * under the root, so this is exactly right.
 */
export function scanFields(buf: Uint8Array): WireField[] {
  const out: WireField[] = []
  let i = 0

  while (i < buf.length) {
    const tag = readVarint(buf, i)
    if (!tag) break
    i = tag.next
    const number = Math.floor(tag.value / 8)
    const wireType = tag.value % 8
    if (number === 0) break

    if (wireType === 0) {
      const v = readVarint(buf, i)
      if (!v) break
      i = v.next
      out.push({ number, bytes: null, value: v.value })
    } else if (wireType === 2) {
      const len = readVarint(buf, i)
      if (!len) break
      const start = len.next
      const end = start + len.value
      if (end > buf.length) break
      i = end
      out.push({ number, bytes: buf.subarray(start, end), value: null })
    } else if (wireType === 5) {
      i += 4
      if (i > buf.length) break
    } else if (wireType === 1) {
      i += 8
      if (i > buf.length) break
    } else {
      // The deprecated group type. No way to stay in sync past this point, so stop.
      break
    }
  }

  return out
}

function readVarint(buf: Uint8Array, start: number): { value: number; next: number } | null {
  let value = 0
  let shift = 0
  let i = start
  while (i < buf.length) {
    const byte = buf[i]
    i += 1
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return { value, next: i }
    shift += 7
    // Nothing longer than 64 bits arrives. The cutoff keeps corrupt data from being read forever.
    if (shift > 63) return null
  }
  return null
}

function stringField(fields: WireField[], number: number): string | null {
  const hit = fields.find((f) => f.number === number && f.bytes !== null)
  if (!hit?.bytes) return null
  const text = Buffer.from(hit.bytes).toString('utf8')
  // Guard against grabbing a non-string field (nested protobuf)
  return hasControlChars(text) ? null : text
}

/**
 * Whether control characters other than newline and tab are present.
 * They never appear in string fields, so their presence means the wrong
 * field was grabbed.
 */
function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue
    if (code < 0x20) return true
  }
  return false
}

function numberField(fields: WireField[], number: number): number | null {
  const hit = fields.find((f) => f.number === number && f.value !== null)
  return hit?.value ?? null
}

/** `file:///Users/me/Projects/x` -> `/Users/me/Projects/x` */
function pathFromUri(uri: string | null): string | null {
  if (!uri) return null
  if (!uri.startsWith('file://')) return uri
  try {
    return decodeURIComponent(uri.slice('file://'.length)) || null
  } catch {
    return uri.slice('file://'.length) || null
  }
}
