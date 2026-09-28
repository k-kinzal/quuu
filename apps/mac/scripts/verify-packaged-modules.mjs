/*
 * Fail packaging when a module the main process or preload imports cannot be resolved inside
 * app.asar (electron-builder afterPack).
 *
 * Why: electron-builder collects node_modules from the npm workspace's hoisted tree and has
 * dropped packages from it (micromark-util-subtokenize, which mdast-util-from-markdown reaches
 * through micromark). A local build never shows this: from apps/mac/release/…/app.asar, Node
 * walks up to the repository's node_modules and finds the package there. Only another Mac, with
 * nothing above /Applications/Quuu.app, fails at launch. So resolve every external import and
 * its dependencies the way Node would, but only within the archive.
 *
 * Type packages (@types/*) are declared as dependencies by many libraries and never loaded at
 * runtime; electron-builder leaves them out on purpose.
 */
import { extractFile, listPackage } from '@electron/asar'
import { builtinModules } from 'node:module'
import { join, posix } from 'node:path'

const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g
const bare = /^((?:@[\w-][\w.-]*\/)?[\w-][\w.-]*)(?:\/[\w./-]+)?$/
const runtime = new Set(['electron', ...builtinModules])

export function archivePath(context) {
  return context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app.asar')
    : join(context.appOutDir, 'resources', 'app.asar')
}

/** Every "package (needed by …)" that Node could not resolve from inside the archive. */
export function missingModules(archive) {
  const files = new Set(listPackage(archive, { isPack: false }).map(file => file.replaceAll('\\', '/')))
  const read = file => extractFile(archive, file.slice(1)).toString('utf8')
  const resolve = (from, name) => {
    for (let dir = from; ; dir = posix.dirname(dir)) {
      const found = posix.join(dir, 'node_modules', name)
      if (files.has(`${found}/package.json`)) return found
      if (dir === '/') return null
    }
  }
  const missing = new Set()
  const visited = new Set()
  const visit = (from, name, neededBy) => {
    if (runtime.has(name) || name.startsWith('node:') || name.startsWith('@types/')) return
    const found = resolve(from, name)
    if (!found) return void missing.add(`${name} (needed by ${neededBy})`)
    if (visited.has(found)) return
    visited.add(found)
    const manifest = JSON.parse(read(`${found}/package.json`))
    const optionalPeers = manifest.peerDependenciesMeta ?? {}
    const peers = Object.keys(manifest.peerDependencies ?? {}).filter(peer => !optionalPeers[peer]?.optional)
    for (const dependency of [...Object.keys(manifest.dependencies ?? {}), ...peers]) visit(found, dependency, name)
  }
  for (const file of files) {
    if (!/^\/out\/(main|preload)\/.*\.(c|m)?js$/.test(file)) continue
    for (const [, target] of read(file).matchAll(specifier)) {
      const name = bare.exec(target)?.[1]
      if (name) visit(posix.dirname(file), name, file.slice(1))
    }
  }
  return [...missing].sort()
}

export default function verifyPackagedModules(context) {
  const archive = archivePath(context)
  const missing = missingModules(archive)
  if (missing.length > 0) {
    throw new Error(`${archive} is missing modules the app loads at runtime:\n  ${missing.join('\n  ')}`)
  }
}
