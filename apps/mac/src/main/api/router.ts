import { SessionHistory } from '../session/history.js'
import { listProjectDocuments, readProjectDocument } from '../projects/documents.js'
import * as repo from '../db/repo.js'
import { implement, ORPCError } from '@orpc/server'
import { contract } from '../../api/contract.js'
import { EVENTS } from '../../api/channels.js'
import type { SessionAppendedPayload } from '../../api/types.js'
import type { QuuuApp } from '../bootstrap.js'
import type { SessionView } from '../session/view.js'
import { savePromptFiles } from '../platform/promptFiles.js'
import { t } from '../i18n/index.js'
import { satelliteRoute, type OperationHost } from './host.js'
import { observeOperation, setTelemetry, telemetryStatus } from '../telemetry/index.js'

interface DocumentRequest {
  generation: number
  validation?: { projectId: string; url: string; allowed: Promise<boolean> }
}

export function createOperationsRouter<Owner>(app: QuuuApp, host: OperationHost<Owner>) {
  const os = implement(contract).$context<{ owner: Owner }>().use(({ context, next, path }, input, output) => {
    const name = path.join('.')
    return observeOperation(name, context.owner, host.callerOf(context.owner), input, async markForwarded => {
      host.authorize(context.owner)
      try {
        const forward = host.forwardFor?.(context.owner)
        if (forward) {
          const route = satelliteRoute(name)
          if (route === 'unavailable') throw new Error(t('network.onHost'))
          if (route === 'host') {
            markForwarded()
            return output(await forward.call(name, input))
          }
        }
        return await next()
      } catch (error) {
        console.error('Operation failed', name, error)
        if (error instanceof ORPCError) throw error
        throw new ORPCError('OPERATION_FAILED', { message: t('ipc.operationFailed'), data: { reason: error instanceof Error ? error.message : String(error) }, cause: error })
      }
    })
  })
  const sessions = new Map<Owner, SessionView>()
  const releaseSessions = new Map<Owner, () => void>()
  const terminals = new Map<Owner, Set<string>>()
  const documentRequests = new Map<Owner, DocumentRequest>()
  const documentRequest = (owner: Owner): DocumentRequest => {
    let state = documentRequests.get(owner)
    if (!state) {
      state = { generation: 0 }
      documentRequests.set(owner, state)
      const owned = state
      host.releaseWithOwner(owner, () => { owned.generation++; documentRequests.delete(owner) })
    }
    return state
  }
  const sessionFor = (owner: Owner): SessionView => {
    let view = sessions.get(owner)
    if (!view) {
      view = app.createSessionView()
      sessions.set(owner, view)
      view.watcher.on('appended', (event: SessionAppendedPayload) => { host.sendEvent(owner, EVENTS.sessionAppended, event) })
      releaseSessions.set(owner, host.releaseWithOwner(owner, () => {
        const current = sessions.get(owner)
        if (current) app.releaseSessionView(current)
        sessions.delete(owner)
        releaseSessions.delete(owner)
      }))
    }
    return view
  }
  const terminalIds = (owner: Owner): Set<string> => {
    let ids = terminals.get(owner)
    if (!ids) {
      ids = new Set()
      terminals.set(owner, ids)
      const close = (): void => { for (const id of terminals.get(owner) ?? []) app.terminal.closeWorkbenchTerminal(id); terminals.delete(owner) }
      host.releaseWithOwner(owner, close)
    }
    return ids
  }
  const requireTerminal = (owner: Owner, id: string): void => {
    if (!terminalIds(owner).has(id)) throw new Error('Not a terminal of this window')
  }
  app.terminals.on('terminal', (event: import('../terminal/types.js').TerminalEvent) => {
    for (const [owner, ids] of terminals) if (ids.has(event.sessionId)) host.sendEvent(owner, EVENTS.terminal, event)
  })
  const windowLayout = os.system.windowLayout.handler(({ context }) => host.desktopFor(context.owner).windowLayout())
  // Read on every ask, not cached: the person changes it in System Settings while Quuu keeps running
  const scrollSwipes = os.system.scrollSwipes.handler(({ context }) => host.desktopFor(context.owner).scrollSwipes())
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
  const agentResetLimit = os.agents.resetLimit.handler(({ input }) => {
    const id = input
    app.scheduler.resetAgentLimit(id)
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
  const githubBotUser = os.settings.lookupBotUser.handler(({ input, context }) => host.desktopFor(context.owner).lookupBotUser(input))
  const githubAppCreate = os.settings.createGitHubApp.handler(({ context }) => host.desktopFor(context.owner).createGitHubApp())
  const githubAppCancel = os.settings.cancelGitHubApp.handler(({ context }) => host.desktopFor(context.owner).cancelGitHubApp())

  // --- System ---
  const pickDirectory = os.system.pickDirectory.handler(({ context }) => host.desktopFor(context.owner).pickDirectory())
  /*
   * Pick a `.app`. If apps not in the list (self-built copies, ones installed
   * elsewhere) cannot be pointed at, that becomes a dead end.
   */
  const pickApplication = os.system.pickApplication.handler(({ context }) => host.desktopFor(context.owner).pickApplication())
  /*
   * Confirm irreversible operations with an OS sheet.
   *
   * The default sits on "Cancel" so hammering ⏎ cannot push a deletion through.
   * `window.confirm` defaulted to the OK side, and its buttons were Web buttons at that
   */
  const confirm = os.system.confirm.handler(({ input, context }) => host.desktopFor(context.owner).confirm(input))
  // Menus the screen shows are drawn by the OS too (a surface drawn inside the window is not a menu)
  const popupMenuRequest = os.system.popupMenu.handler(({ input, context }) => host.desktopFor(context.owner).popupMenu(input))
  const revealPath = os.system.reveal.handler(({ input, context }) => host.desktopFor(context.owner).reveal(input))
  const openExternal = os.system.openExternal.handler(({ input, context }) => host.desktopFor(context.owner).openExternal(input))
  const copyText = os.system.copy.handler(({ input, context }) => host.desktopFor(context.owner).copy(input))

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
  const openFinder = os.open.reveal.handler(async ({ input, context }) => {
    const target = input

    const place = app.workspace.locate(target)
    if (!('dir' in place)) return place
    await host.desktopFor(context.owner).reveal(place.dir)
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
  const reviewPoll = os.review.poll.handler(({ input }) => app.reviews.pollSnapshot(input.taskId, input.knownVersion))
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
  const reviewOpenPullRequest = os.review.openPullRequest.handler(({ input, context }) => host.desktopFor(context.owner).openPullRequest(input))
  const reviewHidePullRequest = os.review.hidePullRequest.handler(({ input, context }) => host.desktopFor(context.owner).hidePullRequest(input))
  const reviewClosePullRequest = os.review.closePullRequest.handler(({ input, context }) => host.desktopFor(context.owner).closePullRequest(input))
  const projectReportGet = os.report.projectGet.handler(({ input }) => app.projectReports.report(input))
  const projectReportGenerate = os.report.projectGenerate.handler(({ input }) => app.projectReports.generate(input))
  const projectReportShow = os.report.projectShow.handler(({ input, context }) => {
    const page = app.projectReports.page(input.projectId, input.historyId)
    if (!page) return { ok: false, reason: t('report.noPage') }
    return host.desktopFor(context.owner).showReport({ file: page, bounds: input.bounds })
  })
  const reportGet = os.report.get.handler(({ input }) => app.reports.report(input))
  const reportGenerate = os.report.generate.handler(({ input }) => app.reports.generate(input))
  /*
   * The renderer asks for a task's report - or one of its history entries - never for a path.
   * Which file that is stays main's answer, so a screen cannot point the view at something no
   * generation produced.
   */
  const reportShow = os.report.show.handler(({ input, context }) => {
    const page = app.reports.page(input.taskId, input.historyId)
    if (page.length === 0) return { ok: false, reason: t('report.noPage') }
    return host.desktopFor(context.owner).showReport({ file: page, bounds: input.bounds })
  })
  const reportHide = os.report.hide.handler(({ context }) => host.desktopFor(context.owner).hideReport())
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
  const history = new SessionHistory(app.db, app.sessions)
  return os.router({
    hooks: {
      resolve: os.hooks.resolve.handler(({ input }) => app.hooks.resolve(input.projectId)),
      list: os.hooks.list.handler(({ input }) => app.hooks.list(input)),
      log: os.hooks.log.handler(({ input }) => app.hooks.log(input)),
      conversation: os.hooks.conversation.handler(({ input }) => app.hooks.conversation(input)),
      image: os.hooks.image.handler(({ input }) => app.hooks.image(input.id, input.imageId)),
      cancel: os.hooks.cancel.handler(({ input }) => app.hooks.cancel(input)),
      retry: os.hooks.retry.handler(({ input }) => app.hooks.retry(input))
    },
    servers: { status: os.servers.status.handler(() => app.settings.serverStatus) },
    network: {
      status: os.network.status.handler(() => app.network.status()),
      configure: os.network.configure.handler(({ input }) => app.network.configure(input)),
      openPairing: os.network.openPairing.handler(() => app.network.openPairing()),
      removeDevice: os.network.removeDevice.handler(({ input }) => app.network.removeDevice(input)),
      pair: os.network.pair.handler(({ input }) => app.network.pair(input.address, input.code)),
      unpair: os.network.unpair.handler(() => app.network.unpair()),
    },
    logs: { page: os.logs.page.handler(({ input }) => history.page(input)) },
    runners: {
      status: os.runners.status.handler(() => app.runners.status()),
      configure: os.runners.configure.handler(({ input }) => app.runners.configure(input)),
      pairing: os.runners.pairing.handler(() => app.runners.pairing()),
      revoke: os.runners.revoke.handler(({ input }) => app.runners.revoke(input)),
      signIn: os.runners.signIn.handler(({ input }) => app.runners.signIn(input))
    },
    snapshot: snapshot,
    app: {
      info: os.app.info.handler(() => app.appControls().info()),
      checkForUpdates: os.app.checkForUpdates.handler(() => app.appControls().checkForUpdates()),
      telemetry: os.app.telemetry.handler(() => telemetryStatus()),
      setTelemetry: os.app.setTelemetry.handler(({ input }) => setTelemetry(input)),
    },
    system: {
      savePromptFiles: os.system.savePromptFiles.handler(({ input }) => savePromptFiles(input.map(file => ({ name: file.name, data: Buffer.from(file.data, 'base64') })))),
      windowLayout: windowLayout,
      scrollSwipes: scrollSwipes,
      pickDirectory: pickDirectory,
      pickApplication: pickApplication,
      confirm: confirm,
      popupMenu: popupMenuRequest,
      reveal: revealPath,
      openExternal: openExternal,
      copy: copyText,
    },
    rules: {
      list: os.rules.list.handler(() => repo.listTaskRules(app.db)),
      preview: rulePreview,
      create: ruleCreate,
      update: ruleUpdate,
      remove: ruleDelete,
      enqueue: ruleEnqueue,
    },
    agents: {
      list: os.agents.list.handler(() => repo.listAgents(app.db)),
      defaults: agentDefaults,
      create: agentCreate,
      update: agentUpdate,
      duplicate: agentDuplicate,
      resetLimit: agentResetLimit,
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
      githubWebStatus: os.settings.githubWebStatus.handler(({ context }) => host.desktopFor(context.owner).githubWebStatus()),
      githubWebSignIn: os.settings.githubWebSignIn.handler(({ context }) => host.desktopFor(context.owner).githubWebSignIn()),
      githubWebSignOut: os.settings.githubWebSignOut.handler(({ context }) => host.desktopFor(context.owner).githubWebSignOut()),
    },
    projects: {
      list: projectList,
      create: projectCreate,
      update: projectUpdate,
      remove: projectDelete,
    },
    documents: {
      list: os.documents.list.handler(({ input }) => listProjectDocuments(app.db, input)),
      read: os.documents.read.handler(({ input }) => readProjectDocument(app.db, input)),
      show: os.documents.show.handler(async ({ input, context }) => {
        const state = documentRequest(context.owner)
        const generation = ++state.generation
        if (state.validation?.projectId !== input.projectId || state.validation.url !== input.url) {
          state.validation = { projectId: input.projectId, url: input.url,
            allowed: listProjectDocuments(app.db, input.projectId).then(documents => documents.websites.some(link => link.url === input.url)) }
        }
        const allowed = await state.validation.allowed
        if (generation !== state.generation) return { ok: true }
        if (!allowed) throw new Error(t('documents.notFound'))
        return host.desktopFor(context.owner).showDocument(input)
      }),
      hide: os.documents.hide.handler(({ context }) => {
        const state = documentRequest(context.owner)
        state.generation++
        state.validation = undefined
        return host.desktopFor(context.owner).hideDocument()
      }),
      navigate: os.documents.navigate.handler(({ input, context }) => host.desktopFor(context.owner).navigateDocument(input))
    },
    tasks: {
      list: os.tasks.list.handler(({ input }) => app.tasks.listPage(input)),
      get: os.tasks.get.handler(({ input }) => { const task = app.tasks.getTask(input); if (!task) throw new Error(`Task not found: ${input}`); return task }),
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
      list: os.groups.list.handler(() => repo.listGroups(app.db)),
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
      poll: reviewPoll,
      snapshot: reviewSnapshot,
      refresh: os.review.refresh.handler(({ input }) => app.reviews.refresh(input)),
      history: os.review.history.handler(({ input }) => app.reviews.reviewHistory(input)),
      historySnapshot: os.review.historySnapshot.handler(({ input }) => app.reviews.reviewHistorySnapshot(input.taskId, input.runId)),
      file: reviewFile,
      comment: reviewComment,
      openPullRequest: reviewOpenPullRequest,
      hidePullRequest: reviewHidePullRequest,
      closePullRequest: reviewClosePullRequest,
      projectPullRequests: os.review.projectPullRequests.handler(({ input }) => app.reviews.projectPullRequests(input)),
      refreshProjectPullRequests: os.review.refreshProjectPullRequests.handler(({ input }) => app.reviews.refreshProjectPullRequests(input)),
      projectFiles: os.review.projectFiles.handler(({ input }) => app.reviews.projectFiles(input)),
      projectFile: os.review.projectFile.handler(({ input }) => app.reviews.projectFile(input.projectId, input.path, input.previousPath)),
    },
    report: {
      conversation: os.report.conversation.handler(({ input }) => app.reports.conversation(input)),
      image: os.report.image.handler(({ input }) => app.reports.image(input.id, input.imageId)),
      projectGet: projectReportGet,
      projectGenerate: projectReportGenerate,
      projectShow: projectReportShow,
      projectHistory: os.report.projectHistory.handler(({ input }) => app.projectReports.history(input)),
      get: reportGet,
      generate: reportGenerate,
      show: reportShow,
      history: os.report.history.handler(({ input }) => app.reports.history(input)),
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
