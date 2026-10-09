import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 1000, webPreferences: { sandbox: true, backgroundThrottling: false } })
  let currentCheck = 'loading'
  try {
    window.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    await window.loadURL(process.argv[2])
    // Exercise native focus selectors without taking the user's foreground window.
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    // Keep the recent native focus history for failures that only reproduce on a runner.
    await window.webContents.executeJavaScript(`(() => {
      window.focusTrace = []
      const record = entry => {
        window.focusTrace.push({ time: performance.now(), ...entry })
        if (window.focusTrace.length > 40) window.focusTrace.shift()
      }
      for (const type of ['focusin', 'focusout']) {
        document.addEventListener(type, event => record({ type, target: event.target.outerHTML?.slice(0, 500) }))
      }
    })()`)
    // Input acknowledgements keep keyboard focus and hover ordering deterministic under load.
    const input = async event => {
      if (event.type.startsWith('key')) {
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: event.type, key: event.keyCode, code: event.keyCode,
          ...(event.keyCode === 'Enter' && event.type === 'keyDown' ? { text: '\r' } : {}),
          windowsVirtualKeyCode: { Tab: 9, Escape: 27, Home: 36, Enter: 13 }[event.keyCode]
        })
      } else {
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' }[event.type],
          x: event.x, y: event.y, button: event.button ?? 'none', clickCount: event.clickCount ?? 0
        })
      }
    }
    const waitForTooltip = async title => {
      const check = `window.checkTooltip(${JSON.stringify(title)})`
      const deadline = Date.now() + 5000
      // MUI shows successive names immediately; wait for the actual layout instead of sleeping per control.
      while (Date.now() < deadline) {
        if (await window.webContents.executeJavaScript(`(() => { try { ${check}; return true } catch { return false } })()`)) return
        await setTimeout(30)
      }
      await window.webContents.executeJavaScript(check)
    }
    const waitFor = async (condition, message) => {
      const deadline = Date.now() + 5000
      while (!await window.webContents.executeJavaScript(condition)) {
        if (Date.now() >= deadline) throw new Error(message)
        await setTimeout(30)
      }
    }
    const closeMenu = async () => {
      // Menu focus is assigned after its measured position is committed.
      await waitFor(`Boolean(document.querySelector('[role="menu"]')?.contains(document.activeElement))`, 'menu receives keyboard focus')
      await input({ type: 'keyDown', keyCode: 'Escape' })
      await input({ type: 'keyUp', keyCode: 'Escape' })
      await waitFor(`document.querySelectorAll('[role="menu"]').length === 0`, 'Escape closes the menu')
    }
    const messages = []
    for (const scheme of ['dark', 'light']) {
      for (const density of ['compact', 'comfortable']) {
        currentCheck = `${scheme}/${density}: control appearance`
        messages.push(await window.webContents.executeJavaScript(`window.checkControls('${scheme}', '${density}')`))
        currentCheck = `${scheme}/${density}: rotating loading icon`
        const readProgress = () => window.webContents.executeJavaScript(`(() => {
          const button = document.querySelector('[data-control="icon-loading"] button')
          const progress = button.querySelector('[role="progressbar"]')
          return { disabled: button.disabled, named: progress.getAttribute('aria-labelledby') === button.id,
            opacity: getComputedStyle(button).opacity, transform: getComputedStyle(progress).transform,
            running: progress.getAnimations().some(animation => animation.playState === 'running') }
        })()`)
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
        })
        const progress = await readProgress()
        assert.equal(progress.disabled, true, 'loading prevents another press')
        assert.equal(progress.named, true, 'progress has the action name')
        assert.equal(progress.opacity, '1', 'progress is not dimmed as unavailable')
        assert.equal(progress.running, true, 'loading icon animates')
        await setTimeout(80)
        assert.notEqual((await readProgress()).transform, progress.transform, 'loading icon actually rotates')
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        })
        assert.equal((await readProgress()).running, false, 'reduced motion stops rotation')
        await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
        messages.push(`${scheme}/${density}: rotating loading icon passed`)
        const hovered = []
        for (const name of ['search', 'filter', 'text', 'search-disabled', 'filter-disabled', 'text-disabled']) {
          await input({ type: 'mouseMove', x: -1, y: -1 })
          const before = await window.webContents.executeJavaScript(`window.prepareHover('${name}')`)
          // Let focus/hover transitions finish before comparing the steady state.
          await setTimeout(150)
          const baseline = await window.webContents.executeJavaScript(`window.readHover('${name}')`)
          await input({ type: 'mouseMove', x: before.x, y: before.y })
          await setTimeout(150)
          const after = await window.webContents.executeJavaScript(`window.readHover('${name}')`)
          if (name.endsWith('-disabled')) assert.deepEqual(after, baseline, `${name}: disabled hover`)
          else hovered.push(after)
        }
        assert.deepEqual(hovered[0], hovered[1], 'search and filter hover share a frame')
        assert.deepEqual(hovered[0], hovered[2], 'search and text entry hover share a frame')

        const cases = await window.webContents.executeJavaScript(`window.renderTooltips('${scheme}', '${density}')`)
        for (const [name, title] of cases) {
          currentCheck = `${scheme}/${density}: hover ${name}`
          await input({ type: 'mouseMove', x: -1, y: -1 })
          const point = await window.webContents.executeJavaScript(`window.prepareTooltip('${name}')`)
          await input({ type: 'mouseMove', ...point })
          await waitForTooltip(title)
        }
        // Keyboard focus uses the same visible name, independent of hover or native titles.
        for (const [name, title] of cases.filter(([name]) => !name.includes('disabled'))) {
          currentCheck = `${scheme}/${density}: focus ${name}`
          // Stay outside the viewport while scrolling, independent of the specimen's layout.
          await input({ type: 'mouseMove', x: -1, y: -1 })
          await window.webContents.executeJavaScript(`window.prepareTooltip('${name}')`)
          await input({ type: 'keyDown', keyCode: 'Tab' })
          await input({ type: 'keyUp', keyCode: 'Tab' })
          await window.webContents.executeJavaScript(`window.focusTooltip('${name}')`)
          await waitForTooltip(title)
          await input({ type: 'keyDown', keyCode: 'Escape' })
          await input({ type: 'keyUp', keyCode: 'Escape' })
          await waitFor(`document.querySelectorAll('[role="tooltip"]').length === 0`, 'Escape dismisses the name')
        }
        // Clicking before the enter delay must not leave a delayed bubble over the menu.
        currentCheck = `${scheme}/${density}: pending tooltip activation`
        await input({ type: 'mouseMove', x: -1, y: -1 })
        await setTimeout(900) // Let MUI's immediate-next-tooltip window expire.
        const menuPoint = await window.webContents.executeJavaScript(`window.prepareTooltip('menu')`)
        await input({ type: 'mouseMove', ...menuPoint })
        await input({ type: 'mouseDown', button: 'left', clickCount: 1, ...menuPoint })
        await input({ type: 'mouseUp', button: 'left', clickCount: 1, ...menuPoint })
        await setTimeout(600)
        assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="menu"]').length`), 1, 'menu opens')
        assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="tooltip"]').length`), 0, 'activation cancels the pending tooltip')
        await closeMenu()
        currentCheck = `${scheme}/${density}: visible tooltip activation`
        await input({ type: 'mouseMove', x: -1, y: -1 })
        const visiblePoint = await window.webContents.executeJavaScript(`window.prepareTooltip('menu')`)
        await input({ type: 'mouseMove', ...visiblePoint })
        await waitForTooltip('More actions')
        await input({ type: 'mouseDown', button: 'left', clickCount: 1, ...visiblePoint })
        await input({ type: 'mouseUp', button: 'left', clickCount: 1, ...visiblePoint })
        await waitFor(`document.querySelectorAll('[role="tooltip"]').length === 0`, 'activation also removes an already visible tooltip')
        await closeMenu()
        messages.push(`${scheme}/${density}: icon names on hover/focus and activation dismissal passed`)
      }
    }
    for (const scheme of ['dark', 'light']) {
      currentCheck = `${scheme}: conversation layout`
      await window.webContents.executeJavaScript(`window.renderMessages(1000, '${scheme}')`)
      const wide = await window.webContents.executeJavaScript('window.messageGeometry()')
      assert.equal(wide.channelVisible, true)
      assert.ok(wide.thread > 360, 'a thread keeps a readable text column')
      assert.equal(wide.overflow, false)
      await window.webContents.executeJavaScript(`window.renderMessages(360, '${scheme}')`)
      const narrow = await window.webContents.executeJavaScript('window.messageGeometry()')
      assert.equal(narrow.channelVisible, false, 'narrow layouts focus the opened thread')
      assert.equal(narrow.thread, 360)
      assert.equal(narrow.overflow, false)
      assert.equal(narrow.unreadable, false)
      const action = await window.webContents.executeJavaScript(`(() => {
        const el = [...document.querySelectorAll('[data-conversation-thread] button')].find(el => el.textContent === 'Add to list')
        return { visible: el.checkVisibility(), inDisclosure: Boolean(el.closest('details')) }
      })()`)
      assert.equal(action.visible, true, 'attachment actions remain visible while details are collapsed')
      assert.equal(action.inDisclosure, false, 'an action cannot toggle the disclosure')
      // The attachment action is also usable without opening its supporting detail.
      await window.webContents.executeJavaScript(`(() => {
        const el = [...document.querySelectorAll('[data-conversation-thread] button')].find(el => el.textContent === 'Add to list')
        el.focus()
      })()`)
      await input({ type: 'keyDown', keyCode: 'Enter' })
      await input({ type: 'keyUp', keyCode: 'Enter' })
      await waitFor(`Boolean([...document.querySelectorAll('[data-conversation-thread] button')].find(el => el.textContent === 'Open list'))`, 'keyboard activation exposes the completion action')
      const completed = await window.webContents.executeJavaScript(`(() => {
        const action = [...document.querySelectorAll('[data-conversation-thread] button')].find(el => el.textContent === 'Open list')
        const status = action.previousElementSibling
        return { actionSize: getComputedStyle(action).fontSize, statusSize: getComputedStyle(status).fontSize,
          open: document.querySelector('[data-conversation-thread] details').open }
      })()`)
      assert.equal(completed.actionSize, completed.statusSize, 'completed status and navigation share a type scale')
      assert.equal(completed.open, false, 'activation leaves the disclosure collapsed')
      const summary = await window.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('[data-conversation-thread] summary')
        const bounds = el.getBoundingClientRect()
        return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) }
      })()`)
      await input({ type: 'mouseDown', button: 'left', clickCount: 1, ...summary })
      await input({ type: 'mouseUp', button: 'left', clickCount: 1, ...summary })
      await waitFor(`document.querySelector('[data-conversation-thread] details').open`, 'attachment expands in place')
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close thread"]').click()`)
      await waitFor(`window.messageGeometry().channelVisible && window.messageGeometry().thread === 0`, 'closing returns to the channel')
      // Unmount so the next scheme opens a fresh thread.
      await window.webContents.executeJavaScript('window.clearSpecimen()')
      messages.push(`${scheme}: conversation layout and attachment passed`)
    }
    for (const scheme of ['dark', 'light']) {
      currentCheck = `${scheme}: explorer resizing`
      const waitForWidth = (width, message) => waitFor(`window.explorerGeometry().width === ${width}`, message)
      const render = async (width, explorerWidth) => {
        await window.webContents.executeJavaScript(`window.renderExplorer(${width}, '${scheme}')`)
        // ResizeObserver, React and the resolved CSS width settle in separate updates.
        await waitForWidth(explorerWidth, `explorer settles at ${explorerWidth}px inside ${width}px`)
      }
      const geometry = () => window.webContents.executeJavaScript('window.explorerGeometry()')
      const drag = async (delta, width) => {
        const point = await geometry()
        // Start on the enlarged target, not on the single painted pixel.
        const x = point.x + 2
        await input({ type: 'mouseDown', button: 'left', clickCount: 1, x, y: point.y })
        await setTimeout(30)
        await input({ type: 'mouseMove', x: x + delta, y: point.y })
        await setTimeout(30)
        await input({ type: 'mouseUp', button: 'left', clickCount: 1, x: x + delta, y: point.y })
        await waitForWidth(width, `drag settles at ${width}px`)
      }
      await render(720, 256)
      await drag(100, 356)
      assert.equal((await geometry()).width, 356, 'dragging grows the explorer')
      await render(360, 199)
      let narrow = await geometry()
      assert.equal(narrow.width, 199, 'nested layout preserves room for selected content')
      assert.equal(narrow.content, 160)
      assert.equal(narrow.value, narrow.width, 'accessible value reports the displayed width')
      assert.equal(narrow.overflow, false)
      await render(720, 356)
      assert.equal((await geometry()).width, 356, 'window shrink preserves the preferred width')
      await render(360, 199)
      await drag(-40, 159)
      narrow = await geometry()
      assert.equal(narrow.width, 159, 'constrained dragging begins at the visible boundary')
      await window.webContents.executeJavaScript('document.querySelector("[role=separator]").focus()')
      await input({ type: 'keyDown', keyCode: 'Home' })
      await input({ type: 'keyUp', keyCode: 'Home' })
      await waitForWidth(120, 'Home reaches the narrow explorer width')
      assert.equal((await geometry()).width, 120, 'keyboard reaches the narrow explorer width')
      // Leave the specimen unmounted so the next scheme starts with a fresh preference.
      await window.webContents.executeJavaScript(`window.checkControls('${scheme}', 'compact')`)
      messages.push(`${scheme}: explorer pointer, keyboard and constrained geometry passed`)
    }
    console.log(JSON.stringify({ passed: messages }))
    app.exit(0)
  } catch (error) {
    console.error(currentCheck, error)
    if (currentCheck.includes('explorer resizing')) {
      console.error('Explorer geometry', await window.webContents.executeJavaScript('window.explorerGeometry()').catch(() => 'Renderer unavailable'))
    }
    try {
      await window.webContents.debugger.sendCommand('DOM.enable')
      await window.webContents.debugger.sendCommand('CSS.enable')
      const { root } = await window.webContents.debugger.sendCommand('DOM.getDocument')
      const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: ':focus' })
      const { matchedCSSRules } = await window.webContents.debugger.sendCommand('CSS.getMatchedStylesForNode', { nodeId })
      console.error('Outline cascade', JSON.stringify(matchedCSSRules.map(({ rule }) => ({
        origin: rule.origin, selector: rule.selectorList.text,
        properties: rule.style.cssProperties.filter(property => property.name.startsWith('outline') || property.name === 'all')
      })).filter(rule => rule.properties.length)))
    } catch (diagnosticError) {
      console.error('CSS diagnostics unavailable', diagnosticError)
    }
    console.error('Focus state', await window.webContents.executeJavaScript(`JSON.stringify({
      documentFocused: document.hasFocus(), active: document.activeElement?.outerHTML,
      focused: document.activeElement?.matches(':focus'), focusVisible: document.activeElement?.matches(':focus-visible'),
      trace: window.focusTrace,
      menus: Array.from(document.querySelectorAll('[role="menu"]')).map(menu => ({
        html: menu.outerHTML, visibility: getComputedStyle(menu).visibility,
        display: getComputedStyle(menu).display, bounds: menu.getBoundingClientRect().toJSON(),
        animations: menu.getAnimations().map(animation => ({playState: animation.playState, currentTime: animation.currentTime}))
      }))
    })`).catch(() => 'Renderer unavailable'))
    app.exit(1)
  }
})
