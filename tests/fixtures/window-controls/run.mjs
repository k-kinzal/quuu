import { app, BrowserWindow } from 'electron'
import { writeSync } from 'node:fs'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { sandbox: true, backgroundThrottling: false } })
  try {
    window.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    await window.loadURL(process.argv[2])
    // Record existing reads and writes without forcing any additional style/layout work.
    const result = await window.webContents.executeJavaScript(`(() => {
      const trace = window.windowControlsTrace = []
      const record = entry => {
        trace.push(entry)
        if (trace.length > 80) trace.shift()
      }
      const closest = Element.prototype.closest
      Element.prototype.closest = function(selector) {
        const result = closest.call(this, selector)
        if (selector === '[data-ds-app-shell]') {
          record({ type: 'shell', tag: this.tagName, connected: this.isConnected, found: Boolean(result) })
        }
        return result
      }
      const bounds = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function() {
        const result = bounds.call(this)
        if (this.matches('header, h1, [data-ds-app-shell]')) {
          record({ type: 'bounds', tag: this.tagName, bounds: result.toJSON() })
        }
        return result
      }
      for (const method of ['setProperty', 'removeProperty']) {
        const original = CSSStyleDeclaration.prototype[method]
        CSSStyleDeclaration.prototype[method] = function(...args) {
          const result = original.apply(this, args)
          if (args[0] === '--ds-window-controls-inset') {
            record({ type: method, value: args[1] ?? null, previous: result })
          }
          return result
        }
      }
      return window.checkWindowControls().catch(error => {
        console.error(error.stack)
        throw error
      })
    })()`)
    // Electron can quit before a piped console write drains on the CI runner.
    writeSync(1, `${result}\n`)
    window.destroy()
    app.exit(0)
  } catch (error) {
    writeSync(2, `${error.stack ?? error}\n`)
    const layout = await window.webContents.executeJavaScript(`JSON.stringify({
      userAgent: navigator.userAgent, trace: window.windowControlsTrace?.slice(),
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
