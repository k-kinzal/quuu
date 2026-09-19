import { savePromptFiles } from '../platform/promptFiles.js'
import { implement, ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { BrowserWindow, clipboard, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import type { SessionAppendedPayload } from '../../preload/api.js'
import { contract } from '../../preload/contract.js'
import type { SessionView } from '../session/view.js'
import { COLLAPSED_RAIL_WIDTH, WINDOW_BUTTONS_INSET, WINDOW_BUTTONS_OVERHANG } from '../windowGeometry.js'
import { applicationWindows, ownsWindow, windowUrl } from '../windows.js'
import { sendEvent } from './events.js'
import { authorizedFrame } from './validation.js'


import { EVENTS, RPC_CONNECT } from '../../preload/channels.js'

import type { QuuuApp } from '../bootstrap.js'
import { t } from '../i18n/index.js'
import { popupMenu } from '../nativeMenu.js'
import { cancelGitHubApp, createGitHubApp, fetchBotUserId } from '../platform/githubApp.js'
import { closePullRequestView, hidePullRequestView, showPullRequestView } from '../platform/pullRequestViews.js'
import { hideReportView, showReportView } from '../platform/reportViews.js'

function ownerOf(event: Electron.IpcMainEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || !authorizedFrame({ owned: ownsWindow(owner), mainFrame: event.senderFrame === event.sender.mainFrame, actualUrl: event.senderFrame?.url ?? '', expectedUrl: windowUrl(owner) })) throw new Error('Operations from this sender are not allowed')
  return owner
}

/** Wire window destruction, renderer death, and explicit release to the same cleanup. */
function releaseWithWindow(owner: BrowserWindow, cleanup: () => void): () => void {
  const contents = owner.webContents
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    owner.removeListener('closed', release)
    contents.removeListener('render-process-gone', release)
    cleanup()
  }
  owner.once('closed', release)
  contents.once('render-process-gone', release)
  return release
}

