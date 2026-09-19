import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { layerOf, layerViolation, packageDependencies, purePackages } from './policy.mjs'

/** Regexes miss type imports, re-exports, and dynamic imports, so read the syntax tree. */
export function importsOf(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const imports = []
  const add = (node, typeOnly = false) => {
    imports.push({ typeOnly, specifier: ts.isStringLiteralLike(node) ? node.text : null, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) add(node.moduleSpecifier, ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly || node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every(e => e.isTypeOnly)) : node.isTypeOnly)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true)
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) add(node.moduleReference.expression)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ['require', 'nodeRequire'].includes(node.expression.text)))) {
      if (node.arguments[0]) add(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

function filesIn(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesIn(path)
    return /\.(?:[cm]?[jt]sx?)$/.test(path) && !/\.(?:stories|test)\./.test(path) ? [path] : []
  })
}

/** Cycles cover value and type edges alike; a type-only back-dependency still blocks splitting responsibilities. */
export function cyclesOf(graph) {
  const visiting = new Set()
  const visited = new Set()
  const stack = []
  const cycles = []
  function visit(file) {
    if (visiting.has(file)) {
      cycles.push([...stack.slice(stack.indexOf(file)), file])
      return
    }
    if (visited.has(file)) return
    visiting.add(file)
    stack.push(file)
    for (const target of graph.get(file) ?? []) visit(target)
    stack.pop()
    visiting.delete(file)
    visited.add(file)
  }
  for (const file of graph.keys()) visit(file)
  return cycles
}

