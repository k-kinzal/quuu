import type { SessionMessage } from '../../../api/schemas/session.js'
import type { AssistantProposal } from '../../../api/schemas/assistant.js'

/** A proposal is already shown as an attachment. Keep only the person's appended reply. */
export function proposalContextPrefix(value: string, proposal: AssistantProposal): string {
  const end = value.indexOf(proposal.prompt)
  if (end < 0) return ''
  const before = value.slice(0, end)
  if (!before.includes(proposal.title) || !before.includes(proposal.reason)) return ''
  const prefix = value.slice(0, end + proposal.prompt.length)
  return prefix + (value.slice(prefix.length).match(/^\s*/)?.[0] ?? '')
}

/** QuuuAI displays the exchange with the person; execution details stay in the durable log. */
export function assistantConversation(messages: SessionMessage[], proposal?: AssistantProposal): SessionMessage[] {
  return messages.filter(message => message.role !== 'system' && !message.isSidechain)
    .map(message => ({
      ...message,
      blocks: message.blocks.filter(block => block.kind === 'text' || block.kind === 'image')
        .map(block => {
          if (message.role !== 'user' || block.kind !== 'text') return block
          const text = block.text.replace(/\n\n<quuu-assistant-context>[\s\S]*<\/quuu-assistant-context>\s*$/, '')
          return { ...block, text: proposal ? text.slice(proposalContextPrefix(text, proposal).length) : text }
        })
        .filter(block => block.kind !== 'text' || block.text.trim().length > 0)
    }))
    .filter(message => message.blocks.length > 0)
}
