import { app, Menu, shell } from 'electron'
import { EVENTS } from '../preload/channels.js'
import { userDataDir } from './appPaths.js'
import { t } from './i18n/index.js'
import { sendEvent } from './ipc/events.js'
import type { AppCommand, CommandPayload } from './ipc/types.js'
import { PRIORITY_LABEL } from './menuLabels.js'
import { beginQuit, mainWindow, showWindow } from './windows.js'
let currentProjects: { id: string; name: string }[] = []
export function send(command: AppCommand, extra?: Omit<CommandPayload, 'command'>): void {
  showWindow()
  const payload: CommandPayload = { command, ...extra }
  if (mainWindow) sendEvent(mainWindow, EVENTS.command, payload)
}

/** The project list as of the last menu build. null = never built yet */
let projectMenuSignature: string | null = null

/** What goes into "Go › Projects". Up to the 7 reachable via ⌘3–⌘9 (the rest via ⌘T or the rail) */
function menuProjects(): { id: string; name: string }[] {
  // The snapshot never contains deleted projects, so no filtering needed here
  return currentProjects.slice(0, 7).map((p) => ({ id: p.id, name: p.name }))
}

/**
 * Reflect project additions/removals in the menu.
 *
 * The native menu is built statically, so it must be rebuilt when the list
 * changes. But rebuilding on every snapshot (several arrive per second while
 * running) would dismiss a menu the user has open, so rebuild **only when the
 * list actually changed**.
 */
export function refreshMenuIfProjectsChanged(projects: { id: string; name: string }[]): void {
  currentProjects = projects
  const signature = menuProjects()
    .map((p) => `${p.id}:${p.name}`)
    .join(' / ')
  if (signature === projectMenuSignature) return
  projectMenuSignature = signature
  buildMenu()
}

/**
 * The native menu.
 *
 * Shortcuts are defined here, in this one place. The renderer does not listen
 * for the same keys; it only executes the commands it is sent. This way the
 * operations are listed in the menu and the bindings are discoverable from the
 * screen (the obvious entry point for a desktop app).
 *
 * The layout follows macOS conventions.
 *
 * - **Menus are split by "what they act on."** "Go" is destinations, "Task" is
 *   operations on the one selected item, "View" is how the surfaces are shown.
 *   Mixing them means there's no fixed place to look
 * - **Submenus go one level deep, with around 5 items.** Deeper can't be
 *   navigated; longer can't be scanned. Beyond that, split into another menu
 * - **Always include Help.** macOS uses it as the entry point for menu search
 */
