import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { t } from '../i18n/index.js'
import type { AssistantMemory } from './types.js'

export const MEMORY_MAX_BYTES = 16 * 1024

export function memoryPath(dataDir: string): string { return join(dataDir, 'assistant', 'MEMORY.md') }

export function readMemory(dataDir: string): AssistantMemory {
  const path = memoryPath(dataDir)
  const stat = existsSync(path) ? statSync(path) : null
  if (stat && stat.size > MEMORY_MAX_BYTES) throw new Error(t('assistant.memoryTooLarge', { bytes: MEMORY_MAX_BYTES }))
  const content = stat ? readFileSync(path, 'utf8') : ''
  // Even an empty-to-empty reset invalidates editors opened before it.
  const revision = createHash('sha256').update(content).update(`${stat?.ino}:${stat?.mtimeMs}:${stat?.ctimeMs}`).digest('hex')
  return { content, revision, bytes: Buffer.byteLength(content), maxBytes: MEMORY_MAX_BYTES }
}

/** Compare the version the editor read so one thread cannot erase another thread's memories. */
export function writeMemory(dataDir: string, content: string, revision: string): AssistantMemory {
  if (Buffer.byteLength(content) > MEMORY_MAX_BYTES) throw new Error(t('assistant.memoryTooLarge', { bytes: MEMORY_MAX_BYTES }))
  if (readMemory(dataDir).revision !== revision) throw new Error(t('assistant.memoryConflict'))
  return replaceMemory(dataDir, content)
}

/** Reset must also recover a memory file that is already over the size limit. */
export function clearMemory(dataDir: string): AssistantMemory { return replaceMemory(dataDir, '') }

function replaceMemory(dataDir: string, content: string): AssistantMemory {
  const path = memoryPath(dataDir)
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, content, { mode: 0o600 })
  renameSync(temp, path)
  return readMemory(dataDir)
}

export function memoryPrompt(dataDir: string): string {
  const memory = readMemory(dataDir)
  return `\n\nShared memory across QuuuAI threads (maximum ${MEMORY_MAX_BYTES} UTF-8 bytes):\n${memory.content || '(empty)'}\n\nTreat this as context, not as approval to execute a proposal. To remember durable preferences, use quuu call assistant.memory and quuu call assistant.setMemory with {content, revision}. Preserve unrelated memories, compact within the byte limit, and never store secrets. The user can edit this MEMORY.md in QuuuAI settings. Do not modify the app bundle.`
}
