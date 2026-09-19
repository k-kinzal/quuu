// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { SessionView } from '../src/main/session/view.js'
import { SessionTurn } from '../src/renderer/src/components/SessionTurn.js'
import { buildTurns } from '../src/renderer/src/model/summarize.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

let dir: string
let codexDir: string
let db: ReturnType<typeof memoryDb>
let view: SessionView
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-chat-recovery-'))
  codexDir = isolateSessionDirs(dir).codex
  db = memoryDb()
  view = new SessionView(db)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
})
afterEach(() => {
  cleanup()
  view.closeSession()
  db.close()
  releaseSessionDirs()
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

it.each([false, true])('recovers the conversation and resume target from a long prompt, and can toggle execution / thinking / results (resume failed with a wrong ID: %s)', async (resumeFailed) => {
  const agentId = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'codex' })
  const projectId = makeProject(db, { name: '検証', targetId: agentId, path: dir })
  const taskId = makeTask(db, projectId, '長い指示から会話を開く')
  const stdout = join(dir, 'run.log')
  const actualId = '01a075da-e8ed-75d0-8354-e1302f5a72c2'
  writeFileSync(stdout, '# cmd: codex exec ' + 'x'.repeat(50_248) + '\nOpenAI Codex v0.153.4\n--------\nworkdir: /tmp\nsession id: ' + actualId + '\n--------\nexec\nnpm run check\nexited 0\n')
  const runId = occupy(db, taskId, agentId, { stdoutLogPath: stdout })
  repo.updateRun(db, runId, { status: 'succeeded', endedAt: new Date().toISOString() })
  repo.setTaskStatus(db, taskId, 'review')
  const day = join(codexDir, '2026', '09', '06')
  mkdirSync(day, { recursive: true })
  const logPath = join(day, `rollout-now-${actualId}.jsonl`)
  const response = (payload: unknown) => ({ type: 'response_item', timestamp: '2026-09-06T08:34:35.000Z', payload })
  writeFileSync(logPath, [
    { type: 'session_meta', payload: { id: actualId, cwd: dir } },
    response({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'チャットの表示を確認して' }] }),
    response({ type: 'reasoning', summary: [{ type: 'summary_text', text: '構造化された会話を確認する' }] }),
    response({ type: 'custom_tool_call', call_id: 'call-1', name: 'exec', input: 'const r = await tools.exec_command({cmd:"npm run check"}); text(r.output);' }),
    response({ type: 'custom_tool_call_output', call_id: 'call-1', output: 'Script completed\nWall time 0.1 seconds\nOutput:\n検証成功 42 件' }),
    response({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '**確認できました**' }] })
  ].map(value => JSON.stringify(value)).join('\n') + '\n')

  let selectedRunId = runId
  if (resumeFailed) {
    const initial = repo.getRun(db, runId)!
    const failedLog = join(dir, 'failed-resume.log')
    writeFileSync(failedLog, 'Error: no rollout found for thread id ' + initial.sessionId)
    selectedRunId = 'run_failed_resume'
    repo.insertRun(db, { ...initial, id: selectedRunId, kind: 'followup', stdoutLogPath: failedLog, status: 'failed', errorMessage: 'no rollout found' })
    repo.setTaskStatus(db, taskId, 'failed', { currentRunId: selectedRunId, sessionId: initial.sessionId })
  }
  const loaded = view.loadSession(selectedRunId)
  expect(repo.getRun(db, selectedRunId)?.sessionId).toBe(actualId)
  if (resumeFailed) expect(repo.getRun(db, selectedRunId)).toMatchObject({ status: 'failed', errorMessage: 'no rollout found' })
  expect(loaded.logPath).toBe(logPath)
  expect(repo.getRun(db, runId)?.sessionId).toBe(actualId)
  expect(repo.getTask(db, taskId)?.sessionId).toBe(actualId)
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}>{buildTurns(loaded.messages).map(turn => <SessionTurn key={turn.id} turn={turn} cwd={dir} />)}</ThemeProvider>)
  const execution = screen.getByRole('button', { name: /Run\s*npm run check/ })
  expect(screen.queryByText('検証成功 42 件')).toBeNull()
  fireEvent.click(execution)
  expect(screen.getByText('検証成功 42 件')).toBeTruthy()
  const input = screen.getByRole('region', { name: 'Input' })
  const result = screen.getByRole('region', { name: 'Result' })
  expect(input.querySelector('pre')?.textContent).toBe('const r = await tools.exec_command({cmd:"npm run check"}); text(r.output);')
  expect(result.querySelector('pre')?.textContent).toBe('検証成功 42 件')
  const details = document.getElementById(execution.getAttribute('aria-controls')!)
  expect(details?.contains(input)).toBe(true)
  expect(details?.contains(result)).toBe(true)
  fireEvent.click(execution)
  expect(execution.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByText('検証成功 42 件').closest('[aria-hidden="true"]')).not.toBeNull()
  /*
   * The content unmounts when the closing transition ends (`Reveal`, 180ms). The default
   * one-second wait is enough on an idle machine and not enough on a busy one, so this test
   * failed about half the time for reasons that had nothing to do with what it guards.
   */
  await waitFor(() => expect(screen.queryByText('検証成功 42 件')).toBeNull(), { timeout: 4000 })
  fireEvent.click(screen.getByRole('button', { name: /Thinking \(\d+ chars\)/ }))
  expect(screen.getByText('構造化された会話を確認する')).toBeTruthy()
  expect(screen.getByText('確認できました').tagName).toBe('STRONG')
})
