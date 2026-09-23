import {
  readFileSync,
  statSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DEEP_BYTES, decodeDirName, discoverFiles, firstLine, readHead, type ExternalLogs, type ExternalSession } from '../external.js'
import { collectText, extractUserQuery } from '../parserUtil.js'
import { layout } from './layout.js'

// ---------------------------------------------------------------------------
// Grok
// ---------------------------------------------------------------------------

function readGrokSession(historyPath: string): ExternalSession | null {
  const dir = dirname(historyPath)
  const sessionId = basename(dir)
  const summary = readGrokSummary(dir)

  // summary.json holds the cwd. Without it, recover from the directory name (percent-encoded cwd).
  const cwd = summary?.cwd ?? decodeDirName(basename(dirname(dir)))
  if (!cwd) return null

  const stat = statSync(historyPath)
  return {
    adapter: 'grok',
    key: `grok:${sessionId}`,
    sessionId,
    cwd,
    title: summary?.title ?? readGrokTitle(historyPath),
    logPath: historyPath,
    startedAt: summary?.createdAt ?? stat.birthtime.toISOString(),
    updatedAt: summary?.updatedAt ?? stat.mtime.toISOString(),
    command: 'grok',
    // No origin marker is written (observed). Treat as typed by a human.
    entrypoint: null
  }
}

interface GrokSummary {
  cwd: string | null
  title: string | null
  createdAt: string | null
  updatedAt: string | null
}

function readGrokSummary(dir: string): GrokSummary | null {
  let text: string
  try {
    text = readFileSync(join(dir, 'summary.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const json = JSON.parse(text) as {
      info?: { cwd?: unknown }
      created_at?: unknown
      updated_at?: unknown
      generated_title?: unknown
    }
    const title = json.generated_title
    return {
      cwd: typeof json.info?.cwd === 'string' ? json.info.cwd : null,
      title: typeof title === 'string' && title.length > 0 ? title : null,
      createdAt: typeof json.created_at === 'string' ? json.created_at : null,
      updatedAt: typeof json.updated_at === 'string' ? json.updated_at : null
    }
  } catch {
    return null
  }
}

/** The first human-typed prompt. Lines carrying `prompt_index` are the ones. */
function readGrokTitle(historyPath: string): string | null {
  const head = readHead(historyPath, DEEP_BYTES)
  for (const line of head.split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; content?: unknown; prompt_index?: unknown }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'user' || typeof entry.prompt_index !== 'number') continue
    const line1 = firstLine(extractUserQuery(collectText(entry.content)))
    if (line1) return line1
  }
  return null
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options, 2, 'chat_history.jsonl'),
  read: file => readGrokSession(file.path)
}
