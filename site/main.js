// Quuu product page — one loop drives scroll-scrubbed scenes and pointer-driven light.
// No dependencies. Motion uses the app's own curve (cubic ease-out, no overshoot).

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const fine = matchMedia('(pointer: fine)').matches
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const span = (p, a, b) => clamp((p - a) / (b - a))
const root = document.documentElement

/* ── Pointer, smoothed ── */
const ptr = { x: innerWidth / 2, y: innerHeight * 0.3, sx: innerWidth / 2, sy: innerHeight * 0.3, active: false }
addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true }, { passive: true })
addEventListener('pointerleave', () => { ptr.active = false })

/* ── Ambient field: the app's decorative light (tokens.ambientGradient), drifting and leaning toward the pointer ── */
const ambient = (() => {
  const canvas = $('[data-ambient]')
  const ctx = canvas.getContext('2d')
  const colors = ['#72baff', '#ce9dff', '#00d4d5', '#fe8dc5', '#d6b529']
  const periods = [120, 144, 168, 156, 180].map((s) => s / 7)
  const anchors = [[0.18, 0.2], [0.82, 0.18], [0.7, 0.78], [0.22, 0.8], [0.5, 0.5]]
  let w = 0, h = 0
  const size = () => { w = canvas.width = Math.ceil(innerWidth / 8); h = canvas.height = Math.ceil(innerHeight / 8) }
  size(); addEventListener('resize', size)
  return (t, scrollP) => {
    ctx.clearRect(0, 0, w, h)
    const px = ptr.sx / innerWidth, py = ptr.sy / innerHeight
    colors.forEach((c, i) => {
      const a = (t / 1000 / periods[i]) * Math.PI * 2
      const [ax, ay] = anchors[i]
      const x = (ax + Math.sin(a + i) * 0.14 + (px - 0.5) * 0.12 * (i % 2 ? 1 : -1)) * w
      const y = (ay + Math.cos(a * 0.8 + i * 2) * 0.12 + (py - 0.5) * 0.1 - (scrollP * 0.3 % 1) * 0.1) * h
      const r = Math.max(w, h) * (0.42 + 0.06 * Math.sin(a * 1.3))
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, c + '55'); g.addColorStop(1, c + '00')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    })
  }
})()

