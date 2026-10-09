import type { SessionBlock, SessionMessage } from '../../../api/schemas/session.js'
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

/** Keep the person's words in the chat; app-supplied context remains in the durable session log. */
export function assistantConversation(messages: SessionMessage[], proposal?: AssistantProposal): SessionMessage[] {
  return messages.map(message => message.role === 'assistant' ? {
    ...message, blocks: message.blocks.filter(block => !noReplyControl(block) && (block.kind !== 'text' || block.text.trim().length > 0))
  } : message).filter(message => message.role !== 'assistant' || message.blocks.length > 0)
    .map(message => message.role !== 'user' ? message : {
    ...message, blocks: message.blocks.map(block => {
      if (block.kind !== 'text') return block
      const text = block.text.replace(/\n\n<quuu-assistant-context>[\s\S]*<\/quuu-assistant-context>\s*$/, '')
      return { ...block, text: proposal ? text.slice(proposalContextPrefix(text, proposal).length) : text }
    })
  })
}

/** Hide only the dedicated control operation. Failed calls and compound shell work stay inspectable. */
function noReplyControl(block: SessionBlock): boolean {
  if (block.kind !== 'tool' || block.tool.isError) return false
  const { name, input } = block.tool
  if (name === 'assistant_noReply' || name.endsWith('__assistant_noReply')) return true
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const command = 'command' in input ? input.command : 'cmd' in input ? input.cmd : null
  if (typeof command !== 'string') return false
  // The prompt supplies this standalone command; do not erase a tool that also performs other work.
  const match = /^\s*(?:quuu|\/[^\s'"]*\/quuu|'[^']*\/quuu'|"[^"]*\/quuu")\s+call\s+assistant\.noReply\s+'([^']+)'\s*$/.exec(command)
  if (!match) return false
  try {
    const args: unknown = JSON.parse(match[1])
    return Boolean(args && typeof args === 'object' && !Array.isArray(args) && Object.keys(args).length === 1 &&
      'runId' in args && typeof args.runId === 'string' && /^run_[a-zA-Z0-9]+$/.test(args.runId))
  } catch { return false }
}