export function analyze(root) {
  const issues = []
  const packages = ['apps', 'packages'].flatMap((group) =>
    readdirSync(join(root, group), { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
      const dir = join(root, group, entry.name)
      const manifest = join(dir, 'package.json')
      return existsSync(manifest) ? [{ dir, ...JSON.parse(readFileSync(manifest, 'utf8')) }] : []
    })
  )
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const ownerOf = (file) => packages.find((pkg) => file.startsWith(`${pkg.dir}/`))
  const files = packages.flatMap((pkg) => filesIn(join(pkg.dir, 'src')))
  const fileSet = new Set(files)
  const graph = new Map(files.map((file) => [file, new Set()]))
  const manifestGraph = new Map()
  for (const pkg of packages) {
    if (!(pkg.name in packageDependencies)) issues.push(`${pkg.name}: package responsibility and dependency direction are undefined`)
    const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies }
    manifestGraph.set(pkg.name, new Set(Object.keys(dependencies).filter((name) => byName.has(name))))
    for (const dep of Object.keys(dependencies)) {
      if (byName.has(dep) && !packageDependencies[pkg.name]?.includes(dep)) issues.push(`${pkg.name}: manifest dependency direction violation → ${dep}`)
      if (purePackages.has(pkg.name) && !byName.has(dep)) issues.push(`${pkg.name}: external runtime dependency ${dep} in a pure package`)
    }
  }
  const configs = new Map()
  function compilerOptions(file, pkg) {
    const configPath = pkg.name === 'quuu'
      ? join(pkg.dir, file.includes('/renderer/') ? 'tsconfig.web.json' : 'tsconfig.node.json')
      : join(pkg.dir, 'tsconfig.json')
    if (!configs.has(configPath)) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile)
      if (Object.keys(config.config?.compilerOptions?.paths ?? {}).some(k => /^@shared(?:\/|$)/.test(k))) issues.push(`${configPath}: shared alias is forbidden`)
      configs.set(configPath, ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dirname(configPath)).options)
    }
    return configs.get(configPath)
  }
  for (const file of files) {
    const from = relative(root, file)
    if (from.split('/').includes('shared')) issues.push(`${from}: shared is forbidden`)
    if (from === 'apps/mac/src/preload/api.ts') {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const node of source.statements) {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEmptyStatement(node)) continue
        if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && node.isTypeOnly) continue
        issues.push(`${from}: no runtime code in the API declaration`)
      }
    }
    const pkg = ownerOf(file)
    for (const imported of importsOf(file, readFileSync(file, 'utf8'))) {
      const { specifier, line } = imported
      if (specifier && /^(?:@shared(?:\/|$)|@quuu\/(?:domain(?:-ui)?|contracts|review|sync)(?:\/|$))/.test(specifier)) issues.push(`${from}:${line}: reference to a retired boundary ${specifier}`)
      const fail = (message) => issues.push(`${from}:${line}: ${message}`)
      if (specifier === null) { fail('import / require whose target cannot be resolved statically'); continue }
      const bareName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      const dependency = byName.get(bareName)
      const layer = layerOf(from)
      if ((layer.startsWith('main/') || layer === 'preload') && ['@design-system/react'].includes(bareName)) fail(`process logic must not import a UI package: ${specifier}`)
      // Column dimensions come from the DS source of truth. Only the React-free entry is allowed in the view model.
      if (layer === 'renderer/model' && specifier !== '@design-system/react/layout-spec' && ['react', 'zustand', '@mui/material', '@design-system/react'].includes(bareName)) fail(`view models must not depend on UI or state libraries: ${specifier}`)
      if (isBuiltin(specifier) || specifier === 'electron') {
        if (purePackages.has(pkg.name) || layerOf(from).startsWith('renderer/') || pkg.name === '@quuu/mobile' || pkg.name === '@design-system/react' || (layer === 'preload' && specifier !== 'electron')) fail(`OS dependency ${specifier} is not allowed in this layer`)
        continue
      }
      // CSS is not a TypeScript module; verify it exists via Node's resolution rules.
      if (specifier.endsWith('.css')) {
        if (purePackages.has(pkg.name)) fail(`CSS is not allowed in a pure package: ${specifier}`)
        try {
          const cssPath = createRequire(file).resolve(specifier)
          const cssOwner = ownerOf(cssPath)
          if (cssOwner && cssOwner.name !== pkg.name) fail(`must not import another package's internal CSS directly: ${specifier}`)
        } catch { fail(`unresolvable CSS ${specifier}`) }
        continue
      }
      const resolved = ts.resolveModuleName(specifier, file, compilerOptions(file, pkg), ts.sys).resolvedModule
      if (!resolved) { fail(`unresolvable dependency ${specifier}`); continue }
      // TypeScript normalizes workspace symlinks to real paths.
      const target = resolve(resolved.resolvedFileName)
      const targetPkg = ownerOf(target)
      if (targetPkg && pkg.name !== targetPkg.name) {
        if (!dependency || dependency.name !== targetPkg.name) fail(`cross packages via the public entry, not relative paths or aliases: ${specifier}`)
        const subpath = specifier === bareName ? '.' : `.${specifier.slice(bareName.length)}`
        if (!targetPkg.exports || !(subpath in targetPkg.exports)) fail(`non-public entry ${specifier}`)
        if (!packageDependencies[pkg.name]?.includes(targetPkg.name)) fail(`package dependency direction violation ${pkg.name} → ${targetPkg.name}`)
        if (!pkg.dependencies?.[targetPkg.name] && !pkg.peerDependencies?.[targetPkg.name]) fail(`dependency ${targetPkg.name} missing from manifest`)
      }
      if (purePackages.has(pkg.name) && !targetPkg) fail(`external dependency ${specifier} in a pure package`)
      if (fileSet.has(target)) {
        graph.get(file).add(target)
        const violation = layerViolation(from, relative(root, target), imported.typeOnly)
        if (violation) fail(violation)
      }
    }
  }
  for (const cycle of cyclesOf(graph)) issues.push(`file cycle: ${cycle.map((file) => relative(root, file)).join(' → ')}`)
  for (const cycle of cyclesOf(manifestGraph)) issues.push(`package cycle: ${cycle.join(' → ')}`)
  return { issues: [...new Set(issues)], files: files.length, edges: [...graph.values()].reduce((n, targets) => n + targets.size, 0) }
}
