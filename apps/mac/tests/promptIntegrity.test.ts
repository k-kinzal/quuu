import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, sessioned } from './helpers.js'
import { renderPullRequestPrompt } from '../src/main/settings/pullRequestPrompts.js'
import { resumeMessage, runDisposition, undelivered } from '../src/main/execution/conditions.js'
import { expandArgs } from '../src/main/agent-clis/templating.js'
import { ClaudeSessionParser } from '../src/main/agent-adapters/claude/parser.js'
import { CopilotSessionParser } from '../src/main/agent-adapters/copilot/parser.js'
import { unwrapQuery } from '../src/main/agent-adapters/grok/parser.js'
import { userText } from '../src/main/agent-adapters/agy/parser.js'
import { extractUserQuery } from '../src/main/agent-adapters/parserUtil.js'

vi.mock('../src/main/platform/shellEnv.js', () => ({ resolveLoginPath: () => Promise.resolve(process.env.PATH ?? '/usr/bin:/bin') }))

const input = '\n  日本語の原文\r\n{{prompt}} {{title}} $HOME `literal`\n\t'
let dir: string, app: QuuuApp, projectId: string, agentId: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-prompt-integrity-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  app = new QuuuApp(join(dir, 'test.db'))
  app.scheduler.pause()
  agentId = makeAgent(app.db, { name: 'Literal', command: '/bin/sh', logAdapter: 'stdout',
    argsTemplate: ['-c', 'printf %s "$1" > "$2"', 'quuu', '{{prompt}}', join(dir, 'received')], resumeArgsTemplate: ['{{prompt}}'] })
  projectId = makeProject(app.db, { name: 'Project', path: dir, targetId: agentId })
})
afterEach(async () => {
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

it.each([input, ' \n\t '])('stores and launches the exact task prompt %j through the real local process', async prompt => {
  const task = app.tasks.createTask({ projectId, title: 'Task', prompt, status: 'queued' })
  expect(task.prompt).toBe(prompt)
  const run = await app.runner.start({ task, project: repo.getProject(app.db, projectId)!, agent: repo.getAgent(app.db, agentId)!,
    groupId: null, kind: 'initial', fallbackFromRunId: null })
  await vi.waitFor(() => expect(repo.getRun(app.db, run.id)?.status).toBe('succeeded'))
  expect(readFileSync(join(dir, 'received'), 'utf8')).toBe(prompt)
})

it('retains whitespace through pending messages, reservations and release after success', () => {
  const task = app.tasks.createTask({ projectId, title: 'Task', prompt: input, status: 'draft' })
  sessioned(app.db, task.id, agentId, 'review')
  app.tasks.send(task.id, input)
  expect(repo.getTask(app.db, task.id)?.pendingMessage).toBe(input)
  const next = '  次の返信\n'
  app.tasks.send(task.id, next)
  expect(repo.getTask(app.db, task.id)?.pendingMessage).toBe(input + '\n\n' + next)
  repo.setTaskStatus(app.db, task.id, 'running')
  app.tasks.send(task.id, input)
  app.tasks.send(task.id, next)
  const current = repo.getTask(app.db, task.id)!
  expect(current.reservedMessage).toBe(input + '\n\n' + next)
  expect(runDisposition(current, null, false)).toMatchObject({ pendingMessage: input + '\n\n' + next })
  app.tasks.sendBack(task.id, input)
  expect(repo.getTask(app.db, task.id)?.pendingMessage).toBe(input)
})

it('retries original input and only removes complete previously delivered messages', () => {
  expect(resumeMessage(input, [input])).toBe(input)
  expect(undelivered(input + '\n\n  next\n', [input])).toBe('  next\n')
  expect(undelivered('Please do more', ['Please do'])).toBe('Please do more')
  expect(undelivered(input, [input.trim()])).toBe(input)
})

it('saves custom report, pull request and hook prompts without rewriting their values', () => {
  const settings = { ...repo.getAppSettings(app.db), reportInstructions: input, projectReportInstructions: input,
    pullRequestFailurePrompt: input, taskHooks: [{ id: 'literal', prompt: input }] }
  repo.saveAppSettings(app.db, settings)
  expect(repo.getAppSettings(app.db)).toEqual(settings)
  expect(renderPullRequestPrompt(input, [])).toBe(input.replace('{{title}}', ''))
  expect(renderPullRequestPrompt('  {{title}}\n{{unknown}}  ', [{ title: '{{url}}', url: 'url', number: 1, headRefName: 'head', baseRefName: 'base' }]))
    .toBe('  {{url}}\n{{unknown}}  ')
})

it('expands argument templates once and leaves unknown names literal', () => {
  expect(expandArgs(['{{prompt}}', '{{unknown}} {{constructor}}'], {
    prompt: input, title: 'Title', sessionId: 'session', projectPath: dir, projectName: 'Project', taskId: 'task', runId: 'run'
  })).toEqual([input, '{{unknown}} {{constructor}}'])
})

it('retains original whitespace in provider conversation bodies', () => {
  const claude = new ClaudeSessionParser()
  claude.pushLines([JSON.stringify({ type: 'user', uuid: 'u', message: { role: 'user', content: input } })])
  expect(claude.messages[0].blocks).toEqual([{ kind: 'text', text: input }])
  const copilot = new CopilotSessionParser()
  copilot.pushLines([JSON.stringify({ type: 'user.message', id: 'u', data: { content: input } })])
  expect(copilot.messages[0].blocks).toEqual([{ kind: 'text', text: input }])
  for (const unwrap of [unwrapQuery, userText, extractUserQuery]) expect(unwrap(input)).toBe(input)
  expect(unwrapQuery(`<user_query>\n${input}\n</user_query>`)).toBe(input)
  expect(extractUserQuery(`<user_query>\n${input}\n</user_query>`)).toBe(input)
  expect(userText(`<USER_REQUEST>\n${input}\n</USER_REQUEST>`)).toBe(input)
})
