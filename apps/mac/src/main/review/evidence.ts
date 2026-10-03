import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { SessionBatch, SessionDerivation } from '../session/derive.js'
import { isShellTool } from '../session/shell.js'
import type { SessionMessage } from '../session/types.js'

import type { ReviewEvidence } from './types.js'
import { resultStrings } from './output.js'
export type { ReviewEvidence } from './types.js'
const PR_CANDIDATE = /^\s*(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*)\s*$/gm

/** Extract observations. A PR URL is only a candidate; no command text can prove ownership. */
export function extractReviewEvidence(messages: SessionMessage[]): ReviewEvidence {
  const commits = new Set<string>()
  const pullRequestCandidates = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.blocks) {
      if (block.kind === 'text') {
        for (const match of block.text.matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/([a-f0-9]{7,40})\b/gi)) commits.add(match[1].toLowerCase())
      }
      if (block.kind !== 'tool' || block.tool.result === null) continue
      const tool = block.tool
      const shell = isShellTool(tool.name)
      for (const text of resultStrings(tool.result!)) {
        if (shell) {
          // Git itself emits this receipt after successfully creating a commit, including detached HEAD.
          for (const match of text.matchAll(/(?:^|\n|\\n)\[(?:[^\]\n]+) ([a-f0-9]{7,40})\]\s+[^\n]+/gi)) commits.add(match[1].toLowerCase())
        }
      }
      if (!tool.isError) {
        // This is a candidate, including output from waits and mixed tool calls.
        // GitHub and observed commits establish ownership in reconciliation.
        for (const text of resultStrings(tool.result!, true)) {
          for (const match of text.matchAll(PR_CANDIDATE)) {
            pullRequestCandidates.add(match[1])
          }
        }
      }
    }
  }
  return { commits: [...commits], pullRequestCandidates: [...pullRequestCandidates] }
}

export function recordSessionEvidence(db: Db, taskId: string, messages: SessionMessage[]): void {
  const evidence = extractReviewEvidence(messages)
  for (const sha of evidence.commits) repo.recordReviewEvidence(db, taskId, 'commit', sha)
  for (const url of evidence.pullRequestCandidates) repo.recordReviewEvidence(db, taskId, 'pull-request', url)
}

/**
 * Commit receipts and PR candidates, filed as sessions are indexed.
 *
 * Bump `DERIVATION_VERSION` when the rule changes so candidates are rebuilt from
 * durable pages. Confirmed GitHub associations live separately and must survive
 * candidate rederivation, missing provider logs and retention.
 */
export const reviewEvidenceDerivation: SessionDerivation = {
  apply(db: Db, run, batch: SessionBatch): void {
    recordSessionEvidence(db, run.taskId, batch.messages)
  },
  reset(db: Db, taskId: string): void {
    repo.clearReviewEvidence(db, taskId, 'pull-request')
  }
}
