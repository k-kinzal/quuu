// A CLI that lives only inside fixture data. No auth, no outbound traffic; it reproduces slow responses.
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

const [directory, requestedId, prompt] = process.argv.slice(2)
if (!directory || !requestedId || !prompt) throw new Error('fixture arguments are required')
const time = Date.now().toString(16).padStart(12, '0')
const sessionId = requestedId[14] === '7' ? requestedId : `${time.slice(0, 8)}-${time.slice(8)}-7000-8000-000000000001`
console.log(`OpenAI Codex v0.0.0-fixture\n--------\nworkdir: ${directory}\nsession id: ${sessionId}\n--------`)
const log = join(directory, 'codex-sessions', ...new Date().toISOString().slice(0, 10).split('-'), `rollout-${sessionId}.jsonl`)
const append = (payload) => appendFileSync(log, JSON.stringify(payload) + '\n')
const message = (role, text) => append({ type: 'response_item', timestamp: new Date().toISOString(), payload: {
  type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }]
} })

await wait(12000)
mkdirSync(dirname(log), { recursive: true })
append({ type: 'session_meta', payload: { id: sessionId, cwd: directory } })
message('user', prompt)
await wait(6000)
message('assistant', 'Instruction received. Checking the display.')
await wait(18000)
message('assistant', 'Confirmed. Follow-up instructions can arrive in this same session.')
