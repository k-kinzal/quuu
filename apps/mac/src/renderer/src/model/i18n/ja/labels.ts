import type { labels as enLabels } from '../en/labels.js'

export const labels: typeof enLabels = {
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
  }
}