/* ── Hero title: split into words that rise in on load ── */
let wordIndex = 0
for (const el of $$('[data-split]')) {
  el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="w" style="--i:${wordIndex++}">${w}</span>`).join(' ')
}

/* ── Manifesto: split into words that light up with scroll ── */
const whyWords = $$('[data-words]').flatMap((p) => {
  p.innerHTML = p.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ')
  return $$('.w', p)
})

/* ── Lists with FLIP: rows glide to their new group instead of jumping ── */
const STATUS_ORDER = ['review', 'failed', 'running', 'queued', 'held', 'draft', 'done']
const GROUP_NAME = { review: 'Review', failed: 'Failed', running: 'Running', queued: 'Queued', held: 'Held', draft: 'Draft', done: 'Done' }
const PROJECTS = { Quuu: '#5eabf1', 'design-system': '#5dac7b', 'docs-site': '#aa8ddd', 'runtime-tools': '#e8a750' }

function makeList(container, { columns }) {
  const nodes = new Map()
  let lastKey = ''
  let rendered = false
  const rowHTML = (t) => {
    const proj = `<span class="row__proj"><i class="pdot" style="--c:${PROJECTS[t.project]}"></i>${t.project}</span>`
    const agent = `<span class="row__agent">${t.from ? `<s>${t.from} →</s> ${t.agent}` : t.agent}</span>`
    return `<i class="mk mk--${t.mark || t.status}"></i><span class="row__title">${t.title}</span>` +
      (columns === 'full' ? proj + agent : '') + `<span class="row__status">${t.statusHTML}</span>`
  }
  return (tasks) => {
    const order = []
    for (const s of STATUS_ORDER) {
      const inGroup = tasks.filter((t) => t.status === s)
      if (!inGroup.length) continue
      order.push({ key: `g:${s}`, html: `${GROUP_NAME[s]} <b>${inGroup.length}</b>`, cls: 'grp' })
      for (const t of inGroup) order.push({ key: `t:${t.id}`, html: rowHTML(t), cls: `row${t.sel ? ' is-sel' : ''}` })
    }
    const key = order.map((o) => o.key).join('|')
    const moved = key !== lastKey
    lastKey = key
    const first = new Map()
    if (moved && !reduced) for (const [k, el] of nodes) first.set(k, el.getBoundingClientRect())
    const keep = new Set(order.map((o) => o.key))
    for (const [k, el] of nodes) if (!keep.has(k)) { el.remove(); nodes.delete(k) }
    order.forEach((o, i) => {
      let el = nodes.get(o.key)
      let fresh = false
      if (!el) { el = document.createElement('div'); nodes.set(o.key, el); fresh = rendered && !reduced }
      if (el.innerHTML !== o.html) el.innerHTML = o.html
      if (el.className.replace(' is-new', '') !== o.cls) el.className = o.cls
      if (fresh) { el.classList.add('is-new'); el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true }) }
      if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null)
    })
    rendered = true
    if (!moved || reduced) return
    for (const [k, el] of nodes) {
      const a = first.get(k)
      if (!a) continue
      const b = el.getBoundingClientRect()
      const dy = a.top - b.top
      if (Math.abs(dy) < 1) continue
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
  }
}

/* ── Scene: one day of the queue ── */
const day = (() => {
  const el = $('.day')
  const list = makeList($('[data-rows]', el), { columns: 'full' })
  const steps = $$('[data-steps] li', el)
  const ticks = $$('[data-ticks] i', el)
  const clock = $('[data-clock]', el)
  const composer = $('[data-composer]', el)
  const counts = Object.fromEntries($$('[data-s]', el).map((n) => [n.dataset.s, n]))
  const slots = $$('[data-slots] i', el)
  const total = $('[data-total]', el)
  const times = [520, 542, 570, 670, 790, 1170, 1174, 1176] // minutes: 08:40 … 19:36
  const T = {
    A: ['Rebuild the color tokens in OKLCH', 'Quuu'],
    B: ['Restructure the site TOC by section', 'docs-site'],
    C: ['Rotate logs by date', 'runtime-tools'],
    D: ['Tighten the tool-row verb column', 'design-system'],
    E: ['Reliably clean up MCP grandchild processes', 'runtime-tools'],
    F: ['Generate the API reference in CI', 'docs-site'],
    G: ['Burn down issues 2026/09/28', 'runtime-tools'],
  }
  const q = (n) => ({ status: 'queued', text: `Queue #${n}` })
  const run = (agent, since, from) => ({ status: 'running', agent, since, from })
  const rev = (at) => ({ status: 'review', text: `Succeeded · ${at}` })
  const done = { status: 'done', text: 'Done · 19:33' }
  const draft = { status: 'draft', text: '—' }
  const plan = [
    { A: draft, B: draft, C: draft, D: draft, E: draft, F: draft },
    { A: q(1), C: q(2), B: q(3), D: q(4), E: q(5), F: q(6) },
    { A: run('Claude Opus', 548), C: run('Codex', 549), B: run('Claude Opus', 551), D: q(1), E: q(2), F: q(3) },
    { A: run('Codex', 548, 'Opus'), C: run('Codex', 549), B: rev('10:41'), D: run('Cursor', 642), E: q(1), F: q(2) },
    { A: rev('12:06'), B: rev('10:41'), C: rev('11:52'), D: run('Cursor', 642), E: { status: 'failed', text: 'exit 1 · retry 13:20' }, F: run('Grok', 745) },
    { A: { ...rev('12:06'), sel: true }, B: rev('10:41'), C: rev('11:52'), D: rev('14:37'), E: run('Codex', 800), F: run('Grok', 745) },
    { A: done, B: done, C: done, D: rev('14:37'), E: rev('16:10'), F: run('Grok', 745), G: q(1) },
  ]
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, '0')}m` : `${Math.floor(m)}m ${String(Math.floor((m % 1) * 60)).padStart(2, '0')}s`)
  const typed = 'Tighten the tool-row verb column so long verbs never wrap'
  let lastStep = -1
  return (p) => {
    const n = plan.length
    const f = clamp(p * n, 0, n - 0.0001)
    const step = Math.floor(f)
    const local = f - step
    const now = lerp(times[step], times[step + 1], local)
    clock.textContent = hhmm(now)
    if (step !== lastStep) steps.forEach((li, i) => li.classList.toggle('on', i === step))
    ticks.forEach((t, i) => t.style.setProperty('--f', i < step ? 1 : i === step ? local.toFixed(3) : 0))
    if (step === 0) {
      composer.classList.add('typing')
      composer.textContent = typed.slice(0, Math.round(clamp(local * 1.4) * typed.length))
    } else if (lastStep === 0 || lastStep === -1) {
      composer.classList.remove('typing')
      composer.textContent = 'Task title…'
    }
    lastStep = step
    const state = plan[step]
    const tasks = Object.entries(state).map(([id, s]) => {
      const [title, project] = T[id]
      const statusHTML = s.status === 'running' && s.from && step === 3
        ? `<span class="c-amber">Limit</span> <span class="t3">→</span> <span class="c-blue">${s.agent} ${dur(Math.max(0.2, now - 670))}</span>`
        : s.status === 'running'
        ? `<span class="c-blue">Running ${dur(Math.max(0.2, now - s.since))}</span>`
        : s.sel ? '<span class="row__btns"><span>Run</span><span class="ok">Done</span></span>'
        : s.status === 'failed' ? `<span class="c-red">${s.text}</span>`
        : s.status === 'done' ? `<span class="c-green">${s.text}</span>` : s.text
      return { id, title, project, status: s.status, agent: s.agent || (project === 'runtime-tools' ? 'Codex' : 'Claude Opus'), from: s.from, statusHTML, sel: s.sel }
    })
    list(tasks)
    const c = (s) => tasks.filter((t) => t.status === s).length
    for (const k of ['running', 'queued', 'review', 'done']) counts[k].textContent = c(k)
    slots.forEach((s, i) => s.classList.toggle('on', i < c('running')))
    total.textContent = tasks.length
  }
})()

/* ── Scene: agents and a limit handoff ── */
const agents = (() => {
  const rows = Object.fromEntries($$('[data-agents] tbody tr').map((r) => [r.dataset.a, r]))
  const group = $('[data-group]')
  const event = $('[data-agent-event]')
  const set = (a, state, label, slot) => {
    const r = rows[a]
    r.classList.toggle('is-run', state === 'run')
    r.classList.toggle('is-limit', state === 'limit')
    $('[data-st]', r).textContent = label
    if (slot) $('[data-slot]', r).textContent = slot
  }
  const timeline = [
    [0.16, () => { set('opus', 'run', 'Running', '1/2'); return '<b>10:12</b>  Claude Opus  started “Rebuild the color tokens in OKLCH”' }],
    [0.32, () => { set('opus', 'limit', 'Limit · resets 15:00', '0/2'); return '<b>11:10</b>  Claude Opus  <span class="c-amber">“You\'ve reached your limit · resets 3pm”</span><br>cooling for exactly that long' }],
    [0.46, () => { set('codex', 'run', 'Running · same session', '1/1'); group.classList.add('is-hot'); return '<b>11:10</b>  Codex  continues session 7f3a where Claude Opus stopped' }],
    [0.62, () => { set('cursor', 'run', 'Running', '1/1'); set('grok', 'run', 'Running', '1/1'); return '<b>11:24</b>  Cursor, Grok  take the next two in the queue' }],
    [0.8, () => { set('opus', 'idle', 'Idle', '0/2'); return '<b>15:00</b>  Claude Opus  limit lifted — back in rotation' }],
  ]
  const trs = Object.values(rows)
  let last = -2
  return (p) => {
    trs.forEach((r, i) => r.style.setProperty('--o', easeOut(span(p, 0.01 + i * 0.015, 0.08 + i * 0.015)).toFixed(3)))
    const idx = timeline.filter(([at]) => p >= at).length - 1
    if (idx === last) return
    last = idx
    for (const a of Object.keys(rows)) set(a, 'idle', 'Idle', a === 'opus' ? '0/2' : '0/1')
    group.classList.remove('is-hot')
    let msg = 'All agents idle · 7 enabled'
    for (let i = 0; i <= idx; i++) msg = timeline[i][1]()
    event.innerHTML = msg
  }
})()

/* ── Scene: restart ── */
const restart = (() => {
  const el = $('.restart')
  const seg = Object.fromEntries($$('[data-seg]', el).map((s) => [s.dataset.seg, s]))
  const marks = { quit: $('.lane__mark--quit', el), up: $('.lane__mark--up', el), exit: $('.lane__mark--exit', el) }
  const lanes = $('[data-lanes]', el)
  const time = $('[data-playtime]', el)
  const term = $('[data-term]', el)
  const setSeg = (k, a, b) => { seg[k].style.setProperty('--a', a); seg[k].style.setProperty('--b', b) }
  const lines = [
    [0, '<span class="t3">$</span> quuu tasks list --status running\n3 running · claude 48211 · codex 48236 · cursor-agent 48290'],
    [0.38, '<span class="t3">$</span> kill -TERM $(pgrep -x Quuu)\n<span class="bad">Quuu exited</span> · 3 agents still running, logs on disk'],
    [0.52, 'cursor-agent 48290 exited 0 · recorded to logs/7f3a.exit'],
    [0.62, '<span class="t3">$</span> open -a Quuu\n<span class="ok">↺ re-adopted 48211 · 48236   ✓ settled 48290 from its exit code → Review</span>'],
  ]
  let lastLine = -1
  return (p) => {
    const t = clamp(span(p, 0.05, 0.95))
    lanes.style.setProperty('--p', t.toFixed(4))
    setSeg('app1', 0, Math.min(t, 0.38))
    setSeg('app2', 0.62, t > 0.62 ? t : 0.62)
    setSeg('a1', 0.04, Math.max(0.04, t))
    setSeg('a2', 0.12, Math.max(0.12, t))
    setSeg('a3', 0.2, Math.max(0.2, Math.min(t, 0.52)))
    marks.quit.classList.toggle('on', t >= 0.38)
    marks.exit.classList.toggle('on', t >= 0.52)
    marks.up.classList.toggle('on', t >= 0.62)
    const m = 600 + t * 40
    time.textContent = `10:${String(Math.floor(m - 600)).padStart(2, '0')}`
    const idx = lines.filter(([at]) => t >= at).length - 1
    if (idx !== lastLine) {
      lastLine = idx
      term.innerHTML = lines.slice(Math.max(0, idx - 1), idx + 1).map(([, l]) => l).join('\n')
    }
  }
})()

/* ── Scene: wallpaper through glass ── */
const wall = (() => {
  const el = $('.wall')
  const imgs = $$('.wall__bg img', el)
  const timeEl = $('[data-wall-time]', el)
  const line = $('[data-wall-line]', el)
  const allEl = $('[data-wall-all]', el)
  const revEl = $('[data-wall-review]', el)
  const list = makeList($('[data-wall-rows]', el), { columns: 'short' })
  const r = (id, title, project, status, text) => ({ id, title, project, status, statusHTML: text })
  const phases = [
    { at: '08:40', line: 'Queue it before coffee.', rows: [
      r('a', 'Rebuild the color tokens', 'Quuu', 'running', '<span class="c-blue">Running 2m</span>'),
      r('b', 'Restructure the site TOC', 'docs-site', 'queued', 'Queue #1'), r('c', 'Rotate logs by date', 'runtime-tools', 'queued', 'Queue #2'),
      r('d', 'Tighten the verb column', 'design-system', 'queued', 'Queue #3'), r('e', 'Clean up MCP processes', 'runtime-tools', 'queued', 'Queue #4')] },
    { at: '13:10', line: "Nobody's watching the terminal.", rows: [
      r('a', 'Rebuild the color tokens', 'Quuu', 'review', 'Succeeded · 12:06'), r('b', 'Restructure the site TOC', 'docs-site', 'review', 'Succeeded · 10:41'),
      r('c', 'Rotate logs by date', 'runtime-tools', 'running', '<span class="c-blue">Running 1h 12m</span>'),
      r('d', 'Tighten the verb column', 'design-system', 'running', '<span class="c-blue">Running 28m</span>'), r('e', 'Clean up MCP processes', 'runtime-tools', 'queued', 'Queue #1')] },
    { at: '19:30', line: 'Review after dinner. Or tomorrow.', rows: [
      r('a', 'Rebuild the color tokens', 'Quuu', 'review', 'Succeeded · 12:06'), r('b', 'Restructure the site TOC', 'docs-site', 'review', 'Succeeded · 10:41'),
      r('c', 'Rotate logs by date', 'runtime-tools', 'review', 'Succeeded · 14:20'), r('d', 'Tighten the verb column', 'design-system', 'review', 'Succeeded · 15:02'),
      r('e', 'Clean up MCP processes', 'runtime-tools', 'running', '<span class="c-blue">Running 34m</span>')] },
  ]
  let last = -1
  return (p) => {
    const f = [1 - span(p, 0.28, 0.38), Math.min(span(p, 0.28, 0.38), 1 - span(p, 0.62, 0.72)), span(p, 0.62, 0.72)]
    imgs.forEach((img, i) => { img.style.setProperty('--o', f[i].toFixed(3)); img.style.setProperty('--s', (1.12 - p * 0.1).toFixed(4)) })
    const idx = p < 0.33 ? 0 : p < 0.67 ? 1 : 2
    if (idx === last) return
    last = idx
    const ph = phases[idx]
    timeEl.textContent = ph.at
    line.textContent = ph.line
    list(ph.rows)
    allEl.textContent = ph.rows.length
    revEl.textContent = ph.rows.filter((x) => x.status === 'review').length
  }
})()

/* ── Layout cache (offsets ignore transforms, so caching is stable) ── */
const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y }
let pins = [], reveals = [], parallax = []
const measure = () => {
  pins = $$('[data-pin]').map((el) => ({ el, name: el.dataset.pin, top: docTop(el), h: el.offsetHeight }))
  reveals = $$('[data-reveal]').map((el) => ({ el, top: docTop(el) }))
  parallax = $$('[data-parallax]').map((el) => ({ el, img: $('img', el), top: docTop(el), h: el.offsetHeight }))
}
measure()
addEventListener('resize', measure)
addEventListener('load', measure)

/* ── Pointer-driven pieces ── */
const heroWin = $('[data-hero-win]')
const tilts = $$('[data-tilt]').map((el) => ({ el, rx: 0, ry: 0 }))
const magnets = $$('[data-magnet]').map((el) => ({ el, x: 0, y: 0 }))
for (const tile of $$('.tile')) {
  tile.addEventListener('pointermove', (e) => {
    const r = tile.getBoundingClientRect()
    tile.style.setProperty('--mx', `${e.clientX - r.left}px`)
    tile.style.setProperty('--my', `${e.clientY - r.top}px`)
  })
  tile.addEventListener('pointerleave', () => { tile.style.setProperty('--mx', '-500px'); tile.style.setProperty('--my', '-500px') })
}
const lens = (() => {
  const el = $('[data-lens]')
  const st = { x: 0.3, y: 0.4, tx: 0.3, ty: 0.4, r: 0, over: false }
  el.addEventListener('pointerenter', () => { st.over = true })
  el.addEventListener('pointerleave', () => { st.over = false })
  el.addEventListener('pointermove', (e) => {
    const b = el.getBoundingClientRect()
    st.tx = (e.clientX - b.left) / b.width; st.ty = (e.clientY - b.top) / b.height
  })
  return (t, visible) => {
    if (!st.over) { st.tx = 0.5 + Math.sin(t / 2600) * 0.32; st.ty = 0.5 + Math.sin(t / 1900) * 0.28 }
    st.x = lerp(st.x, st.tx, st.over ? 0.22 : 0.06); st.y = lerp(st.y, st.ty, st.over ? 0.22 : 0.06)
    const w = el.clientWidth
    st.r = lerp(st.r, visible * (st.over ? 0.2 : 0.15) * w, 0.1)
    el.style.setProperty('--lx', `${(st.x * 100).toFixed(2)}%`)
    el.style.setProperty('--ly', `${(st.y * 100).toFixed(2)}%`)
    el.style.setProperty('--r', `${st.r.toFixed(1)}px`)
  }
})()

/* ── Nav ── */
const nav = $('[data-nav]')
let lastY = scrollY
addEventListener('scroll', () => {
  const y = scrollY
  if (y > lastY + 6 && y > 400) nav.dataset.hidden = 'true'
  else if (y < lastY - 6 || y < 400) nav.dataset.hidden = 'false'
  lastY = y
}, { passive: true })

/* ── The loop ── */
let sy = scrollY
let frame = 0
const scenes = {
  hero: (p, el) => {
    el.style.setProperty('--p', clamp(p / 0.42).toFixed(4))
    heroWin.style.setProperty('--e', easeOut(clamp(p / 0.52)).toFixed(4))
    heroWin.style.setProperty('--hp', p.toFixed(4))
  },
  why: (p) => {
    const lit = Math.round(span(p, 0.04, 0.82) * whyWords.length)
    whyWords.forEach((w, i) => w.classList.toggle('on', i < lit))
  },
  day: (p) => day(p),
  rule: (p, el) => {
    const svg = $('[data-machine]', el)
    $$('.m-lines path', svg).forEach((path, i) => path.style.setProperty('--d', easeOut(span(p, 0.1 + i * 0.06, 0.3 + i * 0.06)).toFixed(3)))
    $$('.m-nodes > g', svg).forEach((g, i) => g.style.setProperty('--o', easeOut(span(p, 0.02 + i * 0.05, 0.14 + i * 0.05)).toFixed(3)))
    $('.m-human', svg).style.setProperty('--d', easeOut(span(p, 0.5, 0.72)).toFixed(3))
    $('.m-done', svg).style.setProperty('--o', easeOut(span(p, 0.62, 0.78)).toFixed(3))
    $('.m-you', svg).style.opacity = span(p, 0.62, 0.78)
  },
  agents: (p) => agents(p),
  restart: (p) => restart(p),
  wall: (p) => wall(p),
  end: (p, el) => { $('[data-end-icon]', el).style.setProperty('--s', (0.72 + 0.28 * easeOut(span(p, 0, 0.55))).toFixed(4)) },
}
for (const path of $$('[data-machine] path')) path.style.setProperty('--len', Math.ceil(path.getTotalLength()))

function tick(t) {
  frame++
  const vh = innerHeight
  const target = scrollY
  sy = reduced ? target : Math.abs(target - sy) < 0.5 ? target : lerp(sy, target, 0.16)
  ptr.sx = lerp(ptr.sx, ptr.x, 0.12); ptr.sy = lerp(ptr.sy, ptr.y, 0.12)
  root.style.setProperty('--cx', `${ptr.sx.toFixed(1)}px`)
  root.style.setProperty('--cy', `${ptr.sy.toFixed(1)}px`)

  for (const pin of pins) {
    const p = reduced ? 1 : clamp((sy - pin.top) / Math.max(1, pin.h - vh))
    if (sy + vh < pin.top - vh * 0.5 || sy > pin.top + pin.h + vh * 0.5) continue
    scenes[pin.name]?.(p, pin.el)
  }
  for (const r of reveals) {
    const rv = reduced ? 1 : easeOut(clamp((sy + vh - r.top) / (vh * 0.4)))
    r.el.style.setProperty('--rv', rv.toFixed(3))
  }
  for (const px of parallax) {
    const c = (px.top + px.h / 2 - sy - vh / 2) / vh
    px.img.style.setProperty('--py', `${(-30 + c * -90).toFixed(1)}px`)
  }

  // Tilt toward the pointer; the hero window only once it has settled flat.
  for (const tl of tilts) {
    const b = tl.el.getBoundingClientRect()
    if (b.bottom < 0 || b.top > vh) continue
    const nx = fine ? clamp((ptr.sx - (b.left + b.width / 2)) / (b.width / 2), -1, 1) : 0
    const ny = fine ? clamp((ptr.sy - (b.top + b.height / 2)) / (b.height / 2), -1, 1) : 0
    const k = tl.el === heroWin ? 2.2 : 7
    tl.rx = lerp(tl.rx, -ny * k, 0.08); tl.ry = lerp(tl.ry, nx * k, 0.08)
    tl.el.style.setProperty('--rx', `${tl.rx.toFixed(2)}deg`)
    tl.el.style.setProperty('--ry', `${tl.ry.toFixed(2)}deg`)
    if (tl.el === heroWin) {
      tl.el.style.setProperty('--gx', `${(((ptr.sx - b.left) / b.width) * 100).toFixed(1)}%`)
      tl.el.style.setProperty('--gy', `${(((ptr.sy - b.top) / b.height) * 100).toFixed(1)}%`)
    }
  }
  // Magnetic buttons: pulled a little toward the pointer when it is close.
  for (const m of magnets) {
    const b = m.el.getBoundingClientRect()
    const dx = ptr.sx - (b.left + b.width / 2), dy = ptr.sy - (b.top + b.height / 2)
    const near = fine && Math.abs(dx) < b.width / 2 + 40 && Math.abs(dy) < b.height / 2 + 30
    m.x = lerp(m.x, near ? dx * 0.22 : 0, 0.18); m.y = lerp(m.y, near ? dy * 0.3 : 0, 0.18)
    m.el.style.setProperty('--mx', `${m.x.toFixed(2)}px`); m.el.style.setProperty('--my', `${m.y.toFixed(2)}px`)
  }

  const lensEl = $('[data-lens]')
  const lb = lensEl.getBoundingClientRect()
  if (lb.bottom > 0 && lb.top < vh) lens(t, easeOut(clamp((vh - lb.top) / (vh * 0.7))))

  if (!reduced && frame % 2 === 0) ambient(t, sy / Math.max(1, document.body.scrollHeight - vh))
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
