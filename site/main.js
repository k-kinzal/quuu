// Quuu product page — motion and the live queue.
// No dependencies. Everything degrades to a static, readable page.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const pick = (a) => a[Math.floor(Math.random() * a.length)]

/* ── Nav: tone follows the surface beneath it, hides while reading down ── */
{
  const nav = $('[data-nav]')
  const darks = $$('.product, .flow, .cta, .footer')
  let lastY = scrollY
  const update = () => {
    const y = scrollY
    const probe = nav.getBoundingClientRect().bottom - 10
    const overDark = darks.some((el) => {
      const r = el.getBoundingClientRect()
      return r.top < probe && r.bottom > probe
    })
    nav.dataset.tone = overDark ? 'dark' : 'light'
    nav.dataset.hidden = String(y > 600 && y > lastY + 4)
    if (y < lastY - 4 || y < 600) nav.dataset.hidden = 'false'
    lastY = y
  }
  addEventListener('scroll', update, { passive: true })
  update()
}

/* ── Hero: the mark leans toward the pointer; the running clock ticks ── */
{
  const stage = $('[data-tilt]')
  if (stage && !reduced && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5
      const y = e.clientY / innerHeight - 0.5
      stage.style.setProperty('--tx', `${(-x * 14).toFixed(2)}px`)
      stage.style.setProperty('--ty', `${(-y * 10).toFixed(2)}px`)
    }, { passive: true })
  }
  const clock = $('[data-clock]')
  let s = 14 * 60 + 57
  setInterval(() => {
    s++
    if (clock) clock.textContent = `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  }, 1000)

  // The hero status bar breathes like a real scheduler would.
  const q = $('[data-count="queued"]')
  const rv = $('[data-count="review"]')
  let queued = 7
  let review = 4
  setInterval(() => {
    if (Math.random() < 0.5 && queued > 2) { queued--; review++ } else if (queued < 9) queued++
    if (review > 6) review = 3
    q.textContent = queued
    rv.textContent = review
  }, 3200)
}

/* ── Manifesto: words light up as you read ── */
const words = $$('[data-words]').map((p) => {
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment()
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue
          if (/^\s+$/.test(part)) { frag.append(' '); continue }
          const span = document.createElement('span')
          span.className = 'w'
          span.textContent = part
          frag.append(span)
        }
        child.replaceWith(frag)
      } else if (child.nodeType === 1) {
        wrap(child)
      }
    }
  }
  wrap(p)
  return { p, spans: $$('.w', p) }
})

/* ── Scroll-linked effects, one rAF loop ── */
{
  const win = $('[data-scale]')
  const moments = $$('[data-parallax]')
  let ticking = false
  const frame = () => {
    ticking = false
    const vh = innerHeight
    for (const { p, spans } of words) {
      const r = p.getBoundingClientRect()
      const t = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3))
      const lit = Math.round(t * spans.length)
      spans.forEach((s, i) => s.classList.toggle('on', i < lit))
    }
    if (win && !reduced) {
      const r = win.getBoundingClientRect()
      const t = clamp((vh - r.top) / (vh * 0.9))
      const e = 1 - Math.pow(1 - t, 3)
      win.style.setProperty('--rx', `${(1 - e) * 22}deg`)
      win.style.setProperty('--s', (0.86 + e * 0.14).toFixed(4))
    }
    for (const m of moments) {
      const r = m.getBoundingClientRect()
      const t = (r.top + r.height / 2 - vh / 2) / vh
      const img = $('img', m)
      img.style.setProperty('--py', `${(-8 + t * 100 * Number(m.dataset.parallax)).toFixed(2)}%`)
    }
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame) } }
  addEventListener('scroll', request, { passive: true })
  addEventListener('resize', request)
  frame()
}

/* ── Reveal on enter ── */
{
  const targets = $$([
    '.manifesto .eyebrow', '.product__head', '.flow__head', '.privilege > .eyebrow', '.privilege__title',
    '.privilege__body', '.agents__head', '.fallback__copy', '.chain', '.features__head', '.tile',
    '.day__head', '.moment', '.phone-sec__copy', '.phone', '.note__card', '.cta__title', '.cta__buttons', '.steps',
  ].join(','))
  for (const el of targets) {
    el.classList.add('reveal')
    if (el.classList.contains('tile') || el.classList.contains('moment')) {
      const i = [...el.parentElement.children].indexOf(el)
      el.style.setProperty('--rd', `${(i % 3) * 0.08}s`)
    }
  }
  // The statechart draws its own lines; measure them first.
  for (const path of $$('[data-draw] path')) {
    path.style.setProperty('--len', String(Math.ceil(path.getTotalLength())))
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 })
  for (const el of [...targets, ...$$('[data-draw], .window')]) io.observe(el)
}

/* ── Bento spotlight ── */
for (const tile of $$('.tile')) {
  tile.addEventListener('pointermove', (e) => {
    const r = tile.getBoundingClientRect()
    tile.style.setProperty('--mx', `${e.clientX - r.left}px`)
    tile.style.setProperty('--my', `${e.clientY - r.top}px`)
  })
}

/* ── Fallback chain: Fable → Opus → Codex, over and over ── */
{
  const items = $$('[data-chain] li')
  const states = [
    ['Running · session 7f3a', '', ''],
    ['Limit · weekly', 'Running · same session', ''],
    ['Limit · weekly', 'Limit · resets 3pm', 'Running · same session'],
  ]
  let step = 2
  const show = () => {
    const row = states[step]
    items.forEach((li, i) => {
      const st = $('.chain__state', li)
      const label = row[i]
      li.classList.toggle('is-active', label.startsWith('Running'))
      li.classList.toggle('is-limited', label.startsWith('Limit'))
      st.className = `chain__state state ${label.startsWith('Running') ? 'state--running' : label ? 'state--limit' : ''}`
      st.innerHTML = label ? `<i></i>${label}` : '<span class="muted">standing by</span>'
    })
  }
  if (!reduced) setInterval(() => { step = (step + 1) % states.length; show() }, 2600)
}

/* ── The live queue ── */
{
  const board = $('[data-board]')
  const lanes = Object.fromEntries($$('[data-lane]', board).map((l) => [l.dataset.lane, l]))
  const log = $('[data-log]', board)
  const hint = $('[data-done-hint]', board)
  const pauseBtn = $('[data-pause]', board)
  const pauseLabel = $('[data-pause-label]', board)
  const conc = $('[data-concurrency]', board)
  const concOut = $('[data-concurrency-out]', board)

  const projects = {
    Quuu: '#3D6BFF', 'design-system': '#2FA36B', 'runtime-tools': '#E8962E',
    'docs-site': '#9A6CFF', 'metrics-pipeline': '#E5484D',
  }
  const pool = [
    ['Rebuild the color tokens in OKLCH', 'Quuu'],
    ['Restructure the site TOC by section', 'docs-site'],
    ['Rotate logs by date', 'runtime-tools'],
    ['Tighten the tool-row verb column spacing', 'design-system'],
    ['Reliably clean up MCP server grandchildren', 'runtime-tools'],
    ['Read the trial-run logs and list the failures', 'metrics-pipeline'],
    ['Generate the API reference in CI', 'docs-site'],
    ['Group components by category in Storybook', 'design-system'],
    ['Release the run slot when the pid is gone', 'Quuu'],
    ['Recover the chat from a long launch', 'Quuu'],
    ['Backfill last week of ingestion metrics', 'metrics-pipeline'],
    ['Reorganize the writing conventions', 'design-system'],
    ['Burn down one issue', 'runtime-tools'],
    ['Clear PR review comments', 'Quuu'],
    ['Add dark-mode screenshots to the guide', 'docs-site'],
    ['Detect cycles when adding a predecessor', 'Quuu'],
  ]
  const agents = ['Fable', 'Opus', 'Opus', 'Codex', 'Codex', 'Cursor', 'Grok', 'opencode']
  const chain = { Fable: 'Opus', Opus: 'Codex', Grok: 'Codex', Cursor: 'Opus' }

  let seq = 0
  let cursor = 0
  let doneCount = 0
  let paused = false
  let visible = false
  const tasks = []
  const els = new Map()

  const make = (lane, extra = {}) => {
    const [title, project] = pool[cursor++ % pool.length]
    const t = { id: ++seq, title, project, lane, agent: '', from: '', p: 0, speed: 0.045 + Math.random() * 0.06, ...extra }
    tasks.push(t)
    return t
  }
  for (let i = 0; i < 3; i++) make('running', { agent: pick(agents), p: 0.2 + Math.random() * 0.6 })
  make('review', { agent: 'Codex', from: 'Opus' })
  for (let i = 0; i < 5; i++) make('queued')

  let logTimer
  const say = (msg) => {
    log.textContent = msg
    log.classList.add('show')
    clearTimeout(logTimer)
    logTimer = setTimeout(() => log.classList.remove('show'), 3200)
  }

  const cardFor = (t) => {
    let el = els.get(t.id)
    if (!el) {
      el = document.createElement('article')
      el.className = 'card is-new'
      el.innerHTML = `
        <div class="card__title"></div>
        <div class="card__meta"><span class="pdot"></span><span class="card__project"></span><span class="card__agent"></span><button class="card__done" type="button">✓ Done</button></div>
        <div class="card__bar"><i></i></div>`
      $('.card__done', el).addEventListener('click', () => approve(t.id))
      el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true })
      els.set(t.id, el)
    }
    $('.card__title', el).textContent = t.title
    $('.pdot', el).style.background = projects[t.project]
    $('.card__project', el).textContent = t.project
    const agentEl = $('.card__agent', el)
    agentEl.innerHTML = t.lane === 'queued' ? `#${tasks.filter((x) => x.lane === 'queued').indexOf(t) + 1}`
      : t.from ? `<s>${t.from} →</s> ${t.agent}` : t.agent
    $('.card__bar', el).hidden = t.lane !== 'running'
    $('.card__bar i', el).style.setProperty('--p', t.p.toFixed(3))
    $('.card__done', el).hidden = t.lane !== 'review'
    el.classList.toggle('is-limit', Boolean(t.limitFlash))
    return el
  }

  const render = () => {
    const first = new Map()
    for (const [id, el] of els) first.set(id, el.getBoundingClientRect())

    // Keep the Done lane short; its counter keeps the real total.
    const done = tasks.filter((t) => t.lane === 'done')
    for (const t of done.slice(0, Math.max(0, done.length - 4))) {
      tasks.splice(tasks.indexOf(t), 1)
      els.get(t.id)?.remove()
      els.delete(t.id)
    }

    for (const [name, lane] of Object.entries(lanes)) {
      const list = $('.lane__cards', lane)
      let inLane = tasks.filter((t) => t.lane === name)
      if (name === 'done') inLane = inLane.slice().reverse()
      for (const t of inLane) list.append(cardFor(t))
      $('[data-lane-count]', lane).textContent = name === 'done' ? doneCount : inLane.length
    }
    hint.style.opacity = doneCount ? '0' : '1'

    if (reduced) return
    for (const [id, el] of els) {
      const a = first.get(id)
      if (!a || !el.isConnected) continue
      const b = el.getBoundingClientRect()
      const dx = a.left - b.left
      const dy = a.top - b.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(1.02)` }, { transform: 'none' }],
        { duration: 720, easing: 'cubic-bezier(.2,.7,.1,1)' },
      )
    }
  }

  const approve = (id) => {
    const t = tasks.find((x) => x.id === id)
    if (!t || t.lane !== 'review') return
    t.lane = 'done'
    doneCount++
    // Move it to the end so the newest Done sits on top once reversed.
    tasks.splice(tasks.indexOf(t), 1)
    tasks.push(t)
    say(doneCount === 1 ? 'Done — only you can press that.' : `Done · ${doneCount} approved by a human`)
    render()
  }

  const tick = () => {
    if (paused || !visible || document.hidden) return
    const limit = Number(conc.value)
    for (const t of tasks) {
      t.limitFlash = false
      if (t.lane !== 'running') continue
      if (!t.from && chain[t.agent] && Math.random() < 0.07) {
        t.from = t.agent
        t.agent = chain[t.agent]
        t.limitFlash = true
        say(`Limit on ${t.from} · resets 3pm → continuing on ${t.agent}`)
      }
      t.p = Math.min(1, t.p + t.speed)
      if (t.p >= 1) {
        t.lane = 'review'
        tasks.splice(tasks.indexOf(t), 1)
        tasks.push(t)
      }
    }
    let running = tasks.filter((t) => t.lane === 'running').length
    for (const t of tasks) {
      if (running >= limit) break
      if (t.lane !== 'queued') continue
      t.lane = 'running'
      t.agent = pick(agents)
      t.p = 0.02
      running++
    }
    const queued = tasks.filter((t) => t.lane === 'queued').length
    const review = tasks.filter((t) => t.lane === 'review').length
    if (queued < 2 && review < 4 && Math.random() < 0.35) {
      const t = make('queued')
      say(`Auto-queue · “${t.title}”`)
    }
    if (review >= 4 && running === 0 && queued === 0) say('Everything is waiting for you in Review. Take your time.')
    render()
  }

  pauseBtn.addEventListener('click', () => {
    paused = !paused
    pauseBtn.setAttribute('aria-pressed', String(paused))
    pauseLabel.textContent = paused ? 'Scheduler paused' : 'Scheduler running'
  })
  conc.addEventListener('input', () => { concOut.textContent = conc.value })
  $('[data-add]', board).addEventListener('click', () => {
    const t = make('queued')
    say(`Queued · “${t.title}”`)
    render()
  })

  new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.15 }).observe(board)
  render()
  setInterval(tick, reduced ? 2400 : 1100)
}
