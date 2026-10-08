import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Nodes } from 'mdast'

function text(node: Nodes): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value
  if (node.type === 'image') return node.alt ?? ''
  if (node.type === 'break') return '\n'
  return 'children' in node ? node.children.map(text).join('') : ''
}

/** Channel previews are prose; unfinished fences and wide tables belong in the thread. */
export function conversationExcerpt(markdown: string): string {
  const blocks = fromMarkdown(markdown).children
  const prose = blocks.filter(node => node.type === 'paragraph' && !text(node).trimStart().startsWith('|'))
  const candidates = prose.length > 0 ? prose : blocks.filter(node => node.type !== 'code' && node.type !== 'html')
  return candidates.map(text).filter(Boolean).join('\n\n') || blocks.find(node => node.type === 'code')?.value || markdown
}