export function createAppRouter(app: QuuuApp) {
  const os = implement(contract).$context<{ owner: BrowserWindow }>().use(async ({ context, next, path }) => {
    if (context.owner.isDestroyed() || !authorizedFrame({ owned: ownsWindow(context.owner), mainFrame: true, actualUrl: context.owner.webContents.mainFrame.url, expectedUrl: windowUrl(context.owner) })) throw new ORPCError('FORBIDDEN')
    try { return await next() } catch (error) {
      console.error('Operation failed', path.join('.'), error)
      if (error instanceof ORPCError) throw error
      throw new ORPCError('OPERATION_FAILED', { message: t('ipc.operationFailed'), data: { reason: error instanceof Error ? error.message : String(error) }, cause: error })
    }
  })
  const sessions = new Map<BrowserWindow, SessionView>()
  const releaseSessions = new Map<BrowserWindow, () => void>()
  const terminals = new Map<BrowserWindow, Set<string>>()
  const sessionFor = (owner: BrowserWindow): SessionView => {
    let view = sessions.get(owner)
    if (!view) {
      view = app.createSessionView()
      sessions.set(owner, view)
      view.watcher.on('appended', (event: SessionAppendedPayload) => { if (!owner.isDestroyed()) sendEvent(owner, EVENTS.sessionAppended, event) })
      releaseSessions.set(owner, releaseWithWindow(owner, () => {
        const current = sessions.get(owner)
        if (current) app.releaseSessionView(current)
        sessions.delete(owner)
        releaseSessions.delete(owner)
      }))
    }
    return view
  }
  const terminalIds = (owner: BrowserWindow): Set<string> => {
    let ids = terminals.get(owner)
    if (!ids) {
      ids = new Set()
      terminals.set(owner, ids)
      const close = (): void => { for (const id of terminals.get(owner) ?? []) app.terminal.closeWorkbenchTerminal(id); terminals.delete(owner) }
      releaseWithWindow(owner, close)
    }
    return ids
  }
  const requireTerminal = (owner: BrowserWindow, id: string): void => {
    if (!terminalIds(owner).has(id)) throw new Error('Not a terminal of this window')
  }
  app.terminals.on('terminal', (event: import('../terminal/types.js').TerminalEvent) => {
    for (const [owner, ids] of terminals) if (!owner.isDestroyed() && ids.has(event.sessionId)) sendEvent(owner, EVENTS.terminal, event)
  })
  const windowLayout = os.system.windowLayout.handler(() => {
    return ({ leftInset: WINDOW_BUTTONS_INSET, collapsedRailWidth: COLLAPSED_RAIL_WIDTH, overhang: WINDOW_BUTTONS_OVERHANG })
  })
  const rulePreview = os.rules.preview.handler(({ input }) => {
    return app.automation.preview(input)
  })
  const agentDefaults = os.agents.defaults.handler(() => {
    return app.agents.defaults()
  })
  const identityPreview = os.settings.previewIdentity.handler(({ input }) => {
    const identity = input.identity
    const projectId = input.projectId
    return app.settings.previewIdentity(identity, projectId)
  })
  const identitySet = os.settings.setIdentity.handler(({ input }) => {
    const identity = input
    return app.settings.setIdentity(identity)
  })
  const snapshot = os.snapshot.handler(() => {
    return app.snapshot()
  })

  // --- Projects ---
  const projectList = os.projects.list.handler(() => {
    return app.projects.listProjects()
  })
  const projectCreate = os.projects.create.handler(({ input }) => {
    return app.projects.createProject(input)
  })
  const projectUpdate = os.projects.update.handler(({ input }) => {
    const id = input.id
    const patch = input.patch
    return app.projects.updateProject(id, patch)
  })
  const projectDelete = os.projects.remove.handler(({ input }) => {
    const id = input
    return app.projects.deleteProject(id)
  })

  // --- Tasks ---
  const taskCreate = os.tasks.create.handler(({ input }) => {
    return app.tasks.createTask(input)
  })
  const taskUpdate = os.tasks.update.handler(({ input }) => {
    const id = input.id
    const patch = input.patch
    return app.tasks.updateTask(id, patch)
  })
  const taskEnqueue = os.tasks.enqueue.handler(({ input }) => {
    const id = input
    return app.tasks.enqueueTask(id)
  })
  const taskUnqueue = os.tasks.unqueue.handler(({ input }) => {
    const id = input
    return app.tasks.unqueueTask(id)
  })
  const taskHold = os.tasks.hold.handler(({ input }) => {
    const id = input
    return app.tasks.holdTask(id)
  })
  const taskRunNow = os.tasks.runNow.handler(({ input }) => {
    const id = input
    return app.tasks.runNow(id)
  })
  const taskMarkDone = os.tasks.markDone.handler(({ input }) => {
    const id = input
    return app.tasks.markDone(id)
  })
  const taskReopen = os.tasks.reopen.handler(({ input }) => {
    const id = input
    return app.tasks.reopen(id)
  })
  const taskSendBack = os.tasks.sendBack.handler(({ input }) => {
    const id = input.id
    const note = input.note
    return app.tasks.sendBack(id, note)
  })
  const taskCancel = os.tasks.cancel.handler(({ input }) => {
    const id = input
    return app.tasks.cancelTask(id)
  })
  const taskDelete = os.tasks.remove.handler(({ input }) => {
    const id = input
    return app.tasks.deleteTask(id)
  })
  const taskArchive = os.tasks.archive.handler(({ input }) => {
    const id = input.id
    const archived = input.archived
    return app.tasks.archiveTask(id, archived)
  })

  // --- Automatic tasks ---
  const ruleCreate = os.rules.create.handler(({ input }) => {
    return app.automation.createTaskRule(input)
  })
  const ruleUpdate = os.rules.update.handler(({ input }) => {
    const id = input.id
    const patch = input.patch
    return app.automation.updateTaskRule(id, patch)
  })
  const ruleDelete = os.rules.remove.handler(({ input }) => {
    const id = input
    return app.automation.deleteTaskRule(id)
  })
  const ruleEnqueue = os.rules.enqueue.handler(({ input }) => {
    const id = input
    return app.automation.enqueueTaskRule(id)
  })

  // --- Agents / groups ---
  const agentCreate = os.agents.create.handler(({ input }) => {
    return app.agents.createAgent(input)
  })
  const agentUpdate = os.agents.update.handler(({ input }) => {
    const id = input.id
    const patch = input.patch
    return app.agents.updateAgent(id, patch)
  })
  const agentDuplicate = os.agents.duplicate.handler(({ input }) => {
    const id = input
    return app.agents.duplicateAgent(id)
  })
  const agentDelete = os.agents.remove.handler(({ input }) => {
    const id = input
    return app.agents.deleteAgent(id)
  })
  const groupCreate = os.groups.create.handler(({ input }) => {
    return app.agents.createGroup(input)
  })
  const groupUpdate = os.groups.update.handler(({ input }) => {
    const id = input.id
    const patch = input.patch
    return app.agents.updateGroup(id, patch)
  })
  const groupDelete = os.groups.remove.handler(({ input }) => {
    const id = input
    return app.agents.deleteGroup(id)
  })

  // --- Runs / sessions ---
  const runsByTask = os.runs.byTask.handler(({ input }) => {
    const taskId = input
    return app.tasks.runsByTask(taskId)
  })
  const runCancel = os.runs.cancel.handler(({ input }) => {
    const runId = input
    return app.tasks.cancelRun(runId)
  })
  const sessionLoad = os.session.load.handler(({ input, context }) => {
    const owner = context.owner
    const runId = input
    return sessionFor(owner).loadSession(runId)
  })
  const sessionLoadMore = os.session.loadMore.handler(({ input, context }) => {
    const owner = context.owner
    return sessionFor(owner).loadMoreSession(input.runId, input.direction)
  })
  const sessionImage = os.session.image.handler(({ input, context }) => {
    const owner = context.owner
    const imageId = input
    return sessionFor(owner).sessionImage(imageId)
  })
  const sessionClose = os.session.close.handler(({ context }) => {
    const owner = context.owner
    return releaseSessions.get(owner)?.()
  })
  const taskSend = os.tasks.send.handler(({ input }) => {
    const taskId = input.id
    const message = input.message
    return app.tasks.send(taskId, message)
  })
  const taskClearReserved = os.tasks.clearReserved.handler(({ input }) => {
    const taskId = input
    return app.tasks.clearReservation(taskId)
  })

  // --- Scheduler ---
  const schedulerStatus = os.scheduler.status.handler(() => {
    return app.scheduler.status()
  })
  const schedulerPause = os.scheduler.pause.handler(() => {
    return app.scheduler.pause()
  })
  const schedulerResume = os.scheduler.resume.handler(() => {
    return app.scheduler.resume()
  })

  // --- Settings ---
  const settingsGet = os.settings.get.handler(() => {
    return app.settings.getSettings()
  })
  const settingsSet = os.settings.set.handler(({ input }) => {
    const patch = input
    return app.settings.setSettings(patch)
  })
  const importSync = os.importer.sync.handler(() => {
    return app.syncImport()
  })

  // --- Sync with the iPhone ---
  const mobileStatus = os.mobile.status.handler(() => {
    return app.mobileSyncStatus()
  })
  const mobileSyncNow = os.mobile.syncNow.handler(() => {
    return app.syncMobileNow()
  })
  const githubBotUser = os.settings.lookupBotUser.handler(({ input }) => {
    const appSlug = input
    return fetchBotUserId(appSlug)
  })
  const githubAppCreate = os.settings.createGitHubApp.handler(() => {
    return createGitHubApp((url) => shell.openExternal(url))
  })
  const githubAppCancel = os.settings.cancelGitHubApp.handler(() => {
    return cancelGitHubApp()
  })

  // --- System ---
  const pickDirectory = os.system.pickDirectory.handler(async () => {

    const win = BrowserWindow.getFocusedWindow() ?? applicationWindows()[0]
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]

  })
  /*
   * Pick a `.app`. If apps not in the list (self-built copies, ones installed
   * elsewhere) cannot be pointed at, that becomes a dead end.
   */
  const pickApplication = os.system.pickApplication.handler(async () => {

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

  })
  /*
   * Confirm irreversible operations with an OS sheet.
   *
   * The default sits on "Cancel" so hammering ⏎ cannot push a deletion through.
   * `window.confirm` defaulted to the OK side, and its buttons were Web buttons at that
   */
  const confirm = os.system.confirm.handler(async ({ input }) => {
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

  })
  // Menus the screen shows are drawn by the OS too (a surface drawn inside the window is not a menu)
  const popupMenuRequest = os.system.popupMenu.handler(async ({ input }) => {
    const request = input

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return null
    return popupMenu(request, win)

  })
  const revealPath = os.system.reveal.handler(({ input }) => {
    const path = input

    shell.showItemInFolder(path)

  })
  const openExternal = os.system.openExternal.handler(async ({ input }) => {
    const url = input

    await shell.openExternal(url)

  })
  const copyText = os.system.copy.handler(({ input }) => {
    const text = input

    clipboard.writeText(text)

  })

  // --- Open in external apps ---
  const openTerminal = os.open.terminal.handler(({ input }) => {
    const target = input
    return app.workspace.openTerminal(target)
  })
  const resumeTerminal = os.open.resume.handler(({ input }) => {
    const taskId = input
    return app.workspace.resumeInTerminal(taskId)
  })
  const openEditor = os.open.editor.handler(({ input }) => {
    const target = input.target
    const appPath = input.appPath
    return app.workspace.openEditor(target, appPath)
  })
  /*
   * Finder goes through the same "open target" resolution. That is why this exists
   * apart from `revealPath` (if the screen passed a path, the terminal and Finder
   * could end up at different destinations).
   */
  const openFinder = os.open.reveal.handler(({ input }) => {
    const target = input

    const place = app.workspace.locate(target)
    if (!('dir' in place)) return place
    shell.showItemInFolder(place.dir)
    return { ok: true }

  })
  const workingDir = os.open.workingDir.handler(({ input }) => {
    const target = input

    const place = app.workspace.locate(target)
    return 'dir' in place ? place.dir : null

  })
  const editorList = os.open.editors.handler(() => {
    return app.workspace.listEditors()
  })

  // --- Task workbench ---
  const reviewSnapshot = os.review.snapshot.handler(({ input }) => {
    const taskId = input
    return app.reviews.reviewSnapshot(taskId)
  })
  const reviewFile = os.review.file.handler(({ input }) => {
    const taskId = input.taskId
    const request = input.request
    return app.reviews.reviewFile(taskId, request)
  })
  const reviewComment = os.review.comment.handler(({ input: request }) => {
    const taskId = request.taskId
    const input = request.input
    return app.reviews.reviewComment(taskId, input)
  })
  const reviewOpenPullRequest = os.review.openPullRequest.handler(({ input, context }) => {
    const owner = context.owner
    const request = input
    return showPullRequestView(owner, request)
  })
  const reviewHidePullRequest = os.review.hidePullRequest.handler(({ input, context }) => {
    const owner = context.owner
    const id = input
    return hidePullRequestView(owner, id)
  })
  const reviewClosePullRequest = os.review.closePullRequest.handler(({ input, context }) => {
    const owner = context.owner
    const id = input
    return closePullRequestView(owner, id)
  })
  const reportGet = os.report.get.handler(({ input }) => app.reports.report(input))
  const reportGenerate = os.report.generate.handler(({ input }) => app.reports.generate(input))
  /*
   * The renderer asks for a task's report, never for a path. Which file that is stays main's
   * answer, so a screen cannot point the view at something no generation produced.
   */
  const reportShow = os.report.show.handler(({ input, context }) => {
    const report = app.reports.report(input.taskId)
    if (!report || report.path.length === 0) return { ok: false, reason: t('report.noPage') }
    return showReportView(context.owner, { file: report.path, bounds: input.bounds })
  })
  const reportHide = os.report.hide.handler(({ context }) => hideReportView(context.owner))
  const terminalOpen = os.terminal.open.handler(({ input, context }) => {
    const owner = context.owner
    const taskId = input.taskId
    const columns = input.columns
    const rows = input.rows

    const terminal = app.terminal.openWorkbenchTerminal(taskId, columns, rows)
    terminalIds(owner).add(terminal.id)
    return terminal

  })
  const terminalInput = os.terminal.input.handler(({ input: request, context }) => {
    const owner = context.owner
    const id = request.sessionId
    const input = request.input
    requireTerminal(owner, id); return app.terminal.sendWorkbenchTerminal(id, input)
  })
  const terminalResize = os.terminal.resize.handler(({ input, context }) => {
    const owner = context.owner
    const id = input.sessionId
    const columns = input.columns
    const rows = input.rows
    requireTerminal(owner, id); return app.terminal.resizeWorkbenchTerminal(id, columns, rows)
  })
  const terminalRunProjectTask = os.terminal.runProjectTask.handler(({ input, context }) => {
    const owner = context.owner
    const taskId = input.taskId
    const id = input.sessionId
    const projectTaskId = input.projectTaskId
    requireTerminal(owner, id); return app.terminal.runWorkbenchProjectTask(taskId, id, projectTaskId)
  })
  const terminalClose = os.terminal.close.handler(({ input, context }) => {
    const owner = context.owner
    const id = input
    requireTerminal(owner, id); app.terminal.closeWorkbenchTerminal(id); terminalIds(owner).delete(id)
  })
  return os.router({
    snapshot: snapshot,
    system: {
      savePromptFiles: os.system.savePromptFiles.handler(({ input }) => savePromptFiles(input.map(file => ({ name: file.name, data: Buffer.from(file.data, 'base64') })))),
      windowLayout: windowLayout,
      pickDirectory: pickDirectory,
      pickApplication: pickApplication,
      confirm: confirm,
      popupMenu: popupMenuRequest,
      reveal: revealPath,
      openExternal: openExternal,
      copy: copyText,
    },
    rules: {
      preview: rulePreview,
      create: ruleCreate,
      update: ruleUpdate,
      remove: ruleDelete,
      enqueue: ruleEnqueue,
    },
    agents: {
      defaults: agentDefaults,
      create: agentCreate,
      update: agentUpdate,
      duplicate: agentDuplicate,
      remove: agentDelete,
    },
    settings: {
      previewIdentity: identityPreview,
      setIdentity: identitySet,
      get: settingsGet,
      set: settingsSet,
      lookupBotUser: githubBotUser,
      createGitHubApp: githubAppCreate,
      cancelGitHubApp: githubAppCancel,
    },
    projects: {
      list: projectList,
      create: projectCreate,
      update: projectUpdate,
      remove: projectDelete,
    },
    tasks: {
      create: taskCreate,
      update: taskUpdate,
      enqueue: taskEnqueue,
      unqueue: taskUnqueue,
      hold: taskHold,
      runNow: taskRunNow,
      markDone: taskMarkDone,
      reopen: taskReopen,
      sendBack: taskSendBack,
      cancel: taskCancel,
      remove: taskDelete,
      archive: taskArchive,
      send: taskSend,
      clearReserved: taskClearReserved,
    },
    groups: {
      create: groupCreate,
      update: groupUpdate,
      remove: groupDelete,
    },
    runs: {
      byTask: runsByTask,
      cancel: runCancel,
    },
    session: {
      load: sessionLoad,
      loadMore: sessionLoadMore,
      image: sessionImage,
      close: sessionClose,
    },
    scheduler: {
      status: schedulerStatus,
      pause: schedulerPause,
      resume: schedulerResume,
    },
    importer: {
      sync: importSync,
    },
    mobile: {
      status: mobileStatus,
      syncNow: mobileSyncNow,
    },
    open: {
      terminal: openTerminal,
      resume: resumeTerminal,
      editor: openEditor,
      reveal: openFinder,
      workingDir: workingDir,
      editors: editorList,
    },
    review: {
      snapshot: reviewSnapshot,
      refresh: os.review.refresh.handler(({ input }) => app.reviews.refresh(input)),
      file: reviewFile,
      comment: reviewComment,
      openPullRequest: reviewOpenPullRequest,
      hidePullRequest: reviewHidePullRequest,
      closePullRequest: reviewClosePullRequest,
    },
    report: {
      get: reportGet,
      generate: reportGenerate,
      show: reportShow,
      hide: reportHide,
    },
    terminal: {
      open: terminalOpen,
      input: terminalInput,
      resize: terminalResize,
      runProjectTask: terminalRunProjectTask,
      close: terminalClose,
    },
  })

}

export { broadcast } from './events.js'

export { EVENTS }

/** Hand only authenticated windows' ports to oRPC. The official adapter parses requests and responds. */
export function registerIpc(app: QuuuApp): void {
  const handler = new RPCHandler(createAppRouter(app))
  ipcMain.removeAllListeners(RPC_CONNECT)
  ipcMain.on(RPC_CONNECT, event => {
    try {
      const owner = ownerOf(event)
      if (event.ports.length !== 1) throw new Error('A connection needs exactly one port')
      const [port] = event.ports
      handler.upgrade(port, { context: { owner } })
      const release = releaseWithWindow(owner, () => port.close())
      port.once('close', release)
      port.start()
    } catch (error) {
      for (const port of event.ports) port.close()
      console.error('IPC connection could not be accepted', error)
    }
  })
}
