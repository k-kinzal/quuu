import type { en } from './en.js'

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
  logAdapter: {
    claude: 'Claude Code (~/.claude のセッションログ)',
    codex: 'Codex (~/.codex のセッションログ)',
    cursor: 'Cursor (~/.cursor/chats のセッションログ)',
    grok: 'Grok (~/.grok/sessions のセッションログ)',
    copilot: 'GitHub Copilot (~/.copilot のセッションログ)',
    stdout: '標準出力ログ'
  },
  groupStrategy: {
    priority: '定義順に空きを探す',
    'round-robin': '順番に振り分ける',
    'least-busy': '最も空いているものを選ぶ'
  },
  runErrorKind: {
    limit: 'Limit / レート制限',
    auth: '認証エラー',
    timeout: 'タイムアウト',
    spawn: '起動失敗',
    'nonzero-exit': '異常終了',
    orphaned: 'プロセス消失',
    canceled: '中断',
    'no-agent': 'エージェント未解決'
  },
  commitIdentityMode: {
    inherit: 'アプリの設定に従う',
    off: '名義を渡さない',
    custom: 'このプロジェクトの App'
  },
  addAction: {
    draft: '下書きで追加',
    held: '保留で追加',
    queued: '追加',
    now: 'いま実行'
  },

  seed: {
    codex: 'Codex CLI。構造化されたセッションログから会話とツール実行を読む。',
    cursor: 'Cursor CLI（cursor-agent）。--resume に未使用の ID を渡すと、その ID でチャットが作られる。',
    grok: 'Grok CLI。-p の 1 回実行。継続は --resume で同じセッションへ続ける。',
    copilot: 'GitHub Copilot CLI。セッション ID を渡す引数が無いので、Quuu が起動後に実体を拾い直す。',
    opus: '既定のエージェント。Claude Code を非対話で実行する。',
    sonnet: 'Opus が Limit に達したときのフォールバック先。',
    group: 'Opus の枠が空いていればそれを使い、埋まっていれば Sonnet に回す。',
    importedAgent: '直接起動されたセッションの取り込み用。スケジューラからは使われません。'
  },
  agentCatalog: {
    stdout: '標準出力',
    external: '{{name}}（外部）'
  },
  agents: {
    copyName: '{{name}} のコピー'
  },
  importedSession: {
    title: '{{command}} セッション {{id}}'
  },

  menu: {
    about: 'Quuu について',
    settings: '設定…',
    hide: 'Quuu を隠す',
    hideOthers: 'ほかを隠す',
    showAll: 'すべてを表示',
    quit: 'Quuu を終了',
    file: 'ファイル',
    newTask: '新しいタスク',
    newProject: '新しいプロジェクト…',
    closeWindow: 'ウィンドウを閉じる',
    edit: '編集',
    undo: '取り消す',
    redo: 'やり直す',
    cut: 'カット',
    copy: 'コピー',
    paste: 'ペースト',
    selectAll: 'すべてを選択',
    findTasks: 'タスクを検索',
    contextMenu: 'コンテキストメニュー',
    task: 'タスク',
    open: '開く',
    runNow: 'いま実行',
    markDone: '完了にする',
    sendBack: '差し戻す',
    priority: '優先度',
    openTerminal: 'ターミナルで開く',
    resumeTerminal: 'ターミナルで再開',
    openEditor: 'IDE / エディタで開く',
    addAfter: '後に続くタスクを追加…',
    addBefore: '先に終わらせるタスクを追加…',
    archive: 'アーカイブ',
    delete: '削除…',
    go: '移動',
    goAnywhere: 'どこへでも移動…',
    allTasks: '全タスク',
    needsReview: '要レビュー',
    projects: 'プロジェクト',
    noProjectsYet: 'まだありません',
    view: '表示',
    closeDetail: '閉じて一覧を最大化',
    panels: 'パネル',
    railPanel: 'メニュー',
    listPanel: '一覧',
    inspectorPanel: '情報パネル',
    focus: 'フォーカス',
    prevPane: '前の面',
    nextPane: '次の面',
    projectSettings: 'プロジェクト設定…',
    zoom: '表示倍率',
    actualSize: '実際のサイズ',
    zoomIn: '拡大',
    zoomOut: '縮小',
    fullScreen: 'フルスクリーン',
    develop: '開発',
    reload: '再読み込み',
    devTools: '開発者ツール',
    window: 'ウインドウ',
    minimize: 'しまう',
    zoomWindow: '拡大／縮小',
    bringAllToFront: 'すべてを手前に移動',
    help: 'ヘルプ',
    howToUse: 'Quuu の使い方（README）',
    openDataFolder: 'ログとデータの場所を開く'
  },

  contextMenu: {
    undo: '取り消す',
    redo: 'やり直す',
    cut: 'カット',
    copy: 'コピー',
    paste: 'ペースト',
    selectAll: 'すべてを選択',
    copyImage: '画像をコピー',
    openLink: 'リンクをブラウザで開く',
    copyLink: 'リンクをコピー',
    back: '戻る',
    forward: '進む',
    reload: '再読み込み',
    openPage: 'ページをブラウザで開く',
    copyPageUrl: 'ページのURLをコピー',
    inspect: '要素を検証'
  },

  notification: {
    failedTitle: 'Quuu — 失敗',
    reviewTitle: 'Quuu — レビュー待ち'
  },

  tasks: {
    notFound: 'タスクが見つかりません',
    projectNotFound: 'プロジェクトが見つかりません',
    emptyMessage: 'メッセージが空です',
    dependencyCycle: '依存が循環します',
    newSessionToast: '新しいセッションで実行します: {{title}}',
    newSessionDetail: '{{reason}}。前の会話は続けられないため、指示を畳んで最初から走らせます',
    sessionOwnerUnavailable: 'セッションを開いた {{owner}} が使えません',
    noContinuableSession: '続けられるセッションがありません',
    createStatusInvalid: '作成時の状態は下書き・保留・待機中です',
    editWhileRunning: '実行中は送る内容を変更できません',
    holdWhileRunning: '実行中のタスクは保留にできません'
  },

  resolveFailure: {
    'no-target': '実行対象のエージェントが割り当てられていません',
    'target-missing': '割り当てられたエージェント / グループが見つかりません',
    'no-usable-agent': '有効なエージェントがありません',
    'no-continuable-agent': 'セッションを開いたエージェントが使えません',
    'all-busy': 'エージェントの実行枠が埋まっています',
    'all-cooling': 'エージェントが Limit クールダウン中です',
    'all-reserved': '実行枠が別のタスクに確保されています',
    'fallback-full': 'フォールバック先に引き継げる枠が残っていません'
  },

  scheduler: {
    automationEvalFailed: '自動タスクを評価できませんでした',
    waitingOnBlocker: '{{task}}: 「{{blocker}}」待ち',
    waitingOnBlockerMore: '{{task}}: 「{{blocker}}」 ほか{{count}}件待ち',
    holderName: '「{{title}}」',
    holderNameMore: '「{{title}}」 ほか {{count}} 件',
    anotherTask: '別のタスク',
    slotHeldByTask: '{{project}}: {{holder}}が P0 として枠を確保中',
    concurrencyLimit: '{{project}}: 同時実行上限 ({{max}})',
    slotHeld: '{{holder}}が P0 として実行枠を確保中です',
    sentReserved: '予約したメッセージを送信: {{title}}',
    reviewToast: 'レビュー待ち: {{title}}',
    failedToast: '失敗: {{title}}',
    alreadyRunning: 'すでに実行中です',
    projectDisabled: 'プロジェクトが無効化されています',
    cooldownUntil: '{{agent}} が Limit クールダウン中（{{time}} 復帰）',
    paused: 'スケジューラは一時停止中です',
    moreStuck_one: 'ほか {{count}} 件が同じ理由で止まっています',
    moreStuck_other: 'ほか {{count}} 件が同じ理由で止まっています',
    queueEmptyHeld: 'キューは空です（保留 {{count}} 件）'
  },

  run: {
    canceled: '中断されました',
    timedOut: 'タイムアウトしました',
    limitReached: 'Limit に達しました',
    signalExit: 'シグナル {{signal}} で終了しました',
    commandNotFound: 'コマンドが見つかりません',
    exitCode: '終了コード {{code}}',
    unknownCode: '不明',
    projectDirMissing: 'プロジェクトのディレクトリが存在しません: {{path}}',
    orphanedOnRestart: 'アプリの再起動時にプロセスが見つかりませんでした'
  },

  workspace: {
    noReopenableSession: 'このタスクには開き直せるセッションがありません',
    noEditorConfigured: '開く IDE / エディタが設定されていません',
    unknownWorkingDir: '作業ディレクトリが分かりません',
    dirMissing: 'ディレクトリがありません: {{dir}}',
    appMissing: 'アプリが見つかりません: {{path}}'
  },

  review: {
    recordedPullRequest: 'Pull Request #{{number}}',
    tabUnidentified: 'Pull Request のタブを識別できません',
    githubOnly: 'GitHub の Pull Request だけを開けます',
    viewAreaUnreadable: 'Pull Request の表示領域を読めません',
    fetchFailed: 'Pull Request を取得できませんでした',
    filePathUnreadable: 'ファイルのパスを読めません',
    outsideProject: 'プロジェクトの外にあるファイルは開けません',
    taskDiffRevisionUnreadable: 'タスクの差分の版を読めません',
    taskDiffUnreadable: 'タスクの差分を読めません',
    fileMissingInRevision: 'この版にファイルがありません',
    commitUnreadable: 'コミットを読めません',
    pullRequestUnreadable: 'Pull Request を読めません',
    repositoryNotFound: 'GitHub のリポジトリが見つかりません',
    emptyComment: 'コメントを入力してください',
    pullRequestUnselectable: 'Pull Request を選べません',
    lineUnselectable: 'コメントする行を選べません',
    pullRequestRevisionUnreadable: 'Pull Request の版を読めません',
    commentFailed: 'コメントを送信できませんでした',
    commandFailed: 'コマンドを実行できませんでした'
  },

  report: {
    language: '日本語',
    failedToast: '「{{title}}」のレポートを作成できませんでした',
    turnedOff: '変更レポートは無効です',
    noAgent: '変更レポートを書くエージェントが設定されていません',
    projectTurnedOff: 'このプロジェクトでは変更レポートが無効です',
    dirMissing: '作業ディレクトリがありません（{{path}}）',
    timedOut: '{{minutes}} 分以内にレポートが終わりませんでした',
    oddExit: '生成が終了コード {{code}} で終わりました。レポートは不完全かもしれません',
    noPage: 'レポートが生成されませんでした',
    failedExit: '生成が終了コード {{code}} で終わり、レポートは生成されませんでした',
    outsideReports: '生成されたレポートだけを表示できます'
  },
  automation: {
    noConditions: '自動タスク「{{name}}」に条件がありません',
    cronUnreadableFor: '自動タスク「{{name}}」の Cron 式が読めません',
    nameRequired: '名前を入力してください',
    conditionRequired: '積む条件を 1 つ以上指定してください',
    cronUnreadable: 'Cron 式が読めません'
  },

  mobileSync: {
    readme: `Quuu

Mac の Quuu と iPhone の Quuu が、このフォルダごしにやりとりしています。

  mac/    Mac が書いています（iPhone は読むだけ）
  phone/  iPhone が書いています（Mac は読むだけ）
  app/    iPhone の画面です（Mac が書いています）

中身を手で消したり動かしたりしないでください。
このフォルダごと消した場合は、Mac の Quuu の設定から作り直せます。
`,
    intentFailed: 'iPhone の操作が反映できませんでした',
    imageOmitted: '（画像）',
    gone: 'タスクが見つかりません（Mac 側で削除されたようです）',
    wasArchived: 'アーカイブされていました',
    alreadyCreated: 'すでに作成済みです',
    alreadyGone: 'すでにありません',
    editAfterStart: '書き換える前に実行へ入っていました（{{status}}）',
    alreadyQueued: 'すでに積まれています',
    wasDone: '完了になっていました',
    alreadyStarted: 'すでに実行へ進んでいます',
    alreadyUnqueued: 'すでにキューから外れています',
    unqueueAfterStart: '外す前に実行が始まっていました',
    notInQueue: 'キューにありませんでした（{{status}}）',
    alreadyDone: 'すでに完了です',
    doneWhileRunning: '完了にする前に次の実行が始まっていました',
    notAwaitingResult: '結果を待っている状態ではありませんでした（{{status}}）',
    ranAgain: '読んだ後にもう一度実行されています。新しい結果を見てから決めてください',
    sendBackDeferred: '実行中だったので、終わったら送るように預かりました',
    alreadyArchived: 'すでにアーカイブ済みです',
    archiveWhileRunning: '実行中はアーカイブできません',
    unknownDistribution: '知らない版の配信です',
    emptyDistribution: '中身がありません',
    entryMissing: '{{entry}} がありません',
    stillArriving: 'まだ全部は届いていません',
    screensNotFound: '配る画面が見つかりません',
    screensEmpty: '配る画面が空です'
  },

  conversation: {
    undisplayable: '（表示できない内容）',
    moreFiles: '{{file}} ほか {{count}} 件',
    awaitingMore: '（続きを待つ）',
    changed: '表示している会話が変わりました'
  },

  terminal: {
    ptyHostMissing: '内蔵ターミナルの PTY ホストが見つかりません',
    ioUnavailable: '内蔵ターミナルの入出力を開けません',
    exited: 'ターミナルは終了しています',
    projectTaskNotFound: 'プロジェクトタスクが見つかりません'
  },

  ipc: {
    operationFailed: '操作を完了できませんでした'
  },

  dialog: {
    cancel: 'キャンセル',
    applications: 'アプリケーション'
  },

  githubApp: {
    slugEmpty: 'App のスラッグが空',
    connectionFailed: 'GitHub へ繋がりませんでした',
    loginNotFound: '{{login}} が見つかりませんでした',
    rateLimited: 'GitHub の回数制限に当たりました',
    badStatus: 'GitHub が {{status}} を返しました',
    responseUnreadable: 'GitHub の返事を読めませんでした',
    notBot: '{{login}} は bot ではない',
    description: 'Quuu が起動した AI エージェントの GitHub 操作に使う名義',
    canceled: '中止しました',
    browserTimedOut: 'ブラウザでの作成が終わりませんでした',
    createUnconfirmedPage: '作成を確認できませんでした',
    stateMismatch: '戻ってきた合図が合いませんでした',
    createInProgressPage: '作成はすでに進んでいます',
    installUnconfirmedPage: 'インストールを確認できませんでした',
    installUnconfirmed: 'GitHub App のインストールを確認できませんでした',
    installCheckingPage: 'インストールを確認しています',
    donePage: '設定できました。Quuu に戻ってください',
    createdInstallUnconfirmed: '作成した GitHub App のインストールを確認できませんでした',
    keyUnreadable: 'GitHub App の秘密鍵を読めませんでした',
    keySaveFailed: 'GitHub App の秘密鍵を Keychain に保存できませんでした',
    createButton: 'GitHub App を作る'
  }
}