function buildMenu(): void {
  const projects = menuProjects()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Quuu',
      submenu: [
        { role: 'about', label: t('menu.about') },
        { type: 'separator' },
        { label: t('menu.settings'), accelerator: 'Cmd+,', click: () => send('view.settings') },
        { type: 'separator' },
        { role: 'hide', label: t('menu.hide') },
        { role: 'hideOthers', label: t('menu.hideOthers') },
        { role: 'unhide', label: t('menu.showAll') },
        { type: 'separator' },
        {
          label: t('menu.quit'),
          accelerator: 'Cmd+Q',
          click: () => {
            beginQuit()
            app.quit()
          }
        }
      ]
    },
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.newTask'), accelerator: 'Cmd+N', click: () => send('task.new') },
        {
          label: t('menu.newProject'),
          accelerator: 'Cmd+Shift+N',
          click: () => send('project.add')
        },
        { type: 'separator' },
        { role: 'close', label: t('menu.closeWindow') }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') },
        { type: 'separator' },
        /*
         * The one place to search is the palette (the window has no title bar,
         * so no search field either). ⌘F stays as macOS convention and lands in
         * the same place as ⌘T — so the answer is "search is here", not "there
         * is no search"
         */
        { label: t('menu.findTasks'), accelerator: 'Cmd+F', click: () => send('view.search') },
        /*
         * The one binding that reaches the right-click menu from the keyboard.
         *
         * Run, complete, delete, copy path, set dependencies — right-click is
         * still the main entry for these. **Never leave a menu reachable only
         * by pointer.**
         *
         * Not ⌃↵. It collides with the composer's submit keys (⌘↵ / ⌃↵), and
         * the menu accelerator takes it first, so **sending stops working**
         */
        {
          label: t('menu.contextMenu'),
          accelerator: 'Cmd+Alt+Return',
          click: () => send('menu.context')
        }
      ]
    },
    {
      label: t('menu.task'),
      submenu: [
        { label: t('menu.open'), accelerator: 'Cmd+O', click: () => send('task.open') },
        { type: 'separator' },
        { label: t('menu.runNow'), accelerator: 'Cmd+R', click: () => send('task.runNow') },
        {
          label: t('menu.markDone'),
          accelerator: 'Cmd+Shift+D',
          click: () => send('task.markDone')
        },
        { label: t('menu.sendBack'), accelerator: 'Cmd+Shift+B', click: () => send('task.sendBack') },
        { type: 'separator' },
        {
          // Just re-picking one value, so it folds into a submenu
          label: t('menu.priority'),
          submenu: [0, 1, 2, 3].map((value) => ({
            label: PRIORITY_LABEL[value as 0 | 1 | 2 | 3],
            accelerator: `Cmd+Ctrl+${value}`,
            click: () => send('task.setPriority', { value })
          }))
        },
        { type: 'separator' },
        /*
         * The 3 items that move you to the work location.
         *
         * The destination isn't necessarily the project directory. Open **where
         * the task actually ran** (the worktree, if there is one). After
         * reading, the next move is typing a follow-up by hand or looking at
         * the diff, so the same items as right-click live here too
         */
        {
          label: t('menu.openTerminal'),
          accelerator: 'Cmd+Shift+T',
          click: () => send('task.openTerminal')
        },
        {
          label: t('menu.resumeTerminal'),
          accelerator: 'Cmd+Shift+R',
          click: () => send('task.resumeTerminal')
        },
        {
          label: t('menu.openEditor'),
          accelerator: 'Cmd+Shift+E',
          click: () => send('task.openEditor')
        },
        { type: 'separator' },
        /*
         * The order is often decided before writing. The same items as
         * right-click live here too, opening a keyboard path other than
         * "create, then open, then specify"
         */
        { label: t('menu.addAfter'), click: () => send('task.addAfter') },
        { label: t('menu.addBefore'), click: () => send('task.addBefore') },
        { type: 'separator' },
        { label: t('menu.archive'), accelerator: 'Cmd+Backspace', click: () => send('task.archive') },
        { label: t('menu.delete'), click: () => send('task.delete') }
      ]
    },
    {
      /*
       * A menu of nothing but destinations.
       * Until now, projects could only be reached by clicking the rail or via
       * ⌘T — "where can I go" couldn't be read from the menu
       */
      label: t('menu.go'),
      submenu: [
        /*
         * Retracing steps, above the list of destinations — the shape every
         * other Go menu on the machine has.
         *
         * ⌘[ / ⌘], not ⌘← / ⌘→. Accelerators are taken before the renderer sees
         * them, and those two are **move to start / end of line** inside every
         * input in the app
         */
        { label: t('menu.back'), accelerator: 'Cmd+[', click: () => send('view.back') },
        { label: t('menu.forward'), accelerator: 'Cmd+]', click: () => send('view.forward') },
        { type: 'separator' },
        {
          label: t('menu.goAnywhere'),
          accelerator: 'Cmd+T',
          click: () => send('view.palette')
        },
        { type: 'separator' },
        { label: t('menu.allTasks'), accelerator: 'Cmd+1', click: () => send('view.all') },
        { label: t('menu.needsReview'), accelerator: 'Cmd+2', click: () => send('view.review') },
        {
          label: t('menu.projects'),
          enabled: projects.length > 0,
          submenu:
            projects.length > 0
              ? projects.map((p, i) => ({
                label: p.name,
                accelerator: `Cmd+${i + 3}`,
                click: () => send('view.project', { projectId: p.id })
              }))
              : [{ label: t('menu.noProjectsYet'), enabled: false }]
        },
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        /*
         * The Esc binding is not defined here.
         * Menu accelerators fire before the renderer, so it would also steal
         * Esc (go back one level) from inputs and the command palette
         */
        { label: t('menu.closeDetail'), click: () => send('task.close') },
        {
          // Panel toggles come as a set of 3. Listed together, "which can be collapsed" reads at a glance
          label: t('menu.panels'),
          submenu: [
            { label: t('menu.railPanel'), accelerator: 'Cmd+Alt+1', click: () => send('panel.rail') },
            { label: t('menu.listPanel'), accelerator: 'Cmd+Alt+2', click: () => send('panel.list') },
            { label: t('menu.inspectorPanel'), accelerator: 'Cmd+\\', click: () => send('panel.inspector') }
          ]
        },
        {
          /*
           * Which pane the hands rest on. A different axis from toggling
           * (above), so it sits next to it. Direction follows the on-screen
           * order (menu → list → conversation → info)
           */
          label: t('menu.focus'),
          submenu: [
            { label: t('menu.prevPane'), accelerator: 'Cmd+Alt+Left', click: () => send('focus.prev') },
            { label: t('menu.nextPane'), accelerator: 'Cmd+Alt+Right', click: () => send('focus.next') }
          ]
        },
        { type: 'separator' },
        { label: t('menu.projectSettings'), click: () => send('project.settings') },
        { type: 'separator' },
        {
          label: t('menu.zoom'),
          submenu: [
            { role: 'resetZoom', label: t('menu.actualSize') },
            { role: 'zoomIn', label: t('menu.zoomIn') },
            { role: 'zoomOut', label: t('menu.zoomOut') }
          ]
        },
        { role: 'togglefullscreen', label: t('menu.fullScreen') },
        { type: 'separator' },
        {
          // Not everyday operations, so development items drop into a submenu, out of the flow
          label: t('menu.develop'),
          submenu: [
            { role: 'reload', label: t('menu.reload') },
            { role: 'toggleDevTools', label: t('menu.devTools') }
          ]
        }
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        { role: 'zoom', label: t('menu.zoomWindow') },
        { role: 'front', label: t('menu.bringAllToFront') }
      ]
    },
    {
      // macOS uses this as the entry point for "search menu items". Present even if empty
      role: 'help',
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.howToUse'),
          click: () => void shell.openExternal('https://github.com/k-kinzal/quuu#readme')
        },
        { type: 'separator' },
        {
          label: t('menu.openDataFolder'),
          // The storage location is swappable via environment variables, so go through appPaths, not app.getPath
          click: () => void shell.openPath(userDataDir())
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
