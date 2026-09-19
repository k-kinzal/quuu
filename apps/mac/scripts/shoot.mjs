/**
 * Screenshot the real screen of a running Quuu.
 *
 * A tool for looking at the **actual app**, not a Storybook composite demo.
 * Launch Electron with `--remote-debugging-port` and connect straight to
 * CDP (Chrome DevTools Protocol) to capture.
 * Uses only Node's built-in WebSocket, so no new dependencies.
 *
 *   node scripts/shoot.mjs <output dir> [port]
 *
 * Screen switching drives the renderer's zustand store directly.
 * More reliable than scripting clicks for landing on the target screen.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? '/tmp/taskd-shots'
const port = Number(process.argv[3] ?? 9222)
mkdirSync(outDir, { recursive: true })

/* ------------------------------------------------------------------- CDP */

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`no CDP page found (port ${port})`)
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const pending = new Map()
    let seq = 0

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
      else p.resolve(msg.result)
    })
    ws.addEventListener('error', reject)
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const id = ++seq
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej })
            ws.send(JSON.stringify({ id, method, params }))
          })
        },
        close: () => ws.close()
      })
    )
  })
}

/* ---------------------------------------------------------------- Shoot */

const page = await findPage()
const cdp = await connect(page.webSocketDebuggerUrl)

async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' — ' + expression.slice(0, 80))
  return r.result.value
}

async function shoot(name) {
  await new Promise((r) => setTimeout(r, 450))
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const file = join(outDir, `${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(file)
}

/** Direct entry into the store, used to switch screens */
const setup = `(() => {
  const s = window.__quuuStore
  if (!s) throw new Error('window.__quuuStore is missing (launch with QUUU_DEBUG_STORE=1)')
  return true
})()`

await evaluate(setup)

const shots = JSON.parse(process.env.QUUU_SHOTS ?? '[]')
for (const { name, script, wait } of shots) {
  if (script) await evaluate(script)
  if (wait) await new Promise((r) => setTimeout(r, wait))
  await shoot(name)
}

cdp.close()
