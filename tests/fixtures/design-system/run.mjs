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
    const messages = []
    for (const scheme of ['dark', 'light']) {
      for (const density of ['compact', 'comfortable']) {
        messages.push(await window.webContents.executeJavaScript(`window.checkControls('${scheme}', '${density}')`))
        const hovered = []
        for (const name of ['search', 'filter', 'text', 'search-disabled', 'filter-disabled', 'text-disabled']) {
          window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
          const before = await window.webContents.executeJavaScript(`window.prepareHover('${name}')`)
          // Let focus/hover transitions finish before comparing the steady state.
          await setTimeout(150)
          const baseline = await window.webContents.executeJavaScript(`window.readHover('${name}')`)
          window.webContents.sendInputEvent({ type: 'mouseMove', x: before.x, y: before.y })
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
          window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
          const point = await window.webContents.executeJavaScript(`window.prepareTooltip('${name}')`)
          window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
          await waitForTooltip(title)
        }
        // Keyboard focus uses the same visible name, independent of hover or native titles.
        for (const [name, title] of cases.filter(([name]) => !name.includes('disabled'))) {
          currentCheck = `${scheme}/${density}: focus ${name}`
          window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
          await window.webContents.executeJavaScript(`window.prepareTooltip('${name}'); window.tooltipTarget('${name}').focus()`)
          await waitForTooltip(title)
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
          await setTimeout(30)
          assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="tooltip"]').length`), 0, 'Escape dismisses the name')
        }
        // Clicking before the enter delay must not leave a delayed bubble over the menu.
        window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
        await setTimeout(900) // Let MUI's immediate-next-tooltip window expire.
        const menuPoint = await window.webContents.executeJavaScript(`window.prepareTooltip('menu')`)
        window.webContents.sendInputEvent({ type: 'mouseMove', ...menuPoint })
        window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...menuPoint })
        window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...menuPoint })
        await setTimeout(600)
        assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="menu"]').length`), 1, 'menu opens')
        assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="tooltip"]').length`), 0, 'activation cancels the pending tooltip')
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
        const visiblePoint = await window.webContents.executeJavaScript(`window.prepareTooltip('menu')`)
        window.webContents.sendInputEvent({ type: 'mouseMove', ...visiblePoint })
        await waitForTooltip('More actions')
        window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...visiblePoint })
        window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...visiblePoint })
        await setTimeout(30)
        assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('[role="tooltip"]').length`), 0, 'activation also removes an already visible tooltip')
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        messages.push(`${scheme}/${density}: icon names on hover/focus and activation dismissal passed`)
      }
    }
    console.log(JSON.stringify({ passed: messages }))
    app.exit(0)
  } catch (error) {
    console.error(currentCheck, error)
    app.exit(1)
  }
})
