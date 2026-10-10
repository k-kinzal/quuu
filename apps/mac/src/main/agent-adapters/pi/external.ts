import { statSync } from 'node:fs'
import { isAbsolutePath } from '../../platform/pathText.js'
import { DEEP_BYTES, discoverFiles, firstLine, readHead, type ExternalLogs } from '../external.js'
import { collectText } from '../parserUtil.js'
import { layout, sessionHeader } from './layout.js'
import { object, record, timestamp } from './records.js'

export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options),
  read: file => {
    const header = sessionHeader(file.path)
    if (typeof header.id !== 'string' || !header.id || typeof header.cwd !== 'string' || !isAbsolutePath(header.cwd)) return null
    let title: string | null = null
    for (const line of readHead(file.path, DEEP_BYTES).split('\n')) {
      const entry = record(line)
      const message = object(entry.message)
      if (!title && entry.type === 'message' && message.role === 'user') title = firstLine(collectText(message.content))
      if (entry.type === 'session_info' && typeof entry.name === 'string' && entry.name.trim()) title = entry.name
    }
    const stat = statSync(file.path)
    return {
      adapter: 'pi', key: `pi:${header.id}`, sessionId: header.id, cwd: header.cwd,
      title, logPath: file.path, startedAt: timestamp(header.timestamp) ?? stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(), command: 'pi',
      // parentSession means a fork, not necessarily a programmatic or subagent launch.
      entrypoint: null
    }
  }
}
