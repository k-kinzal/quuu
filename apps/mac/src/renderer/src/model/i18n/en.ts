import { labels } from './en/labels.js'
import { model } from './en/model.js'
import { conversation } from './en/conversation.js'
import { workbench } from './en/workbench.js'
import { panes } from './en/panes.js'
import { views } from './en/views.js'

/*
 * English is the source language. The tree is split by screen area so the
 * files stay reviewable; each top-level group inside an area file is named
 * after the component or model that owns the copy.
 */
export const en = {
  ...labels,
  ...model,
  ...conversation,
  ...workbench,
  ...panes,
  ...views
}
