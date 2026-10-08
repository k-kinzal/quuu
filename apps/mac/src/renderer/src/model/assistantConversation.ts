import type { SessionMessage } from '../../../api/schemas/session.js'

/** Keep the person's words in the chat; app-supplied context remains in the durable session log. */
export function assistantConversation(messages: SessionMessage[]): SessionMessage[] {
  return messages.map(message => message.role !== 'user' ? message : {
    ...message, blocks: message.blocks.map(block => block.kind !== 'text' ? block : {
      ...block, text: block.text.replace(/\n\n<quuu-assistant-context>[\s\S]*<\/quuu-assistant-context>\s*$/, '')
    })
  })
}
