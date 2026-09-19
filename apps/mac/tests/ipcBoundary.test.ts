import { ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { MessageChannel } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizedFrame } from '../src/main/ipc/validation.js'
import type { Task, TaskInput } from '../src/preload/api.js'
import { contract } from '../src/preload/contract.js'
import { createQuuuClient } from '../src/renderer/src/state/client.js'

let channel: MessageChannel
beforeEach(() => { channel = new MessageChannel() })
afterEach(() => { channel.port1.close(); channel.port2.close() })

const task: Task = {
  id: 't1', projectId: 'p1', title: '依頼', prompt: '', status: 'queued', priority: 2, seq: 0,
  scheduledAt: null, currentRunId: null, sessionId: null, agentOverrideId: null,
  pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
  source: 'user', ruleId: null, externalKey: null, archived: false, createdAt: '', updatedAt: '', doneAt: null
}

// Make the mock implement the same contract as production, used through the same serializer and client.
function connect(create: (input: TaskInput) => Task) {
  const router = { tasks: { create: implement(contract.tasks.create).handler(({ input }) => create(input)) } }
  new RPCHandler(router).upgrade(channel.port1)
  channel.port1.start()
  channel.port2.start()
  const failed = vi.fn()
  return { client: createQuuuClient(channel.port2, failed), failed }
}

describe('both ends of IPC implement the same contract', () => {
  it('the generated client receives results from a mock implementing the contract', async () => {
    const create = vi.fn((input: { title: string }) => ({ ...task, title: input.title }))
    const { client, failed } = connect(create)
    const result = await client.tasks.create({ projectId: 'p1', title: '依頼', dependsOn: undefined })
    expect(result).toEqual(task)
    expect(create).toHaveBeenCalledOnce()
    expect(failed).not.toHaveBeenCalled()
  })

  it('a response that deviates from the contract is not handed to the UI as success', async () => {
    const broken = { ...task }
    // Reproduce a value that differs from the static declaration coming back from the DB or external input.
    Reflect.set(broken, 'status', 'unknown')
    const { client, failed } = connect(() => broken)
    await expect(client.tasks.create({ projectId: 'p1', title: '依頼' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(failed).toHaveBeenCalledWith(expect.any(ORPCError), ['tasks', 'create'], true)
  })

  it('a declared operation-failure reason survives to the client and reaches the failure callback', async () => {
    const { client, failed } = connect(() => {
      throw new ORPCError('OPERATION_FAILED', { data: { reason: 'cannot write to the destination' } })
    })
    await expect(client.tasks.create({ projectId: 'p1', title: '依頼' })).rejects.toMatchObject({ code: 'OPERATION_FAILED', data: { reason: 'cannot write to the destination' } })
    expect(failed).toHaveBeenCalledOnce()
  })

  it('losing the connection mid-request delivers a failure instead of waiting forever', async () => {
    const failed = vi.fn()
    const client = createQuuuClient(channel.port2, failed)
    const request = client.tasks.create({ projectId: 'p1', title: '依頼' })
    const rejected = expect(request).rejects.toThrow()
    channel.port1.close()
    await rejected
    expect(failed).toHaveBeenCalledOnce()
  })

  it('a request violating the contract is rejected before the operation runs', async () => {
    const create = vi.fn(() => task)
    connect(create)
    const wire = new RPCLink({ port: channel.port2 })
    for (const input of [{ projectId: 'p1' }, { projectId: 'p1', title: '依頼', status: 'done' }]) {
      await expect(wire.call(['tasks', 'create'], input, { context: {} })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(create).not.toHaveBeenCalled()
  })
})

it('accepts only the app main frame, rejecting other windows, iframes and other pages', () => {
  const sender = { owned: true, mainFrame: true, actualUrl: 'file:///app/index.html', expectedUrl: 'file:///app/index.html' }
  expect(authorizedFrame(sender)).toBe(true)
  for (const change of [{ owned: false }, { mainFrame: false }, { actualUrl: 'https://example.com' }]) expect(authorizedFrame({ ...sender, ...change })).toBe(false)
})
