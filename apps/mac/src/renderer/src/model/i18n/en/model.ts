/** Filled in by the model extraction; each top-level group is the owning component or model. */
export const model = {
  session: {
    role: {
      user: 'You',
      assistant: 'Agent',
      system: 'Log'
    },
    verb: {
      create: 'Create',
      edit: 'Edit',
      read: 'Read',
      run: 'Run',
      output: 'Output',
      search: 'Search',
      list: 'List',
      delegate: 'Delegate',
      fetch: 'Fetch',
      plan: 'Plan',
      input: 'Input',
      wait: 'Wait',
      image: 'Image',
      call: 'Call'
    }
  },
  operationFailure: {
    op: {
      snapshot: 'load the screen',
      projects: {
        list: 'load projects',
        create: 'add the project',
        update: 'update the project',
        remove: 'delete the project'
      },
      tasks: {
        create: 'add the task',
        update: 'update the task',
        enqueue: 'queue the task',
        unqueue: 'move the task back to draft',
        hold: 'hold the task',
        runNow: 'run the task',
        markDone: 'mark the task done',
        reopen: 'reopen the task',
        sendBack: 'send the task back',
        cancel: 'cancel the task',
        remove: 'delete the task',
        archive: 'archive the task',
        send: 'send the instructions',
        clearReserved: 'cancel the reserved send'
      },
      rules: {
        preview: 'preview the automation',
        create: 'add the automation',
        update: 'update the automation',
        remove: 'delete the automation',
        enqueue: 'run the automation'
      },
      agents: {
        defaults: 'load agent defaults',
        create: 'add the agent',
        update: 'update the agent',
        duplicate: 'duplicate the agent',
        remove: 'delete the agent'
      },
      groups: {
        create: 'add the group',
        update: 'update the group',
        remove: 'delete the group'
      },
      runs: {
        byTask: 'load run history',
        cancel: 'cancel the run'
      },
      session: {
        close: 'unsubscribe from the conversation',
        load: 'load the conversation',
        loadMore: 'load earlier conversation',
        image: 'load the image'
      },
      scheduler: {
        status: 'load scheduler status',
        pause: 'pause the scheduler',
        resume: 'resume the scheduler'
      },
      settings: {
        previewIdentity: 'preview the commit identity',
        setIdentity: 'save the commit identity',
        get: 'load settings',
        set: 'save settings',
        lookupBotUser: 'look up the GitHub user',
        createGitHubApp: 'set up the GitHub App',
        cancelGitHubApp: 'cancel the GitHub App setup'
      },
      mobile: {
        status: 'load sync status',
        syncNow: 'sync with the iPhone'
      },
      importer: {
        sync: 'import sessions'
      },
      open: {
        terminal: 'open the terminal',
        resume: 'resume in the terminal',
        editor: 'open the editor',
        reveal: 'show in Finder',
        workingDir: 'get the working directory',
        editors: 'list editors'
      },
      review: {
        snapshot: 'load the review',
        file: 'load the file',
        comment: 'send the comment',
        openPullRequest: 'open the PR',
        hidePullRequest: 'toggle the PR',
        closePullRequest: 'close the PR'
      },
      report: {
        get: 'load the report',
        generate: 'start writing the report',
        show: 'show the report',
        hide: 'hide the report'
      },
      terminal: {
        open: 'open the built-in terminal',
        input: 'send input to the terminal',
        resize: 'resize the terminal',
        runProjectTask: 'run the project task',
        close: 'close the terminal'
      },
      system: {
        windowLayout: 'load the screen',
        pickDirectory: 'choose a folder',
        pickApplication: 'choose an app',
        confirm: 'show the confirmation',
        popupMenu: 'show the menu',
        reveal: 'show in Finder',
        openExternal: 'open the link',
        copy: 'copy'
      }
    },
    failed: 'Failed to {{operation}}',
    fallbackOperation: 'complete the operation',
    badRequest: 'The request could not be accepted.',
    forbidden: 'The connection to the app is no longer valid. Reopen the window.',
    internal: 'Something went wrong in the app. The operation will not be retried automatically.',
    unknown: 'Something went wrong during the operation.'
  },
  table: {
    column: {
      title: 'Task',
      project: 'Project',
      priority: 'Priority',
      agent: 'Agent',
      state: 'Status',
      lastRun: 'Last run'
    },
    axis: {
      status: 'Status',
      project: 'Project',
      priority: 'Priority',
      target: 'Agent'
    },
    deletedProject: '(deleted)',
    includeDone: 'Including done'
  },
  derive: {
    unassigned: 'Unassigned',
    deleted: '(deleted)',
    issue: {
      disabled: 'Project stopped',
      noTarget: 'No run target assigned',
      targetMissing: 'Assigned agent / group not found',
      noUsableAgent: 'No enabled agent in the run target'
    }
  },
  format: {
    justNow: 'Just now',
    secondsAgo_one: '{{count}} second ago',
    secondsAgo_other: '{{count}} seconds ago',
    minutesAgo_one: '{{count}} minute ago',
    minutesAgo_other: '{{count}} minutes ago',
    hoursAgo_one: '{{count}} hour ago',
    hoursAgo_other: '{{count}} hours ago',
    durationSeconds: '{{seconds}}s',
    durationMinutes: '{{minutes}}m {{seconds}}s',
    durationHours: '{{hours}}h {{minutes}}m'
  },
  planSummary: {
    steps_one: '{{count}} step',
    steps_other: '{{count}} steps',
    progress: '{{text}} ({{done}}/{{total}})'
  },
  executionFeedback: {
    starting: 'Starting the agent',
    running: 'Agent running'
  },
  taskLink: {
    dependency: 'Dependency',
    chooseDependency: 'Choose preceding task',
    searchDependencies: 'Search tasks or projects...',
    noDependencies: 'No preceding tasks found',
    direction: {
      after: 'Task that follows',
      before: 'Task that comes first'
    },
    suffix: {
      after: 'after',
      before: 'before'
    },
    linkFailed: "Couldn't link the tasks",
    removeLink: 'Remove Link'
  },
  openWith: {
    openFailed: "Couldn't open",
    openTerminal: 'Open in Terminal',
    resumeCli: 'Resume {{cli}} in Terminal',
    openInApp: 'Open in {{app}}',
    openAnotherApp: 'Open in Another App',
    openApp: 'Open in App',
    chooseApp: 'Choose Another App…',
    showInFinder: 'Show in Finder',
    copyWorkingDir: 'Copy Working Directory'
  },
  projectActions: {
    deleteConfirm: 'Delete the project "{{name}}"?',
    deleteDetail:
      "This project's tasks and run history will be deleted. The directory itself remains. " +
      'If you start working in this directory again, the project will reappear (the deleted history will not come back).',
    stop: 'Stop This Project',
    resume: 'Resume This Project',
    delete: 'Delete…'
  },
  contextMenu: {
    copySelection: 'Copy Selection',
    copyLabel: 'Copy {{label}}',
    path: 'Path',
    showInFinder: 'Show in Finder',
    confirmDelete: 'Delete'
  },
  workbench: {
    change: {
      added: 'Added',
      deleted: 'Deleted',
      modified: 'Modified',
      renamed: 'Renamed',
      copied: 'Copied',
      untracked: 'Untracked',
      conflicted: 'Conflicted'
    },
    check: {
      success: 'CI passed',
      failure: 'CI failed',
      pending: 'CI running',
      neutral: 'No CI status'
    }
  },
  projectSelect: {
    label: 'Add to project',
    placeholder: 'Search by name or path…',
    empty: 'No matching projects'
  },
  app: {
    loading: 'Loading…',
    loadFailed: "Couldn't load the screen",
    retry: 'Retry',
    taskNotFound: 'Task not found',
    deleteTaskConfirm: 'Delete "{{title}}"?',
    deleteTaskDetail: 'This task and its run history will be deleted. This cannot be undone.'
  }
}
