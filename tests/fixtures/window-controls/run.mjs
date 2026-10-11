import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { writeSync } from 'node:fs'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { sandbox: true, backgroundThrottling: false } })
  try {
    window.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    await window.loadURL(process.argv[2])
    // Cover both accessibility settings without changing the host's preferences.
    const motion = process.argv[3]
    assert.ok(['no-preference', 'reduce'].includes(motion), 'motion preference is explicit')
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: motion }]
    })
    assert.equal(await window.webContents.executeJavaScript(`matchMedia('(prefers-reduced-motion: reduce)').matches`), motion === 'reduce')
    const result = await window.webContents.executeJavaScript(`window.checkWindowControls().catch(error => {
      console.error(error.stack)
      throw error
    })`)
    // Electron can quit before a piped console write drains on the CI runner.
    writeSync(1, `${result}\n`)
    window.destroy()
    app.exit(0)
  } catch (error) {
    writeSync(2, `${error.stack ?? error}\n`)
    const layout = await window.webContents.executeJavaScript(`JSON.stringify({
      userAgent: navigator.userAgent,
      headers: [...document.querySelectorAll('header, h1')].map(header => ({
        html: header.outerHTML.slice(0, 180), bounds: header.getBoundingClientRect().toJSON(),
        inlineInset: header.style.getPropertyValue('--ds-window-controls-inset'),
        computedInset: getComputedStyle(header).getPropertyValue('--ds-window-controls-inset'),
        paddingLeft: getComputedStyle(header).paddingLeft
      }))
    })`).catch(() => 'Renderer unavailable')
    writeSync(2, `Window controls layout: ${layout}\n`)
    window.destroy()
    // app.quit() does not propagate Node's process.exitCode to the parent test.
    app.exit(1)
  }
})
