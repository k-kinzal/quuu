import type { BrowserWindow } from 'electron'
import { Menu } from 'electron'
import type { PopupMenuRequest } from './ipc/types.js'
import { menuTemplate } from './menuTemplate.js'

/**
 * Let the OS draw the menus the UI opens.
 *
 * Previously MUI's `Menu` (`Modal` + `Backdrop` + `Paper`) was drawn inside the
 * window. However close the looks, that is a **web popover**, not an OS menu.
 *
 * | | Surface drawn in-window | OS menu |
 * |---|---|---|
 * | Extend beyond the window | No (crushed at the edge) | Yes. The OS nudges it to fit the screen |
 * | Keyboard | Arrows, type-ahead, `⏎` don't work | The OS handles all of it |
 * | Surface behind | Backdrop covers it and swallows the next click | Not covered |
 * | Submenus | Hand-rolled hover. Moving diagonally closes them | OS tracking |
 * | Looks | Our own colors and type | Material, accent color, metrics are the OS's |
 * | Switching apps | Stays open | Closes |
 *
 * The renderer sends only "what to show". Drawing, close conditions, and key handling all go to the OS.
 */
export function popupMenu(request: PopupMenuRequest, win: BrowserWindow): Promise<string | null> {
  return new Promise((resolve) => {
    const template = menuTemplate(request.items, resolve)
    if (template.length === 0) {
      resolve(null)
      return
    }

    /*
     * Coordinates arrive in the renderer's CSS pixels. With a zoom factor (⌘+)
     * applied they diverge from OS coordinates, so convert back here. When no
     * position is passed, open at the cursor (which is right for right-click).
     */
    const zoom = win.webContents.getZoomFactor()
    const at =
      request.x !== undefined && request.y !== undefined
        ? { x: Math.round(request.x * zoom), y: Math.round(request.y * zoom) }
        : {}

    Menu.buildFromTemplate(template).popup({
      window: win,
      ...at,
      /*
       * Closing always lands here. When closed by choosing, click runs first,
       * but the ordering is up to the OS, so wait a beat before settling on
       * "nothing chosen". Only the first resolve of a Promise counts, so if
       * click wins, the selection is returned
       */
      callback: () => setTimeout(() => resolve(null), 0)
    })
  })
}
