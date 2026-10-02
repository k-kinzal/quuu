import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 1000, webPreferences: { sandbox: true, backgroundThrottling: false } })
  try {
    window.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    await window.loadURL(process.argv[2])
    // Exercise native focus selectors without taking the user's foreground window.
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    const messages = []
    for (const scheme of ['dark', 'light']) {
      for (const density of ['compact', 'comfortable']) {
        messages.push(await window.webContents.executeJavaScript(`window.checkControls('${scheme}', '${density}')`))
        const hovered = []
        for (const name of ['search', 'filter', 'text', 'search-disabled', 'filter-disabled', 'text-disabled']) {
          window.webContents.sendInputEvent({ type: 'mouseMove', x: 1199, y: 999 })
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
      }
    }
    console.log(JSON.stringify({ passed: messages }))
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
