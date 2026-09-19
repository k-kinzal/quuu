import type { CodeSymbol, DiffLine } from './types.js'

export function languageOf(path: string): string {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const languages: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.sh': 'shellscript',
    '.zsh': 'shellscript',
    '.py': 'python',
    '.rb': 'ruby',
    '.php': 'php',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.java': 'java',
    '.kt': 'kotlin',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.sql': 'sql',
    '.xml': 'xml'
  }
  return languages[name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : ''] ?? ''
}

export function parseUnifiedDiff(raw: string): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  const source = raw.split('\n')
  for (const [index, line] of source.entries()) {
    // The trailing-newline marker of a unified diff is not line content. An empty context line starts with a space.
    if (line === '' && index === source.length - 1) continue
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      result.push({ kind: 'hunk', oldLine: null, newLine: null, text: hunk[3].trim() })
      continue
    }
    if (!inHunk || line === '\\ No newline at end of file') continue
    if (line.startsWith('+')) {
      result.push({ kind: 'added', oldLine: null, newLine, text: line.slice(1) })
      newLine += 1
    } else if (line.startsWith('-')) {
      result.push({ kind: 'deleted', oldLine, newLine: null, text: line.slice(1) })
      oldLine += 1
    } else {
      result.push({ kind: 'context', oldLine, newLine, text: line.startsWith(' ') ? line.slice(1) : line })
      oldLine += 1
      newLine += 1
    }
  }
  return result
}

export function contextLines(content: string): DiffLine[] {
  return content.split('\n').map((text, index) => ({
    kind: 'context' as const,
    oldLine: index + 1,
    newLine: index + 1,
    text
  }))
}

export function extractSymbols(path: string, content: string): CodeSymbol[] {
  const language = languageOf(path)
  const symbols: CodeSymbol[] = []
  let braceDepth = 0
  const patterns: Array<{ kind: CodeSymbol['kind']; expression: RegExp }> =
    language === 'markdown'
      ? [{ kind: 'heading', expression: /^(#{1,6})\s+(.+)$/ }]
      : [
        { kind: 'class', expression: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
        { kind: 'interface', expression: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
        { kind: 'type', expression: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/ },
        { kind: 'function', expression: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
        { kind: 'function', expression: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/ },
        { kind: 'method', expression: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/ }
      ]

  content.split('\n').forEach((line, index) => {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(line)
      if (!match) continue
      const name = language === 'markdown' ? match[2] : match[1]
      if (pattern.kind === 'method' && ['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) {
        continue
      }
      symbols.push({
        name,
        kind: pattern.kind,
        line: index + 1,
        depth: language === 'markdown' ? Math.max(0, match[1].length - 1) : braceDepth
      })
      break
    }
    // Rather than faking a full syntax tree, only brace languages get an approximate nesting depth.
    // Stripping strings and line comments keeps the display indent from being dragged around by string contents.
    if (language !== 'markdown') {
      const structural = line
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
        .replace(/\/\/.*$/, '')
      const opening = structural.match(/{/g)?.length ?? 0
      const closing = structural.match(/}/g)?.length ?? 0
      braceDepth = Math.max(0, braceDepth + opening - closing)
    }
  })
  return symbols.slice(0, 400)
}

