import type { SessionMessage } from '../../../api/schemas/session.js'
import type { AssistantProposal } from '../../../api/schemas/assistant.js'
import type { Run } from '../../../api/schemas/execution.js'

/** Old injected text is removed only when the recorded invocation proves its provenance. */
export function assistantConversation(messages: SessionMessage[], proposal?: AssistantProposal, runs: Run[] = []): SessionMessage[] {
  return messages.filter(message => message.role !== 'system' && !message.isSidechain)
    .map(message => ({
      ...message,
      blocks: message.blocks.filter(block => block.kind === 'text' || block.kind === 'image')
        .map(block => {
          if (message.role !== 'user' || block.kind !== 'text') return block
          const run = runs.find(run => run.args.includes(block.text) &&
            block.text.includes(`QuuuAI conversation turn: ${run.id}`))
          if (!run) return block
          const end = block.text.lastIndexOf('\n\n<quuu-assistant-context>')
          if (end < 0 || !block.text.endsWith('\n</quuu-assistant-context>')) return block
          let text = block.text.slice(0, end)
          const legacy = proposal?.legacyDiscussion
          if (legacy?.runIds.includes(run.id)) {
            if (text === legacy.prefix) text = ''
            else if (text.startsWith(legacy.prefix + '\n\n')) text = text.slice(legacy.prefix.length + 2)
          }
          return { ...block, text }
        })
        .filter(block => block.kind !== 'text' || block.text.trim().length > 0)
    }))
    .filter(message => message.blocks.length > 0)
}
