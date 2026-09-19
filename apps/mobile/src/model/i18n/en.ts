/** Filled in by the iPhone copy extraction; each top-level group is the owning view or model. */
export const en = {
  // Shared label tables (`model/labels.ts`) — same words as the Mac for the same states.
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
  addAction: {
    draft: 'Add as draft',
    held: 'Add held',
    queued: 'Add',
    now: 'Run now'
  },
  scope: {
    all: 'All tasks',
    review: 'Needs review'
  },
  time: {
    justNow: 'Just now',
    minutesAgo_one: '{{count}} minute ago',
    minutesAgo_other: '{{count}} minutes ago',
    hoursAgo_one: '{{count}} hour ago',
    hoursAgo_other: '{{count}} hours ago',
    daysAgo_one: '{{count}} day ago',
    daysAgo_other: '{{count}} days ago'
  },
  tabs: {
    list: 'Tasks',
    compose: 'Add',
    settings: 'Settings'
  },
  screen: {
    back: 'Back'
  },
  sheet: {
    close: 'Close'
  },
  composer: {
    send: 'Send'
  },
  store: {
    loadFailed: "Couldn't load"
  },
  bridge: {
    shellUpdateRequired: 'The iPhone app itself needs updating'
  },
  listView: {
    title: 'Tasks',
    syncFailed: "Couldn't sync",
    rejected: 'Not applied',
    open: 'Open',
    close: 'Close',
    loading: 'Loading',
    needsAccess: 'iCloud access needed',
    allow: 'Allow',
    loadFailed: "Couldn't load",
    retry: 'Retry',
    waitingForMac: 'Waiting for the Mac to export',
    fetchingFromCloud: "Fetching the Mac's export from iCloud",
    syncNow: 'Sync Now',
    emptyAll: 'No tasks',
    emptyScope: 'No tasks in {{scope}}',
    showAll: 'Show All Tasks',
    omittedDone: '{{count}} more',
    done: 'Done',
    archive: 'Archive',
    waitingToSend: 'Waiting to send',
    sendWhenFinished: 'Send when finished',
    notSynced: 'Not synced'
  },
  taskView: {
    title: 'Task',
    notFound: 'Not found',
    actions: 'Actions',
    markDone: 'Mark Done',
    queue: 'Queue',
    hold: 'Hold',
    archive: 'Archive',
    sendWhenFinished: 'Send when finished',
    sendBackPlaceholder: 'Add a note and send back',
    loading: 'Loading',
    fetchingFromCloud: 'Fetching the conversation from iCloud',
    noConversation: 'No conversation yet',
    you: 'You',
    agent: 'Agent',
    system: 'System',
    tools_one: '{{count}} tool',
    tools_other: '{{count}} tools',
    sendNextRun: 'Send on the next run',
    notSynced: 'Not synced'
  },
  composeView: {
    title: 'New Task',
    howToAdd: 'How to add',
    addFailed: "Couldn't add",
    writeFailed: "Couldn't write to iCloud",
    titlePlaceholder: 'Task name',
    promptPlaceholder: 'Instructions for the agent...',
    project: 'Project',
    priority: 'Priority'
  },
  settingsView: {
    title: 'Settings',
    syncFailed: "Couldn't sync",
    sync: 'Sync',
    macUpdated: 'Mac last updated',
    phoneSynced: 'iPhone last synced',
    syncing: 'Syncing',
    resync: 'Sync Now'
  }
}
