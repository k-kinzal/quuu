import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { SessionMessage } from '../session/types.js'

export interface ReviewEvidence { commits: string[]; pullRequests: string[] }
export const REVIEW_EVIDENCE_VERSION = 1
const SHELL = new Set(['Bash', 'Shell', 'exec', 'exec_command', 'shell', 'shell_command', 'run_in_terminal', 'write_stdin', 'wait'])
const PR_RECEIPT = /^\s*(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*)\s*$/gm

/** Tool wrappers often put the real stdout inside JSON (including nested exec results). */
function outputStrings(text: string, receiptsOnly = false): string[] {
  const result: string[] = []
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value)
        if (parsed && typeof parsed === 'object') { visit(parsed); return }
      } catch { /* Most CLIs leave plain stdout. */ }
      result.push(value)
    }
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      const fields = value as Record<string, unknown>
      if (receiptsOnly && (fields.isError === true || fields.status === 'rejected' ||
        ['code', 'exit_code'].some(key => typeof fields[key] === 'number' && fields[key] !== 0))) return
      // PR bodies and echoed inputs may refer to other PRs. Follow only result
      // envelopes and the URL fields returned by the operation itself.
      for (const [key, child] of Object.entries(fields)) {
        if (!receiptsOnly || ['output', 'stdout', 'result', 'value', 'content', 'text', 'url', 'html_url'].includes(key)) visit(child)
      }
    }
  }
  visit(text)
  return result
}

/** Record observed results, never commands that were merely proposed or SHA-looking prose. */
export function extractReviewEvidence(messages: SessionMessage[]): ReviewEvidence {
  const commits = new Set<string>()
  const pullRequests = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.blocks) {
      if (block.kind === 'text') {
        for (const match of block.text.matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/([a-f0-9]{7,40})\b/gi)) commits.add(match[1].toLowerCase())
      }
      if (block.kind !== 'tool' || block.tool.result === null) continue
      const tool = block.tool
      const shell = SHELL.has(tool.name)
      const input = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input)
      const observesPr = (shell && /\bgh\s+pr\s+(?:create|view|edit|merge)\b/.test(`${tool.target ?? ''} ${input}`)) ||
        /(?:^|[._])create_pull_request$/.test(tool.name)
      for (const text of outputStrings(tool.result!)) {
        if (shell) {
          // Git itself emits this receipt after successfully creating a commit, including detached HEAD.
          for (const match of text.matchAll(/(?:^|\n|\\n)\[(?:[^\]\n]+) ([a-f0-9]{7,40})\]\s+[^\n]+/gi)) commits.add(match[1].toLowerCase())
        }
      }
      if (observesPr && !tool.isError) {
        // Source files, search hits and prose can contain example URLs. Only a PR
        // operation returning a URL itself (plain or JSON-wrapped) is a receipt.
        for (const text of outputStrings(tool.result!, true)) {
          for (const match of text.matchAll(PR_RECEIPT)) pullRequests.add(match[1])
        }
      }
    }
  }
  return { commits: [...commits], pullRequests: [...pullRequests] }
}

export function recordSessionEvidence(db: Db, taskId: string, messages: SessionMessage[]): void {
  const evidence = extractReviewEvidence(messages)
  for (const sha of evidence.commits) repo.recordReviewEvidence(db, taskId, 'commit', sha)
  for (const url of evidence.pullRequests) repo.recordReviewEvidence(db, taskId, 'pull-request', url)
}
