// @vitest-environment jsdom
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EVENTS } from '../src/api/channels.js'
import type { QuuuEvents } from '../src/api/events.js'

const host = vi.hoisted(() => ({ exposed: new Map<string, unknown>() }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcRenderer: Object.assign(new EventEmitter(), { postMessage: vi.fn(), send: vi.fn() }),
    contextBridge: { exposeInMainWorld: (key: string, value: unknown) => host.exposed.set(key, value) },
    webUtils: {}
  }
})

beforeEach(() => { vi.resetModules(); host.exposed.clear() })
afterEach(() => vi.restoreAllMocks())

it('delivers a startup notification once the screen subscribes, and never replays it on resubscription', async () => {
  await import('../src/preload/index.js')
  const { ipcRenderer } = await import('electron')
  const emitter = ipcRenderer as EventEmitter
  const events = host.exposed.get('quuuEvents') as QuuuEvents
  const payload = { command: 'task.open', taskId: 'waiting' }
  emitter.emit(EVENTS.command, {}, payload)
  const listener = vi.fn()
  const unsubscribe = events.command(listener)
  expect(listener).toHaveBeenCalledOnce()
  expect(listener).toHaveBeenCalledWith(payload)
  unsubscribe()
  const next = vi.fn()
  events.command(next)
  expect(next).not.toHaveBeenCalled()
  emitter.emit(EVENTS.command, {}, { command: 'task.open', taskId: 'new' })
  expect(next).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledWith({ command: 'task.open', taskId: 'new' })
  expect(listener).toHaveBeenCalledOnce()
})
