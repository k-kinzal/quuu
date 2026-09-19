import { labels } from './ja/labels.js'
import { model } from './ja/model.js'
import { conversation } from './ja/conversation.js'
import { workbench } from './ja/workbench.js'
import { panes } from './ja/panes.js'
import { views } from './ja/views.js'
import type { en } from './en.js'

// Typed against the English tree so a missing or extra Japanese key fails typecheck.
export const ja: typeof en = {
  ...labels,
  ...model,
  ...conversation,
  ...workbench,
  ...panes,
  ...views
}
