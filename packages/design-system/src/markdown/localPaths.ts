import type { Link, Parent, PhrasingContent, Root, RootContent } from 'mdast'

/** Local destinations are opt-in: a web or phone host may have no filesystem opener. */
export function localPathUrl(value: string): string | null {
  if (/^(?:\/(?!\/)|~\/)/.test(value) && !/\p{Cc}/u.test(value)) return value
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (!url.hostname || url.hostname === 'localhost') return value
    } catch { /* An incomplete destination stays as text while the message streams. */ }
  }
  return null
}

function pathLink(value: string, code = false): Link {
  // Encode literal %, # and ? too; they can be part of a filename, not URL syntax.
  const url = value.split('/').map(encodeURIComponent).join('/')
  return { type: 'link', url, children: [{ type: code ? 'inlineCode' : 'text', value }] }
}

function linkText(value: string): PhrasingContent[] {
  const nodes: PhrasingContent[] = []
  // Bare prose needs delimiters; paths with spaces or punctuation can use inline code or links.
  const paths = /(^|[\s("'「『（【：:])((?:~\/|\/(?!\/))[^\s<>"'`「」『』（）【】、。！？,;!?]+)/gu
  let end = 0
  for (const match of value.matchAll(paths)) {
    const start = match.index + match[1].length
    const path = match[2].replace(/[.:)\]}]+$/, '')
    if (path.length <= (path.startsWith('~/') ? 2 : 1)) continue
    if (start > end) nodes.push({ type: 'text', value: value.slice(end, start) })
    nodes.push(pathLink(path))
    end = start + path.length
  }
  if (end < value.length) nodes.push({ type: 'text', value: value.slice(end) })
  return nodes
}

/** Extend the parsed tree, leaving Markdown grammar, existing links, and fences to remark. */
export function remarkLocalPaths(): (tree: Root) => void {
  const walk = (parent: Parent): void => {
    parent.children = parent.children.flatMap<RootContent>((node) => {
      if (node.type === 'link' || node.type === 'linkReference') return [node]
      if (node.type === 'inlineCode' && /^(?:\/(?!\/)|~\/)/.test(node.value) && localPathUrl(node.value)) {
        return [pathLink(node.value, true)]
      }
      if (node.type === 'text') return linkText(node.value)
      if ('children' in node) walk(node)
      return [node]
    })
  }
  return walk
}
