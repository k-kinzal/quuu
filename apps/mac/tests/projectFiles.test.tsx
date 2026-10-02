// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { ReviewOperations } from '../src/main/review/operations.js'
import { ReviewService } from '../src/main/review/service.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { INITIAL_PLACE, INITIAL_TRAIL } from '../src/renderer/src/state/navigation.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { ProjectFiles } from '../src/renderer/src/views/project/ProjectFiles.js'
import { ProjectNavigation } from '../src/renderer/src/views/project/ProjectNavigation.js'
import { makeProject, memoryDb } from './helpers.js'

let cwd: string
let db: Db
let operations: ReviewOperations
let projectId: string
const git = (...args: string[]): string => execFileSync('/usr/bin/git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim()

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'quuu-project-files-'))
  db = memoryDb()
  projectId = makeProject(db, { name: 'Files', path: cwd, targetId: '' })
  operations = new ReviewOperations(db, () => DEFAULT_SETTINGS, new ReviewService(), () => ({ dir: cwd, project: repo.getProject(db, projectId)! }))
  git('init', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  mkdirSync(join(cwd, 'src'))
  writeFileSync(join(cwd, 'README.md'), '# Files\n')
  writeFileSync(join(cwd, 'src', 'index.ts'), 'export const value = 1\n')
  writeFileSync(join(cwd, 'src', 'gone.ts'), 'export {}\n')
  git('add', '.')
  git('commit', '-m', 'Files')
})
afterEach(() => { cleanup(); queryClient.clear(); operations.stop(); db.close(); rmSync(cwd, { recursive: true, force: true }) })

describe('a project’s files', () => {
  it('reads the project directory as it stands, marking what is uncommitted against HEAD', async () => {
    writeFileSync(join(cwd, 'src', 'index.ts'), 'export const value = 2\n')
    rmSync(join(cwd, 'src', 'gone.ts'))
    mkdirSync(join(cwd, 'notes'))
    writeFileSync(join(cwd, 'notes', 'new.md'), 'new\n')

    const files = await operations.projectFiles(projectId)
    expect(files).toMatchObject({ cwd, branch: 'main' })
    expect(files.changes).toEqual([
      { path: 'notes/new.md', change: 'untracked' },
      { path: 'src/gone.ts', change: 'deleted' },
      { path: 'src/index.ts', change: 'modified' }
    ])
    const file = await operations.projectFile(projectId, 'src/index.ts')
    expect(file).toMatchObject({ source: 'working', path: 'src/index.ts', content: 'export const value = 2\n' })
    expect(file.diff.some(line => line.kind === 'added' && line.text.includes('value = 2'))).toBe(true)
  })

  it('refuses a path outside the project directory', async () => {
    await expect(operations.projectFile(projectId, '../outside.txt')).rejects.toThrow()
  })

  it('opens from the project navigation and shows the tree, its changes and the file chosen', async () => {
    writeFileSync(join(cwd, 'src', 'index.ts'), 'export const value = 2\n')
    const project = repo.getProject(db, projectId)!
    const os = implement(contract)
    Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: createRouterClient({
      review: {
        projectFiles: os.review.projectFiles.handler(({ input }) => operations.projectFiles(input)),
        projectFile: os.review.projectFile.handler(({ input }) => operations.projectFile(input.projectId, input.path, input.previousPath))
      }
    }) })
    window.matchMedia = (query) => ({ matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
    useStore.setState({ ...INITIAL_PLACE, section: { kind: 'project', id: projectId }, trail: INITIAL_TRAIL,
      settings: { ...DEFAULT_SETTINGS } })

    render(<ThemeProvider><ProjectNavigation project={project} /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project Files' }))
    expect(useStore.getState()).toMatchObject({ projectFilesOpen: true, projectDocumentsOpen: false, projectPullRequestsOpen: false, detailOpen: false })
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(useStore.getState().projectFilesOpen).toBe(false)
    await act(() => useStore.getState().goBack())
    expect(useStore.getState().projectFilesOpen).toBe(true)
    cleanup()

    render(<ThemeProvider><ProjectFiles project={project} /></ThemeProvider>)
    const tree = await screen.findByRole('tree', { name: 'Files in the project directory' })
    expect(screen.getByText('1 uncommitted')).toBeTruthy()
    expect(within(tree).getByRole('treeitem', { name: 'README.md' })).toBeTruthy()
    // The first directory starts open, the way an IDE does
    expect(within(tree).getByRole('treeitem', { name: /^src/ }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(await within(tree).findByRole('treeitem', { name: /^index\.ts/ }))
    await waitFor(() => expect(screen.getAllByText(/value = 2/).length).toBeGreaterThan(0))
  })
})
