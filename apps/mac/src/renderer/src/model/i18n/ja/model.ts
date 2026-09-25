import type { model as en } from '../en/model.js'

export const model: typeof en = {
  session: {
    role: {
      user: 'あなた',
      assistant: 'エージェント',
      system: 'ログ'
    },
    verb: {
      create: '作成',
      edit: '編集',
      read: '読取',
      run: '実行',
      output: '出力',
      search: '検索',
      list: '一覧',
      delegate: '委譲',
      fetch: '取得',
      plan: '計画',
      input: '入力',
      wait: '待機',
      image: '画像',
      call: '呼出'
    }
  },
  operationFailure: {
    op: {
      snapshot: '画面の読み込み',
      projects: {
        list: 'プロジェクトの読み込み',
        create: 'プロジェクトの追加',
        update: 'プロジェクトの変更',
        remove: 'プロジェクトの削除'
      },
      tasks: {
        create: 'タスクの追加',
        update: 'タスクの変更',
        enqueue: '待機列への追加',
        unqueue: '下書きへの変更',
        hold: 'タスクの保留',
        runNow: 'タスクの実行',
        markDone: 'タスクの完了',
        reopen: 'タスクの再オープン',
        sendBack: 'タスクの差し戻し',
        cancel: 'タスクの中断',
        remove: 'タスクの削除',
        archive: 'タスクのアーカイブ',
        send: '指示の送信',
        clearReserved: '送信予約の取消'
      },
      rules: {
        preview: '自動タスクの確認',
        create: '自動タスクの追加',
        update: '自動タスクの変更',
        remove: '自動タスクの削除',
        enqueue: '自動タスクの実行'
      },
      agents: {
        defaults: 'エージェント設定の読み込み',
        create: 'エージェントの追加',
        update: 'エージェントの変更',
        duplicate: 'エージェントの複製',
        resetLimit: 'Limit の解除',
        remove: 'エージェントの削除'
      },
      groups: {
        create: 'グループの追加',
        update: 'グループの変更',
        remove: 'グループの削除'
      },
      runs: {
        byTask: '実行履歴の読み込み',
        cancel: '実行の中断'
      },
      session: {
        close: '会話の購読解除',
        load: '会話の読み込み',
        loadMore: '以前の会話の読み込み',
        image: '画像の読み込み'
      },
      scheduler: {
        status: '稼働状況の読み込み',
        pause: 'スケジューラの一時停止',
        resume: 'スケジューラの再開'
      },
      settings: {
        previewIdentity: 'コミット名義の確認',
        setIdentity: 'コミット名義の保存',
        get: '設定の読み込み',
        set: '設定の保存',
        lookupBotUser: 'GitHub のユーザー確認',
        createGitHubApp: 'GitHub App の設定',
        cancelGitHubApp: 'GitHub App 設定の中止'
      },
      mobile: {
        status: '同期状態の読み込み',
        syncNow: 'iPhone との同期'
      },
      importer: {
        sync: 'セッションの取り込み'
      },
      open: {
        terminal: 'ターミナルの起動',
        resume: 'ターミナルでの再開',
        editor: 'エディタの起動',
        reveal: 'Finder での表示',
        workingDir: '作業場所の取得',
        editors: 'エディタ一覧の取得'
      },
      review: {
        snapshot: 'レビューの読み込み',
        file: 'ファイルの読み込み',
        comment: 'コメントの送信',
        openPullRequest: 'PR の表示',
        hidePullRequest: 'PR の表示切替',
        closePullRequest: 'PR の終了'
      },
      report: {
        get: 'レポートの読み込み',
        generate: 'レポート作成の開始',
        show: 'レポートの表示',
        hide: 'レポートの非表示'
      },
      terminal: {
        open: '内蔵ターミナルの起動',
        input: 'ターミナルへの入力',
        resize: 'ターミナルの表示変更',
        runProjectTask: 'プロジェクトタスクの実行',
        close: 'ターミナルの終了'
      },
      system: {
        windowLayout: '画面の読み込み',
        scrollSwipes: 'トラックパッド設定の読み込み',
        pickDirectory: 'フォルダの選択',
        pickApplication: 'アプリの選択',
        confirm: '確認画面の表示',
        popupMenu: 'メニューの表示',
        reveal: 'Finder での表示',
        openExternal: 'リンクの表示',
        copy: 'コピー'
      }
    },
    failed: '{{operation}}に失敗しました',
    fallbackOperation: '操作',
    badRequest: '操作の内容を受け付けられませんでした。',
    forbidden: 'アプリとの接続が無効になりました。画面を開き直してください。',
    internal: 'アプリの処理に問題が発生しました。操作は自動で再実行しません。',
    unknown: '操作の途中で問題が発生しました。'
  },
  table: {
    column: {
      title: 'タスク',
      project: 'プロジェクト',
      priority: '優先',
      agent: 'エージェント',
      state: '状態',
      lastRun: '最終実行'
    },
    axis: {
      status: '状態',
      project: 'プロジェクト',
      priority: '優先',
      target: 'エージェント'
    },
    deletedProject: '（削除済み）',
    includeDone: '完了を含む'
  },
  derive: {
    unassigned: '未割り当て',
    deleted: '（削除済み）',
    issue: {
      disabled: 'プロジェクトが停止中',
      noTarget: '実行対象が未割り当て',
      targetMissing: '割り当てたエージェント / グループが見つからない',
      noUsableAgent: '実行対象に有効なエージェントが無い'
    }
  },
  format: {
    justNow: 'たった今',
    secondsAgo_one: '{{count}}秒前',
    secondsAgo_other: '{{count}}秒前',
    minutesAgo_one: '{{count}}分前',
    minutesAgo_other: '{{count}}分前',
    hoursAgo_one: '{{count}}時間前',
    hoursAgo_other: '{{count}}時間前',
    durationSeconds: '{{seconds}}秒',
    durationMinutes: '{{minutes}}分{{seconds}}秒',
    durationHours: '{{hours}}時間{{minutes}}分'
  },
  planSummary: {
    steps_one: '{{count}} 件',
    steps_other: '{{count}} 件',
    progress: '{{text}} （{{done}}/{{total}}）'
  },
  executionFeedback: {
    starting: 'エージェントを起動中',
    running: 'エージェント実行中'
  },
  taskLink: {
    dependency: '先行タスク',
    chooseDependency: '先行タスクを選択',
    searchDependencies: 'タスク名・プロジェクト名で検索…',
    noDependencies: '先行タスクの候補がありません',
    direction: {
      after: '後に続くタスク',
      before: '先に終わらせるタスク'
    },
    suffix: {
      after: 'の後',
      before: 'より先'
    },
    linkFailed: 'つなげられませんでした',
    removeLink: 'つながりを外す'
  },
  openWith: {
    openFailed: '開けませんでした',
    openTerminal: 'ターミナルで開く',
    resumeCli: '{{cli}} をターミナルで再開',
    openInApp: '{{app}} で開く',
    openAnotherApp: '別のアプリで開く',
    openApp: 'アプリで開く',
    chooseApp: 'ほかのアプリを選ぶ…',
    showInFinder: 'Finder で表示',
    copyWorkingDir: '作業ディレクトリをコピー'
  },
  projectActions: {
    deleteConfirm: 'プロジェクト「{{name}}」を削除しますか？',
    deleteDetail:
      'このプロジェクトのタスクと実行履歴が消えます。ディレクトリ自体は残ります。' +
      'このディレクトリでまた作業を始めると、プロジェクトはもう一度現れます（消す前の履歴は戻りません）。',
    stop: 'このプロジェクトを止める',
    resume: 'このプロジェクトを再開する',
    delete: '削除…'
  },
  contextMenu: {
    copySelection: '選択範囲をコピー',
    copyLabel: '{{label}}をコピー',
    path: 'パス',
    showInFinder: 'Finder で表示',
    confirmDelete: '削除'
  },
  workbench: {
    change: {
      added: '新規',
      deleted: '削除',
      modified: '変更',
      renamed: '名前変更',
      copied: 'コピー',
      untracked: '未追跡',
      conflicted: '競合'
    },
    check: {
      success: 'CI 成功',
      failure: 'CI 失敗',
      pending: 'CI 実行中',
      neutral: 'CI 状態なし'
    }
  },
  projectSelect: {
    label: '追加先のプロジェクト',
    placeholder: '名前・パスで検索…',
    empty: '一致するプロジェクトがありません'
  },
  app: {
    loading: '読み込み中…',
    loadFailed: '画面を読み込めませんでした',
    retry: '再試行',
    taskNotFound: 'タスクが見つかりません',
    deleteTaskConfirm: '「{{title}}」を削除しますか？',
    deleteTaskDetail: 'このタスクと実行履歴が消えます。この操作は取り消せません。'
  }
}
