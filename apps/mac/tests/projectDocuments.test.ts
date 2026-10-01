import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { documentationLinks, documentBranch, listProjectDocuments, readProjectDocument } from '../src/main/projects/documents.js'
import { makeProject, memoryDb } from './helpers.js'

const website = 'https://k-kinzal.github.io/ztd-query-php/k-kinzal/sql-semantics/'
const badge = `[![Docs](https://img.shields.io/badge/docs-sql--semantics-0969da?logo=php&logoColor=white)](${website})`
let cwd: string
let db: ReturnType<typeof memoryDb>
let projectId: string
const git = (...args: string[]): string => execFileSync('/usr/bin/git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim()
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'quuu-documents-'))
  db = memoryDb()
  projectId = makeProject(db, { name: 'Documentation', path: cwd, targetId: '' })
  git('init', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  mkdirSync(join(cwd, 'docs'))
  writeFileSync(join(cwd, 'README.md'), `# Committed README\n\n${badge}\n`)
  writeFileSync(join(cwd, 'docs', '日本語 guide.md'), '# Guide\n\nA table and code.')
  symlinkSync('/etc/passwd', join(cwd, 'docs', 'secret.md'))
  git('add', '.')
  git('commit', '-m', 'Documents')
})
afterEach(() => { db.close(); rmSync(cwd, { recursive: true, force: true }) })

it('reads the default branch while preserving the current branch, index and dirty files', async () => {
  git('switch', '-c', 'feature')
  writeFileSync(join(cwd, 'README.md'), '# Feature branch')
  git('add', '.')
  git('commit', '-m', 'Different README')
  writeFileSync(join(cwd, 'README.md'), '# Unsaved work')
  writeFileSync(join(cwd, 'untracked.md'), 'Untracked')
  const before = git('status', '--porcelain')
  const docs = await listProjectDocuments(db, projectId)
  expect(docs.branch).toBe('main')
  expect(docs.files.map(file => file.path)).toEqual(['README.md', 'docs/日本語 guide.md'])
  expect(docs.websites).toEqual([{ title: 'Docs', url: website }])
  const content = await readProjectDocument(db, { projectId, revision: docs.revision, path: 'README.md' })
  expect(content.content).toContain('# Committed README')
  expect(git('branch', '--show-current')).toBe('feature')
  expect(git('status', '--porcelain')).toBe(before)
  expect(readFileSync(join(cwd, 'README.md'), 'utf8')).toBe('# Unsaved work')
})

it('uses a nonstandard origin default and reads it without creating a local branch', async () => {
  git('update-ref', 'refs/remotes/origin/trunk', 'HEAD')
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk')
  expect((await documentBranch(cwd)).branch).toBe('trunk')
  expect(git('branch', '--list', 'trunk')).toBe('')
})

it('discovers published docs in package READMEs beyond the first twenty and labels their package', async () => {
  writeFileSync(join(cwd, 'README.md'), '# Packages\n')
  for (let i = 0; i < 22; i++) {
    const directory = join(cwd, 'packages', `example-${i}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'README.md'), '# Example\n')
  }
  const directory = join(cwd, 'packages', 'sql-semantics')
  mkdirSync(directory)
  writeFileSync(join(directory, 'README.md'), `# SQL semantics\n\n${badge}\n`)
  writeFileSync(join(directory, 'README.ja.md'), badge)
  git('add', '.')
  git('commit', '-m', 'Package documentation')
  git('switch', '-c', 'feature')
  writeFileSync(join(directory, 'README.md'), '# Uncommitted package')
  expect((await listProjectDocuments(db, projectId)).websites).toEqual([{ title: 'sql-semantics · Docs', url: website }])
}, 15_000) // This exercises Git against more than twenty packages, not an in-memory index.

it('reads an immutable revision after the default branch changes and refuses unlisted paths', async () => {
  const docs = await listProjectDocuments(db, projectId)
  writeFileSync(join(cwd, 'README.md'), '# New revision')
  git('add', '.')
  git('commit', '-m', 'Updated documents')
  expect((await readProjectDocument(db, { projectId, revision: docs.revision, path: 'README.md' })).content).toContain('# Committed README')
  for (const path of ['../README.md', 'docs/secret.md', '.git/config', '/etc/passwd']) {
    await expect(readProjectDocument(db, { projectId, revision: docs.revision, path })).rejects.toThrow()
  }
})

it('parses badge and reference links, deduplicates sites, and ignores examples and unsafe schemes', () => {
  const markdown = `${badge}\n\n[Documentation][site]\n\n[site]: ${website}\n\n` +
    '[Guide](https://example.com/guide_(advanced))\n\n' +
    '```md\n[Docs](https://fake.example/docs/)\n```\n\n' +
    '`[Docs](https://inline.example/docs/)`\n\n[Docs](file:///etc/passwd)\n[Docs](javascript:alert(1))\n[Docs](https://user:password@example.com)\n[Build](https://example.com/actions)'
  expect(documentationLinks(markdown)).toEqual([{ title: 'Docs', url: website }, { title: 'Guide', url: 'https://example.com/guide_(advanced)' }])
})

it('reports an oversized document while leaving its siblings readable', async () => {
  writeFileSync(join(cwd, 'large.md'), 'x'.repeat(2 * 1024 * 1024 + 1))
  git('add', '.')
  git('commit', '-m', 'Large document')
  const docs = await listProjectDocuments(db, projectId)
  await expect(readProjectDocument(db, { projectId, revision: docs.revision, path: 'large.md' })).rejects.toThrow(/2 MB/)
  expect((await readProjectDocument(db, { projectId, revision: docs.revision, path: 'README.md' })).format).toBe('markdown')
})
