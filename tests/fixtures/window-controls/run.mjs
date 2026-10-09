import { app, BrowserWindow } from 'electron'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1100, height: 700, webPreferences: { sandbox: true, backgroundThrottling: false } })
  try {
    await window.loadURL(process.argv[2])
    console.log(await window.webContents.executeJavaScript('window.checkWindowControls()'))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    window.destroy()
    app.quit()
  }
})
