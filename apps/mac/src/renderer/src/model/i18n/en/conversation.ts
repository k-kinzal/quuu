/** Filled in by the conversation extraction; each top-level group is the owning component or model. */
export const conversation = {
  chat: {
    pane: 'Conversation',
    loading: 'Loading...',
    runFailed: 'Run failed',
    noFailureReason: 'No reason was recorded',
    noPromptYet: 'No instructions yet',
    writePrompt: 'Write Instructions',
    noSessionLog: 'No session log yet',
    openRunLog: 'Open Run Log',
    loadEarlier: 'Load Earlier Messages ({{total}} total)',
    loadNewer: 'Load Newer Messages',
    jumpToLatest: 'Jump to Latest'
  },
  promptFiles: {
    save: 'save attached files',
    failed: 'Could not attach files'
  },
  composer: {
    pane: 'Write instructions',
    action: {
      reserve: 'Send Later',
      append: 'Append',
      run: 'Run',
      sendBack: 'Send Back',
      rerun: 'Run Again',
      resume: 'Resume'
    },
    reservedBadge: {
      scheduled: 'Scheduled',
      unsent: 'Unsent'
    },
    sendNow: 'Send Now',
    cancelReserved: 'Cancel reservation',
    placeholder: {
      running: 'Write a follow-up...',
      append: 'Add to the instructions...',
      first: 'Instructions for the agent...',
      followup: 'Write the next instruction...'
    },
    workingDirectory: 'Working Directory',
    unassigned: 'Unassigned',
    agentChip: 'Agent for this task',
    pinned: 'Pinned',
    agentMenuHeader: 'Use for This Task',
    followProject: 'Follow Project Assignment ({{target}})',
    priority: 'Priority',
    openInFinder: 'Open in Finder',
    cancel: 'Cancel',
    menuFallback: 'Menu',
    permission: {
      unassigned: 'Unassigned',
      noAgent: 'No agent decided',
      noMode: 'No permission mode',
      noModeDetail: "No --permission-mode in {{name}}'s args template",
      modeDetail: "Permission mode set in {{name}}'s args template"
    }
  },
  pendingTurn: {
    followupLabel: 'Follow-up to send on the next run',
    promptLabel: 'Instructions to send on the next run',
    waiting: 'Waiting to run',
    unsent: 'Unsent',
    revert: 'Revert',
    save: 'Save',
    edit: 'Edit',
    discard: 'Discard'
  },
  toolCluster: {
    input: 'Input',
    result: 'Result',
    filePath: 'File Path',
    copyCommand: 'Copy Command',
    copyTarget: 'Copy Target',
    copyInput: 'Copy Input',
    copyResult: 'Copy Result',
    failed: 'Failed',
    running: 'Running',
    truncated: '... (truncated)',
    showMore_one: 'Show {{count}} More',
    showMore_other: 'Show {{count}} More'
  },
  thinking: {
    hide: 'Hide Thinking',
    show: 'Thinking ({{chars}} chars)'
  },
  sessionTurn: {
    copyMessage: 'Copy This Message',
    copyThinking: 'Copy Thinking',
    subagent: 'Subagent'
  },
  messageBody: {
    copyCode: 'Copy Code'
  },
  editableBody: {
    saveFailed: 'Could not save changes'
  },
  sessionImages: {
    missing: 'Image unavailable',
    image: 'Image'
  },
  promptSection: {
    copyPrompt: 'Copy This Instruction'
  },
  rendererBoundary: {
    title: 'The screen could not be displayed',
    reload: 'Reload'
  }
}
