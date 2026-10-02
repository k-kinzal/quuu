import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Consumer isolation cannot detect drift inside the kit itself. */
export function inspectDesignInternals(path, source) {
  if (path.endsWith('/theme/controls.ts') || path.includes('.stories.')) return []
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const issues = []
  const name = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : ''
  function visit(node, focused = false) {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(property =>
      ts.isSpreadAssignment(property) && ts.isCallExpression(property.expression) &&
      name(property.expression.expression) === 'controlMetrics')) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && /^(height|fontSize|lineHeight|letterSpacing|borderRadius|padding)$/.test(name(property.name))) {
          const { line } = file.getLineAndCharacterOfPosition(property.getStart(file))
          issues.push(`${path}:${line + 1}: do not override part of controlMetrics(); change the shared size recipe`)
        }
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const key = name(node.name)
      focused ||= /focus/i.test(key)
      if (focused && /^(outline(?:Color|Width|Style|Offset)?|boxShadow)$/.test(key)) {
        const reset = (ts.isStringLiteral(node.initializer) && node.initializer.text === 'none') ||
          (ts.isNumericLiteral(node.initializer) && node.initializer.text === '0')
        if (!reset) {
          const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
          issues.push(`${path}:${line + 1}: focus appearance belongs to theme/controls.ts; use focusRing()`)
        }
      }
    }
    ts.forEachChild(node, child => visit(child, focused))
  }
  visit(file)
  return issues
}

export function inspectDesignKit(root) {
  const issues = []
  let files = 0
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.stories.')) {
        files++
        issues.push(...inspectDesignInternals(relative(root, path), readFileSync(path, 'utf8')))
      }
    }
  }
  walk(join(root, 'packages/design-system/src'))
  return { files, issues }
}
