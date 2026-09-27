import { app, BrowserWindow, clipboard, dialog, shell, systemPreferences, type OpenDialogOptions } from 'electron'
import { applicationWindows } from '../windows.js'
import { SCROLL_SWIPE_DEFAULT, scrollSwipeNavigates } from '../swipe.js'
import { COLLAPSED_RAIL_WIDTH, WINDOW_BUTTONS_INSET, WINDOW_BUTTONS_OVERHANG } from '../windowGeometry.js'
import { t } from '../i18n/index.js'
import { popupMenu } from '../nativeMenu.js'
import { cancelGitHubApp, createGitHubApp, fetchBotUserId } from '../platform/githubApp.js'
import { openExternalLink } from '../platform/externalLinks.js'
import { closePullRequestView, hidePullRequestView, showPullRequestView } from '../platform/pullRequestViews.js'
import { hideReportView, showReportView } from '../platform/reportViews.js'
import { showDocumentView, hideDocumentView, navigateDocumentView } from '../platform/documentViews.js'
import type { DesktopOperations } from '../api/host.js'
import type { AppInfo } from '../../api/schemas/app.js'
import { userDataDir } from '../appPaths.js'
import type { AppUpdates } from './appUpdates.js'

/*
 * The updater exists only in a Release build and is loaded lazily, so it is handed in once it
 * starts rather than imported here. Without one, this copy is a local build that never updates.
 */
let appUpdates: AppUpdates | null = null

export function attachAppUpdates(updates: AppUpdates | null): void {
  appUpdates = updates
}

function appInfo(): AppInfo {
  return { version: app.getVersion(), dataDirectory: userDataDir(), updates: appUpdates?.status() ?? 'local' }
}

/** The app menu's commands. Neither needs a window, so a CLI call does not bring one forward. */
export const appControls = {
  info: appInfo,
  checkForUpdates: (): AppInfo => {
    appUpdates?.check(true)
    return appInfo()
  }
}

export function desktopOperations(owner: BrowserWindow): DesktopOperations {
  return {
    windowLayout: () => {
      return ({ leftInset: WINDOW_BUTTONS_INSET, collapsedRailWidth: COLLAPSED_RAIL_WIDTH, overhang: WINDOW_BUTTONS_OVERHANG })
    },
    scrollSwipes: () => {
      return scrollSwipeNavigates(systemPreferences.getUserDefault(SCROLL_SWIPE_DEFAULT, 'string'))
    },
    lookupBotUser: (input) => {
      const appSlug = input
      return fetchBotUserId(appSlug)
    },
    createGitHubApp: () => {
      return createGitHubApp((url) => shell.openExternal(url))
    },
    cancelGitHubApp: () => {
      return cancelGitHubApp()
    },
    pickDirectory: async () => {

      const win = BrowserWindow.getFocusedWindow() ?? applicationWindows()[0]
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]

    },
    pickApplication: async () => {

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      // A `.app` is a directory inside, but the panel lets it be picked as a single file
      const options: OpenDialogOptions = {
        properties: ['openFile'],
        defaultPath: '/Applications',
        filters: [{ name: t('dialog.applications'), extensions: ['app'] }]
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]

    },
    confirm: async (input) => {
      const { message, detail, confirmLabel } = input

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const options = {
        type: 'warning' as const,
        message,
        detail,
        buttons: [confirmLabel, t('dialog.cancel')],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      }
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      return result.response === 0

    },
    popupMenu: async (input) => {
      const request = input

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return null
      return popupMenu(request, win)

    },
    reveal: (input) => {
      const path = input

      shell.showItemInFolder(path)

    },
    openExternal: async (input) => {
      await openExternalLink(input)
    },
    copy: (input) => {
      const text = input

      clipboard.writeText(text)

    },
    openPullRequest: (input) => {
      const request = input
      return showPullRequestView(owner, request)
    },
    hidePullRequest: (input) => {
      const id = input
      return hidePullRequestView(owner, id)
    },
    closePullRequest: (input) => {
      const id = input
      return closePullRequestView(owner, id)
    },
    showReport: request => showReportView(owner, request),
    hideReport: () => hideReportView(owner),
    showDocument: request => showDocumentView(owner, request),
    hideDocument: () => hideDocumentView(owner),
    navigateDocument: direction => navigateDocumentView(owner, direction),
  }
}
