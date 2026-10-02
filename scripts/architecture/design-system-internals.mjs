import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Consumer isolation cannot detect drift inside the kit itself. */
export function inspectDesignInternals(path, source) {
  if (path.endsWith('/theme/controls.ts') || path.includes('.stories.')) return []
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const issues = []
  const name = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : ''
  const buttons = new Set(['button'])
  function collect(node) {
    if (ts.isImportDeclaration(node) && /@mui\/material\/(IconButton|Button|TabScrollButton)$/.test(name(node.moduleSpecifier))) {
      buttons.add(name(node.importClause?.name))
    }
    if (ts.isVariableDeclaration(node)) {
      let value = node.initializer
      while (value && ts.isCallExpression(value)) {
        if (name(value.expression) === 'styled' && buttons.has(name(value.arguments[0]))) buttons.add(name(node.name))
        value = value.expression
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(file)
  function visit(node, focused = false) {
    const hasAttribute = key => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.attributes.properties.some(property => ts.isJsxAttribute(property) && name(property.name) === key)
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && buttons.has(name(node.tagName)) &&
      (hasAttribute('aria-label') || (hasAttribute('title') && (hasAttribute('collapsed') || ts.isJsxSelfClosingElement(node))))) {
      let parent = node.parent
      while (parent && !(ts.isJsxElement(parent) && name(parent.openingElement.tagName) === 'ControlTooltip')) parent = parent.parent
      if (!parent) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
        issues.push(`${path}:${line + 1}: named icon controls must use ControlTooltip; aria-label or native title alone does not provide a visible name`)
      }
    }
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
