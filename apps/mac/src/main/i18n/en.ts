/** Filled in by the main-process copy extraction; grouped by feature (menu, contextMenu, notification, reasons per feature). */
export const en = {
  taskStatus: {
    draft: 'Draft',
    held: 'Held',
    queued: 'Queued',
    running: 'Running',
    review: 'Review',
    failed: 'Failed',
    done: 'Done'
  },
  dependsMode: {
    done: 'When done',
    finished: 'When finished'
  },
  runStatus: {
    starting: 'Starting',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    limited: 'Limit',
    canceled: 'Canceled',
    timeout: 'Timed out'
  },
  logAdapter: {
    claude: 'Claude Code (session logs in ~/.claude)',
    codex: 'Codex (session logs in ~/.codex)',
    cursor: 'Cursor (session logs in ~/.cursor/chats)',
    grok: 'Grok (session logs in ~/.grok/sessions)',
    copilot: 'GitHub Copilot (session logs in ~/.copilot)',
    stdout: 'Standard output log'
  },
  groupStrategy: {
    priority: 'First free slot in defined order',
    'round-robin': 'Rotate in turn',
    'least-busy': 'Pick the least busy'
  },
  runErrorKind: {
    limit: 'Limit / rate limited',
    auth: 'Authentication error',
    timeout: 'Timed out',
    spawn: 'Failed to launch',
    'nonzero-exit': 'Exited with an error',
    orphaned: 'Process disappeared',
    canceled: 'Canceled',
    'no-agent': 'No agent resolved'
  },
  commitIdentityMode: {
    inherit: 'Follow the app setting',
    off: 'Do not pass an identity',
    custom: "This project's App"
  },
  addAction: {
    draft: 'Add as draft',
    held: 'Add held',
    queued: 'Add',
    now: 'Run now'
  },

  seed: {
    codex: 'Codex CLI. Reads the conversation and tool calls from its structured session log.',
    cursor: 'Cursor CLI (cursor-agent). Passing an unused ID to --resume creates a chat under that ID.',
    grok: 'Grok CLI. One run with -p. Continues the same session with --resume.',
    copilot: 'GitHub Copilot CLI. It takes no argument for a session ID, so Quuu recovers the real one after launch.',
    opus: 'The default agent. Runs Claude Code non-interactively.',
    sonnet: 'Where Opus falls back when it hits a Limit.',
    group: 'Uses an Opus slot when one is free, and passes to Sonnet when they are full.',
    importedAgent: 'For importing sessions launched directly. Never used by the scheduler.'
  },
  agentCatalog: {
    stdout: 'Standard output',
    external: '{{name}} (external)'
  },
  agents: {
    copyName: '{{name}} copy'
  },
  importedSession: {
    title: '{{command}} session {{id}}'
  },

  menu: {
    about: 'About Quuu',
    settings: 'Settings…',
    hide: 'Hide Quuu',
    hideOthers: 'Hide Others',
    showAll: 'Show All',
    quit: 'Quit Quuu',
    file: 'File',
    newTask: 'New Task',
    newProject: 'New Project…',
    closeWindow: 'Close Window',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    findTasks: 'Find Tasks',
    contextMenu: 'Context Menu',
    task: 'Task',
    open: 'Open',
    runNow: 'Run Now',
    markDone: 'Mark Done',
    sendBack: 'Send Back',
    priority: 'Priority',
    openTerminal: 'Open in Terminal',
    resumeTerminal: 'Resume in Terminal',
    openEditor: 'Open in IDE / Editor',
    addAfter: 'Add Follow-Up Task…',
    addBefore: 'Add Prerequisite Task…',
    archive: 'Archive',
    delete: 'Delete…',
    go: 'Go',
    goAnywhere: 'Go Anywhere…',
    allTasks: 'All Tasks',
    needsReview: 'Needs Review',
    projects: 'Projects',
    noProjectsYet: 'No Projects Yet',
    view: 'View',
    closeDetail: 'Close and Maximize List',
    panels: 'Panels',
    railPanel: 'Menu',
    listPanel: 'List',
    inspectorPanel: 'Inspector',
    focus: 'Focus',
    prevPane: 'Previous Pane',
    nextPane: 'Next Pane',
    projectSettings: 'Project Settings…',
    zoom: 'Zoom',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Full Screen',
    develop: 'Develop',
    reload: 'Reload',
    devTools: 'Developer Tools',
    window: 'Window',
    minimize: 'Minimize',
    zoomWindow: 'Zoom',
    bringAllToFront: 'Bring All to Front',
    help: 'Help',
    howToUse: 'Quuu Help (README)',
    openDataFolder: 'Open Logs and Data Folder'
  },

  contextMenu: {
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    copyImage: 'Copy Image',
    openLink: 'Open Link in Browser',
    copyLink: 'Copy Link',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    openPage: 'Open Page in Browser',
    copyPageUrl: 'Copy Page URL',
    inspect: 'Inspect Element'
  },

  notification: {
    failedTitle: 'Quuu - Failed',
    reviewTitle: 'Quuu - Review'
  },

  tasks: {
    notFound: 'Task not found',
    projectNotFound: 'Project not found',
    emptyMessage: 'The message is empty',
    dependencyCycle: 'The dependencies would form a cycle',
    newSessionToast: 'Running in a new session: {{title}}',
    newSessionDetail: '{{reason}}. The previous conversation cannot be continued, so the instructions are folded in and it starts over',
    sessionOwnerUnavailable: 'The {{owner}} that opened this session is unavailable',
    noContinuableSession: 'There is no session to continue',
    createStatusInvalid: 'New tasks can only be Draft, Held, or Queued',
    editWhileRunning: 'The message cannot be changed while running',
    holdWhileRunning: 'A running task cannot be held'
  },

  resolveFailure: {
    'no-target': 'No agent is assigned to run this',
    'target-missing': 'The assigned agent / group was not found',
    'no-usable-agent': 'No agent is enabled',
    'no-continuable-agent': 'The agent that opened this session is unavailable',
    'all-busy': 'All agent run slots are busy',
    'all-cooling': 'The agents are in Limit cooldown',
    'all-reserved': 'The run slots are held by another task',
    'fallback-full': 'The fallback agent has no slot left to take over'
  },

  scheduler: {
    automationEvalFailed: 'Could not evaluate automations',
    waitingOnBlocker: '{{task}}: waiting on "{{blocker}}"',
    waitingOnBlockerMore: '{{task}}: waiting on "{{blocker}}" and {{count}} more',
    holderName: '"{{title}}"',
    holderNameMore: '"{{title}}" and {{count}} more',
    anotherTask: 'another task',
    slotHeldByTask: '{{project}}: {{holder}} is holding the slot as P0',
    concurrencyLimit: '{{project}}: concurrency limit ({{max}})',
    slotHeld: '{{holder}} is holding the run slot as P0',
    sentReserved: 'Sent the reserved message: {{title}}',
    reviewToast: 'Review: {{title}}',
    failedToast: 'Failed: {{title}}',
    alreadyRunning: 'Already running',
    projectDisabled: 'The project is disabled',
    cooldownUntil: '{{agent}} is in Limit cooldown (back at {{time}})',
    paused: 'The scheduler is paused',
    moreStuck_one: '{{count}} more is stuck for the same reason',
    moreStuck_other: '{{count}} more are stuck for the same reason',
    queueEmptyHeld: 'The queue is empty ({{count}} held)'
  },

  run: {
    canceled: 'Canceled',
    timedOut: 'Timed out',
    limitReached: 'Limit reached',
    signalExit: 'Exited on signal {{signal}}',
    commandNotFound: 'Command not found',
    exitCode: 'Exit code {{code}}',
    unknownCode: 'unknown',
    projectDirMissing: 'The project directory does not exist: {{path}}',
    orphanedOnRestart: 'The process was not found when the app restarted'
  },

  workspace: {
    noReopenableSession: 'This task has no session to reopen',
    noEditorConfigured: 'No IDE / editor is set to open with',
    unknownWorkingDir: 'The working directory is unknown',
    dirMissing: 'The directory does not exist: {{dir}}',
    appMissing: 'App not found: {{path}}'
  },

  review: {
    recordedPullRequest: 'Pull request #{{number}}',
    tabUnidentified: 'Cannot identify the pull request tab',
    githubOnly: 'Only GitHub pull requests can be opened',
    viewAreaUnreadable: 'Cannot read the pull request view area',
    fetchFailed: 'Could not fetch pull requests',
    filePathUnreadable: 'Cannot read the file path',
    outsideProject: 'Files outside the project cannot be opened',
    taskDiffRevisionUnreadable: 'Cannot read the revision of the task diff',
    taskDiffUnreadable: 'Cannot read the task diff',
    fileMissingInRevision: 'The file is not in this revision',
    commitUnreadable: 'Cannot read the commit',
    pullRequestUnreadable: 'Cannot read the pull request',
    repositoryNotFound: 'GitHub repository not found',
    emptyComment: 'Enter a comment',
    pullRequestUnselectable: 'Cannot pick a pull request',
    lineUnselectable: 'Cannot pick a line to comment on',
    pullRequestRevisionUnreadable: 'Cannot read the revision of the pull request',
    commentFailed: 'Could not send the comment',
    commandFailed: 'Could not run the command'
  },

  report: {
    /** The language the report itself is written in. Handed to the generating agent, not drawn. */
    language: 'English',
    failedToast: 'The report for “{{title}}” was not written',
    turnedOff: 'Change reports are turned off',
    noAgent: 'No agent is set to write change reports',
    projectTurnedOff: 'Change reports are turned off for this project',
    dirMissing: 'The working directory is gone ({{path}})',
    timedOut: 'The report did not finish within {{minutes}} minutes',
    oddExit: 'The generator ended with code {{code}}, so the report may be incomplete',
    noPage: 'The generator wrote no report',
    failedExit: 'The generator ended with code {{code}} and wrote no report',
    outsideReports: 'Only generated reports can be shown'
  },
  automation: {
    noConditions: 'Automation "{{name}}" has no conditions',
    cronUnreadableFor: 'The cron expression of automation "{{name}}" cannot be read',
    nameRequired: 'Enter a name',
    conditionRequired: 'Specify at least one queue condition',
    cronUnreadable: 'The cron expression cannot be read'
  },

  mobileSync: {
    readme: `Quuu

Quuu on the Mac and Quuu on the iPhone talk to each other through this folder.

  mac/    written by the Mac (the iPhone only reads)
  phone/  written by the iPhone (the Mac only reads)
  app/    the iPhone's UI (written by the Mac)

Please do not delete or move anything in here by hand.
If you delete the whole folder, it can be recreated from Quuu's settings on the Mac.
`,
    intentFailed: 'An iPhone action could not be applied',
    imageOmitted: '(image)',
    gone: 'Task not found (it seems to have been deleted on the Mac)',
    wasArchived: 'It had been archived',
    alreadyCreated: 'Already created',
    alreadyGone: 'Already gone',
    editAfterStart: 'It entered execution before the edit ({{status}})',
    alreadyQueued: 'Already queued',
    wasDone: 'It had been marked done',
    alreadyStarted: 'It has already moved on to execution',
    alreadyUnqueued: 'Already off the queue',
    unqueueAfterStart: 'It started running before it could be unqueued',
    notInQueue: 'It was not in the queue ({{status}})',
    alreadyDone: 'Already done',
    doneWhileRunning: 'The next run started before it could be marked done',
    notAwaitingResult: 'It was not waiting for a result ({{status}})',
    ranAgain: 'It has run again since it was read. Check the new result before deciding',
    sendBackDeferred: 'It was running, so the message is held to send when it finishes',
    alreadyArchived: 'Already archived',
    archiveWhileRunning: 'Cannot archive while running',
    unknownDistribution: 'Unknown distribution version',
    emptyDistribution: 'It has no content',
    entryMissing: '{{entry}} is missing',
    stillArriving: 'Not everything has arrived yet',
    screensNotFound: 'The screens to distribute were not found',
    screensEmpty: 'The screens to distribute are empty'
  },

  conversation: {
    undisplayable: '(content that cannot be displayed)',
    moreFiles: '{{file}} and {{count}} more',
    awaitingMore: '(waiting for more)',
    changed: 'The displayed conversation has changed'
  },

  terminal: {
    ptyHostMissing: 'The built-in terminal PTY host was not found',
    ioUnavailable: 'Cannot open the built-in terminal I/O',
    exited: 'The terminal has exited',
    projectTaskNotFound: 'Project task not found'
  },

  ipc: {
    operationFailed: 'The operation could not be completed'
  },

  dialog: {
    cancel: 'Cancel',
    applications: 'Applications'
  },

  githubApp: {
    slugEmpty: 'The app slug is empty',
    connectionFailed: 'Could not connect to GitHub',
    loginNotFound: '{{login}} was not found',
    rateLimited: 'Hit the GitHub rate limit',
    badStatus: 'GitHub returned {{status}}',
    responseUnreadable: 'Could not read the GitHub response',
    notBot: '{{login}} is not a bot',
    description: 'Identity used for GitHub operations by AI agents Quuu launches',
    canceled: 'Canceled',
    browserTimedOut: 'The creation in the browser did not finish',
    createUnconfirmedPage: 'Could not confirm the creation',
    stateMismatch: 'The returned handshake did not match',
    createInProgressPage: 'The creation is already in progress',
    installUnconfirmedPage: 'Could not confirm the installation',
    installUnconfirmed: 'Could not confirm the GitHub App installation',
    installCheckingPage: 'Confirming the installation',
    donePage: 'All set. Return to Quuu',
    createdInstallUnconfirmed: 'Could not confirm the installation of the created GitHub App',
    keyUnreadable: 'Could not read the GitHub App private key',
    keySaveFailed: 'Could not save the GitHub App private key to the Keychain',
    createButton: 'Create GitHub App'
  }
}
