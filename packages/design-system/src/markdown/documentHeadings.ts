import GithubSlugger from 'github-slugger'
import type { Root, RootContent } from 'mdast'

/** Heading identities follow the parsed document, so re-rendering never advances a slug counter. */
export function remarkDocumentHeadings(options: { prefix?: string }): (tree: Root) => void {
  return tree => {
    if (options.prefix === undefined) return
    const slugger = new GithubSlugger()
    const text = (node: RootContent): string => {
      if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? ''
      if ('children' in node) return node.children.map(text).join('')
      return 'value' in node && node.type !== 'html' ? node.value : ''
    }
    const visit = (node: Root | RootContent): void => {
      if (node.type === 'heading') {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: options.prefix + slugger.slug(text(node)) } }
      }
      if ('children' in node) node.children.forEach(visit)
    }
    visit(tree)
  }
}
