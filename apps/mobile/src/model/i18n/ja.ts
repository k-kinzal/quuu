import type { en } from './en.js'

// Typed against the English tree so a missing or extra Japanese key fails typecheck.
export const ja: typeof en = {
  taskStatus: {
    draft: '下書き',
    held: '保留',
    queued: '待機中',
    running: '実行中',
    review: 'レビュー待ち',
    failed: '失敗',
    done: '完了'
  },
  dependsMode: {
    done: '完了になったら',
    finished: '実行が終わったら'
  },
  runStatus: {
    starting: '起動中',
    running: '実行中',
    succeeded: '成功',
    failed: '失敗',
    limited: 'Limit',
    canceled: '中断',
    timeout: 'タイムアウト'
  },
  addAction: {
    draft: '下書きで追加',
    held: '保留で追加',
    queued: '追加',
    now: 'いま実行'
  },
  scope: {
    all: '全タスク',
    review: '要レビュー'
  },
  time: {
    justNow: 'たった今',
    minutesAgo_one: '{{count}} 分前',
    minutesAgo_other: '{{count}} 分前',
    hoursAgo_one: '{{count}} 時間前',
    hoursAgo_other: '{{count}} 時間前',
    daysAgo_one: '{{count}} 日前',
    daysAgo_other: '{{count}} 日前'
  },
  tabs: {
    list: 'タスク',
    compose: '追加',
    settings: '設定'
  },
  screen: {
    back: '戻る'
  },
  sheet: {
    close: '閉じる'
  },
  composer: {
    send: '送る'
  },
  store: {
    loadFailed: '読み込めませんでした'
  },
  bridge: {
    shellUpdateRequired: 'iPhone アプリ本体の更新が必要です'
  },
  listView: {
    title: 'タスク',
    syncFailed: '同期できませんでした',
    rejected: '反映されませんでした',
    open: '開く',
    close: '閉じる',
    loading: '読み込んでいます',
    needsAccess: 'iCloud を読む許可が要ります',
    allow: '許可する',
    loadFailed: '読み込めませんでした',
    retry: 'もう一度',
    waitingForMac: 'Mac からの書き出しを待っています',
    fetchingFromCloud: 'Mac の書き出しを iCloud から取り込んでいます',
    syncNow: '再同期',
    emptyAll: 'タスクが無い',
    emptyScope: '{{scope}}は無い',
    showAll: '全タスクを見る',
    omittedDone: 'ほか {{count}} 件',
    done: '完了',
    archive: 'アーカイブ',
    waitingToSend: '送信待ち',
    sendWhenFinished: '終わったら送る',
    notSynced: '未反映'
  },
  taskView: {
    title: 'タスク',
    notFound: 'ありません',
    actions: '操作',
    markDone: '完了にする',
    queue: '積む',
    hold: '保留にする',
    archive: 'アーカイブ',
    sendWhenFinished: '終わったら送る',
    sendBackPlaceholder: '追記して差し戻す',
    loading: '読み込んでいます',
    fetchingFromCloud: '会話を iCloud から取り込んでいます',
    noConversation: 'まだ会話がありません',
    you: 'あなた',
    agent: 'エージェント',
    system: 'システム',
    tools_one: 'ツール {{count}}',
    tools_other: 'ツール {{count}}',
    sendNextRun: '次の実行で送る',
    notSynced: '未反映'
  },
  composeView: {
    title: '新しいタスク',
    howToAdd: '追加のしかた',
    addFailed: '追加できませんでした',
    writeFailed: 'iCloud へ書けませんでした',
    titlePlaceholder: 'タスクの名前',
    promptPlaceholder: 'エージェントへの指示…',
    project: 'プロジェクト',
    priority: '優先度'
  },
  settingsView: {
    title: '設定',
    syncFailed: '同期できませんでした',
    sync: '同期',
    macUpdated: 'Mac の最終更新時刻',
    phoneSynced: 'iPhone の最終同期時刻',
    syncing: '同期中',
    resync: '再同期'
  }
}
