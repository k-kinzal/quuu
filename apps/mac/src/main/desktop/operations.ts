import { BrowserWindow, clipboard, dialog, shell, systemPreferences, type OpenDialogOptions } from 'electron'
import { applicationWindows } from '../windows.js'
import { SCROLL_SWIPE_DEFAULT, scrollSwipeNavigates } from '../swipe.js'
import { COLLAPSED_RAIL_WIDTH, WINDOW_BUTTONS_INSET, WINDOW_BUTTONS_OVERHANG } from '../windowGeometry.js'
import { t } from '../i18n/index.js'
import { popupMenu } from '../nativeMenu.js'
import { cancelGitHubApp, createGitHubApp, fetchBotUserId } from '../platform/githubApp.js'
import { openExternalLink } from '../platform/externalLinks.js'
import { closePullRequestView, hidePullRequestView, showPullRequestView } from '../platform/pullRequestViews.js'
import { hideReportView, showReportView } from '../platform/reportViews.js'
import type { DesktopOperations } from '../api/host.js'

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
  }
}
