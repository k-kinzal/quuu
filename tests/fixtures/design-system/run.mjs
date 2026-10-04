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
    // Input acknowledgements keep keyboard focus and hover ordering deterministic under load.
    const input = async event => {
      if (event.type.startsWith('key')) {
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
          type: event.type, key: event.keyCode, code: event.keyCode,
          windowsVirtualKeyCode: { Tab: 9, Escape: 27, Home: 36 }[event.keyCode]
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
      currentCheck = `${scheme}: explorer resizing`
      const render = width => window.webContents.executeJavaScript(`window.renderExplorer(${width}, '${scheme}')`)
      const geometry = () => window.webContents.executeJavaScript('window.explorerGeometry()')
      const drag = async delta => {
        const point = await geometry()
        // Start on the enlarged target, not on the single painted pixel.
        const x = point.x + 2
        await input({ type: 'mouseDown', button: 'left', clickCount: 1, x, y: point.y })
        await setTimeout(30)
        await input({ type: 'mouseMove', x: x + delta, y: point.y })
        await setTimeout(30)
        await input({ type: 'mouseUp', button: 'left', clickCount: 1, x: x + delta, y: point.y })
        await setTimeout(30)
      }
      await render(720)
      await drag(100)
      assert.equal((await geometry()).width, 356, 'dragging grows the explorer')
      await render(360)
      let narrow = await geometry()
      assert.equal(narrow.width, 199, 'nested layout preserves room for selected content')
      assert.equal(narrow.content, 160)
      assert.equal(narrow.value, narrow.width, 'accessible value reports the displayed width')
      assert.equal(narrow.overflow, false)
      await render(720)
      assert.equal((await geometry()).width, 356, 'window shrink preserves the preferred width')
      await render(360)
      await drag(-40)
      narrow = await geometry()
      assert.equal(narrow.width, 159, 'constrained dragging begins at the visible boundary')
      await window.webContents.executeJavaScript('document.querySelector("[role=separator]").focus()')
      await input({ type: 'keyDown', keyCode: 'Home' })
      await input({ type: 'keyUp', keyCode: 'Home' })
      await setTimeout(30)
      assert.equal((await geometry()).width, 120, 'keyboard reaches the narrow explorer width')
      // Leave the specimen unmounted so the next scheme starts with a fresh preference.
      await window.webContents.executeJavaScript(`window.checkControls('${scheme}', 'compact')`)
      messages.push(`${scheme}: explorer pointer, keyboard and constrained geometry passed`)
    }
    console.log(JSON.stringify({ passed: messages }))
    app.exit(0)
  } catch (error) {
    console.error(currentCheck, error)
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
      focused: document.activeElement?.matches(':focus'), focusVisible: document.activeElement?.matches(':focus-visible')
    })`).catch(() => 'Renderer unavailable'))
    app.exit(1)
  }
})
