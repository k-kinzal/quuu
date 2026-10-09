import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, opendir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const DOCUMENT_ROOTS = new Set(['doc', 'docs', 'documentation'])
const EXTENSIONS = new Set(['.md', '.markdown', '.mdx', '.rst', '.txt', '.adoc'])
const GENERATED = new Set(['node_modules', 'vendor', 'venv', 'env', 'build', 'dist', 'target',
  'coverage', '__pycache__', 'models', 'checkpoints', 'outputs'])
const MAX_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_BYTES = 16 * MAX_FILE_BYTES
const MAX_ENTRIES = 4096
const MAX_DEPTH = 4

/** A deliberately narrow, bounded document fingerprint; never enumerate a project's artifact trees. */
export async function documentRevision(cwd: string, instructions: string): Promise<string> {
  const deadline = performance.now() + 5000
  let entries = 0
  let bytes = 0
  const documents: Array<[string, string]> = []
  function checkBudget(): void {
    // A partial scan must never certify that a project is unchanged.
    if (entries > MAX_ENTRIES || bytes > MAX_TOTAL_BYTES || performance.now() > deadline) {
      throw new Error('Project report document scan exceeded its limit (4096 entries, 16 MiB, 5 seconds)')
    }
  }
  async function visit(relative: string, depth: number): Promise<void> {
    const directory = await opendir(join(cwd, relative))
    for await (const entry of directory) {
      entries++
      checkBudget()
      const name = entry.name.toLowerCase()
      if (name.startsWith('.')) continue
      const path = join(relative, entry.name)
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !GENERATED.has(name) && (depth > 0 || DOCUMENT_ROOTS.has(name))) {
          await visit(path, depth + 1)
        }
      } else if (entry.isFile() && (EXTENSIONS.has(extname(name)) || /^(readme|agents|claude|license|copying)$/.test(name))) {
        // Skip large documents as a whole, and never follow links or open a substituted FIFO.
        if ((await lstat(join(cwd, path))).size > MAX_FILE_BYTES) continue
        const file = await open(join(cwd, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try {
          const before = await file.stat()
          if (!before.isFile() || before.size > MAX_FILE_BYTES) continue
          const hash = createHash('sha256')
          let size = 0
          for await (const chunk of file.createReadStream({ autoClose: false, start: 0, end: MAX_FILE_BYTES })) {
            const buffer = chunk as Buffer
            size += buffer.length
            bytes += buffer.length
            checkBudget()
            hash.update(buffer)
          }
          const after = await file.stat()
          if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
            throw new Error(`Project report document changed while being read: ${path}`)
          }
          documents.push([path, hash.digest('hex')])
        } finally { await file.close() }
      }
    }
  }
  await visit('', 0)
  checkBudget()
  documents.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ kind: 'documents-v1', cwd, instructions, documents })).digest('hex')
}
