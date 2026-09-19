import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const stylingProps = new Set(['sx', 'style', 'css', 'className'])
const dimensions = new Set([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'fontSize',
  'strokeWidth',
  'size',
  'gap',
  'pad',
  'padX', 'padY', 'termWidth', 'indent', 'offset', 'minSize', 'startInset', 'inset', 'grow'
])
const nativeControls = new Set([
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'progress',
  'meter',
  'table',
  'style',
  'link'
])
const stylingImports = /^(?:@mui\/|@emotion\/|styled-components(?:\/|$))/
const rawColor = /^(?:#[\da-f]{3,8}|rgba?\(|hsla?\(|oklch\()/i

/** Retired tuning props must not come back, even via variables or spreads. */
const retiredProps = new Set(['padX', 'padY', 'termWidth', 'indent', 'offset'])

/** Follow imports and local variable references via TS symbols; never infer a binding from name equality alone. */
function sourceProgram(sources) {
  const options = {
    target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, noLib: true, types: []
  }
  const files = new Map([...sources].map(([file, source]) => [resolve(file), source]))
  const host = ts.createCompilerHost(options)
  const originalDirectoryExists = host.directoryExists
  host.directoryExists = (dir) => [...files.keys()].some((file) => file.startsWith(`${resolve(dir)}/`)) || originalDirectoryExists(dir)
  const originalExists = host.fileExists
  host.fileExists = (file) => files.has(resolve(file)) || originalExists(file)
  host.getSourceFile = (file) => {
    const source = files.get(resolve(file))
    return source === undefined ? undefined : ts.createSourceFile(file, source, options.target, true, ts.ScriptKind.TSX)
  }
  return ts.createProgram([...files.keys()], options, host)
}

export function inspectDesignSources(sources) {
  const program = sourceProgram(sources)
  return [...sources].flatMap(([file, source]) => inspectDesignSource(file, source, program))
}

/** Allows composition and semantic color assignment; checks the entry points that define appearance. */
export function inspectDesignSource(file, source, program = sourceProgram(new Map([[file, source]]))) {
  const ast = program.getSourceFile(resolve(file))
  const checker = program.getTypeChecker()
  const issues = []
  const report = (node, message) =>
    issues.push(
      `${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${message}`
    )
  const nameOf = (node) =>
    node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null
  function symbolOf(node) {
    const symbol = checker.getSymbolAtLocation(node)
    return symbol?.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  }
  function objectProperties(node, seen = new Set()) {
    if (!node || seen.has(node)) return []
    seen = new Set(seen).add(node)
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
      return objectProperties(node.expression, seen)
    if (ts.isObjectLiteralExpression(node))
      return node.properties.flatMap((property) => ts.isSpreadAssignment(property)
        ? objectProperties(property.expression, seen) : [property])
    const initializers = (symbolOf(node)?.declarations ?? []).flatMap((decl) =>
      decl.initializer ? objectProperties(decl.initializer, seen) : [])
    return initializers.length ? initializers : checker.getTypeAtLocation(node).getProperties().flatMap((property) => property.declarations ?? [])
  }
  function isLocalDesignValue(node, seen = new Set(), matches = (value) =>
    ts.isNumericLiteral(value) || (ts.isStringLiteralLike(value) && /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?$/.test(value.text))) {
    if (!node || seen.has(node)) return false
    seen = new Set(seen).add(node)
    if (matches(node)) return true
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isPrefixUnaryExpression(node))
      return isLocalDesignValue(node.expression ?? node.operand, seen, matches)
    if (ts.isConditionalExpression(node))
      return isLocalDesignValue(node.whenTrue, seen, matches) || isLocalDesignValue(node.whenFalse, seen, matches)
    if (ts.isBinaryExpression(node))
      return isLocalDesignValue(node.left, seen, matches) || isLocalDesignValue(node.right, seen, matches)
    if (ts.isCallExpression(node)) {
      const declarations = symbolOf(node.expression)?.declarations ?? []
      return node.arguments.some((arg) => isLocalDesignValue(arg, seen, matches)) || declarations.some((decl) => {
        const body = decl.body ?? decl.initializer?.body
        if (!body) return false
        if (!ts.isBlock(body)) return isLocalDesignValue(body, seen, matches)
        return body.statements.some((statement) => ts.isReturnStatement(statement) && isLocalDesignValue(statement.expression, seen, matches))
      })
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : nameOf(node.argumentExpression)
      if (objectProperties(node.expression).some((property) => nameOf(property.name) === key &&
        isLocalDesignValue(ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer, seen, matches))) return true
    }
    const declarations = symbolOf(ts.isPropertyAccessExpression(node) ? node.name : node)?.declarations ?? []
    return declarations.some((decl) => {
      if (decl.initializer && isLocalDesignValue(decl.initializer, seen, matches)) return true
      if (ts.isShorthandPropertyAssignment(decl))
        return (checker.getShorthandAssignmentValueSymbol(decl)?.declarations ?? []).some((value) => isLocalDesignValue(value.initializer, seen, matches))
      if (ts.isBindingElement(decl) && ts.isVariableDeclaration(decl.parent.parent)) {
        const initializer = decl.parent.parent.initializer
        if (!initializer) return false
        const property = checker.getTypeAtLocation(initializer).getProperty((decl.propertyName ?? decl.name).getText())
        return (property?.declarations ?? []).some((value) => isLocalDesignValue(value.initializer, seen, matches)) || isLocalDesignValue(initializer, seen, matches)
      }
      return false
    })
  }
  function controlName(tag) {
    const symbol = checker.getSymbolAtLocation(tag)
    const imported = symbol?.declarations?.find(ts.isImportSpecifier)
    return imported ? (imported.propertyName ?? imported.name).text : tag.getText(ast).split('.').at(-1)
  }
  function checkProp(node, name, value, control) {
    if (name === 'color' && isLocalDesignValue(value, new Set(), (v) => ts.isStringLiteralLike(v) && rawColor.test(v.text)))
      report(node, 'do not define raw colors on the consumer side')
    if (retiredProps.has(name)) {
      report(node, `${name} is a retired dimension tuning prop; use purpose-describing props`)
      return
    }
    const dimension = dimensions.has(name) ||
      (['Resizer', 'ColumnResizer'].includes(control) && ['min', 'max', 'value'].includes(name))
    if (dimension && isLocalDesignValue(value)) report(node, `do not fix the ${name} dimension on the consumer side (variables, expressions, and spread sources are checked too)`)
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const module = node.moduleSpecifier
      if (module && ts.isStringLiteral(module)) {
        const specifier = module.text
        // The Theme type augmentation is the View's status-display contract. Implementation APIs are not allowed.
        const themeType =
          ['apps/mac/src/renderer/src/ui/theme.ts', 'apps/mobile/src/ui/theme.ts'].some((path) => file.endsWith(path)) &&
          ts.isImportDeclaration(node) &&
          node.importClause?.isTypeOnly
        if (stylingImports.test(specifier) && !themeType)
          report(
            node,
            'do not import/export a style implementation on the consumer side; feed it back to the Design System'
          )
        if (/\.(?:css|scss|sass|less)(?:\?|$)/.test(specifier))
          report(node, 'do not load stylesheets on the consumer side')
        if (
          specifier === '@design-system/react' &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          for (const item of node.exportClause.elements)
            if (['styled', 'css', 'keyframes'].includes((item.propertyName ?? item.name).text))
              report(item, 'do not re-export style-generation APIs')
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (nativeControls.has(node.tagName.getText(ast)))
        report(node, 'do not render controls from raw HTML; use Design System components')
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxSpreadAttribute(attr)) continue
        for (const property of objectProperties(attr.expression)) {
          const name = nameOf(property.name)
          if (stylingProps.has(name)) report(attr, `do not override ${name} via spread`)
          checkProp(attr, name, ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer, controlName(node.tagName))
        }
      }
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(ast)
      if (stylingProps.has(name))
        report(node, `do not override appearance with ${name}; go back to purpose-describing props/components`)
      const value =
        node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer
      checkProp(node, name, value, controlName(node.parent.parent.tagName))
    }
    // Overrides via spread and direct writes to DOM.style count as the same entry point.
    if (ts.isPropertyAssignment(node) && stylingProps.has(nameOf(node.name))) {
      // A language dictionary (css: 'css') is not a styling definition.
      const languageName =
        nameOf(node.name) === 'css' &&
        ts.isStringLiteral(node.initializer) &&
        node.initializer.text === 'css'
      if (!languageName) report(node, 'do not assemble style objects on the consumer side')
    }
    if (ts.isPropertyAccessExpression(node) && ['style', 'className'].includes(node.name.text))
      report(node, 'the Design System owns DOM styling')
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      ['style', 'className'].includes(node.argumentExpression.text)
    )
      report(node, 'the Design System owns DOM styling')
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ''
      if (['styled', 'css', 'keyframes', 'insertRule', 'addRule'].includes(name))
        report(node, 'generate styling rules inside the Design System')
      if (
        name === 'setAttribute' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        ['style', 'class'].includes(node.arguments[0].text)
      )
        report(node, 'do not define appearance via DOM attributes')
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return issues
}

export function inspectDesignConsumers(root) {
  const issues = []
  const sources = new Map()
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      const file = relative(root, path)
      if (/\.(?:css|scss|sass|less)$/.test(file)) {
        issues.push(`${file}: do not keep stylesheets on the consumer side`)
        continue
      }
      if (!/\.[jt]sx?$/.test(file)) continue
      sources.set(path, readFileSync(path, 'utf8'))
    }
  }
  for (const dir of ['apps/mac/src/renderer', 'apps/mobile/src'])
    walk(join(root, dir))
  issues.push(...inspectDesignSources(sources))
  return { files: sources.size, issues }
}
