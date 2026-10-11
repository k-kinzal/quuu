import { app, BrowserWindow } from 'electron'
import { writeSync } from 'node:fs'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { sandbox: true, backgroundThrottling: false } })
  try {
    window.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    await window.loadURL(process.argv[2])
    const result = await window.webContents.executeJavaScript(`window.checkWindowControls().catch(error => {
      console.error(error.stack)
      throw error
    })`)
    // Electron can quit before a piped console write drains on the CI runner.
    writeSync(1, `${result}\n`)
    app.exit(0)
  } catch (error) {
    writeSync(2, `${error.stack ?? error}\n`)
    // app.quit() does not propagate Node's process.exitCode to the parent test.
    app.exit(1)
  }
})
