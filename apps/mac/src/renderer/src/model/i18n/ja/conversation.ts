import type { conversation as en } from '../en/conversation.js'

export const conversation: typeof en = {
  chat: {
    loadNewer: '新しいメッセージを読み込む',
    pane: '会話',
    loading: '読み込み中…',
    runFailed: '実行に失敗しました',
    noFailureReason: '原因は記録されていません',
    noPromptYet: 'まだ指示が無い',
    writePrompt: '指示を書く',
    noSessionLog: 'セッションログがまだ無い',
    openRunLog: '実行ログを開く',
    loadEarlier: 'さらに過去を読み込む（全 {{total}} 件）',
    jumpToLatest: '最新へ'
  },
  promptFiles: {
    save: '添付ファイルの保存',
    failed: 'ファイルを添付できませんでした'
  },
  composer: {
    pane: '指示を書く',
    action: {
      reserve: '送信予約',
      append: '追記',
      run: '実行',
      sendBack: '差し戻す',
      rerun: '再実行',
      resume: '再開'
    },
    reservedBadge: {
      scheduled: '送信予約',
      unsent: '未送信'
    },
    sendNow: 'いま送る',
    cancelReserved: '予約を取り消す',
    placeholder: {
      running: '続きを書く…',
      append: '指示に足す…',
      first: 'エージェントへの指示…',
      followup: '続きを指示する…'
    },
    workingDirectory: '作業ディレクトリ',
    unassigned: '未割り当て',
    agentChip: 'このタスクで使うエージェント',
    pinned: '固定',
    agentMenuHeader: 'このタスクで使う',
    followProject: 'プロジェクトの割り当てに従う（{{target}}）',
    priority: '優先度',
    openInFinder: 'Finder で開く',
    cancel: '中断',
    menuFallback: 'メニュー',
    permission: {
      unassigned: '未割り当て',
      noAgent: 'エージェントが未決定',
      noMode: '権限指定なし',
      noModeDetail: '{{name}} の引数テンプレートに --permission-mode が無い',
      modeDetail: '{{name}} の引数テンプレートで指定されている権限モード'
    }
  },
  pendingTurn: {
    followupLabel: '次の実行で送る追記',
    promptLabel: '次の実行で送る指示',
    waiting: '実行待ち',
    unsent: '未送信',
    revert: '元に戻す',
    save: '確定',
    edit: '編集',
    discard: '取り消す'
  },
  toolCluster: {
    input: '入力',
    result: '結果',
    filePath: 'ファイルのパス',
    copyCommand: 'コマンドをコピー',
    copyTarget: '対象をコピー',
    copyInput: '入力をコピー',
    copyResult: '結果をコピー',
    failed: '失敗',
    running: '実行中',
    truncated: '… (省略)',
    showMore_one: 'ほか {{count}} 件を表示',
    showMore_other: 'ほか {{count}} 件を表示'
  },
  thinking: {
    hide: '思考を隠す',
    show: '思考 {{chars}} 字'
  },
  sessionTurn: {
    copyMessage: 'この発言をコピー',
    copyThinking: '思考をコピー',
    subagent: 'サブエージェント'
  },
  messageBody: {
    copyCode: 'コードをコピー'
  },
  editableBody: {
    saveFailed: '変更を保存できませんでした'
  },
  sessionImages: {
    missing: '画像を表示できません',
    image: '画像'
  },
  promptSection: {
    copyPrompt: 'この指示をコピー'
  },
  rendererBoundary: {
    title: '画面を表示できませんでした',
    reload: '画面を再読み込み'
  }
}
