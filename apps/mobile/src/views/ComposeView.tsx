import { ActionRow, Alert, Button, Column, ContentBlock } from '@design-system/react'
import { useMemo, useState } from 'react'

import { TextArea, TextLine } from '../components/Field.js'
import { Group, GroupField, GroupPick } from '../components/GroupedList.js'
import { Screen } from '../components/Screen.js'
import { Sheet } from '../components/Sheet.js'
import { NEW_BODY, NEW_PRIORITY, NEW_PROJECT, NEW_TITLE } from '../lib/drafts.js'
import { Glyph } from '../lib/icons.js'
import { t } from '../model/i18n/index.js'
import { ADD_ACTION_LABEL, PRIORITY_LABEL } from '../model/labels.js'
import { useStore } from '../state/store.js'
import type { AddAction } from '../sync/addAction.js'
import { ADD_ACTIONS, defaultAddAction } from '../sync/addAction.js'
import { DEFAULT_PRIORITY } from '../sync/projection.js'

import type { Priority } from '../sync/task.js'
import { PRIORITIES, isPriority } from '../sync/task.js'

/**
 * A new task. **Fields to write in, attributes to pick. The words match the Mac's
 * composer.**
 *
 * Name and instructions get separate fields. They were once folded into one field with
 * a note saying "the first line is the title", but **a shape that needs an explanation
 * is the wrong shape**. With two fields, a placeholder naming each one is enough.
 *
 * Attributes (project, priority) become **rows that raise a choosing surface from the
 * bottom**. A segmented bar (`SegmentedControl`) used to sit here. Laying options out
 * horizontally breaks on two counts:
 *
 *   - projects have neither a fixed count nor fixed names, so it **always overflows
 *     the screen** (a horizontally scrollable surface appeared, names overlapped, and
 *     none could be pressed)
 *   - the bar is a part built at the Mac's density, and **falls short of the 44pt a
 *     touch surface needs**
 *
 * The list's filter already hit exactly this (`ScopeButton`) and the answer is settled
 * - **the row states what is currently chosen, and pressing raises a `Sheet`**. However
 * long a name is it clips at the row's width, and the options stack vertically at 44pt
 * or more.
 *
 * How the task lands right after being added is chosen from the bottom too, just like
 * project and priority. **The button states what will happen before it is pressed** -
 * the words and the landing come from the same source as the Mac.
 *
 * There is no cancel. The tabs are the way out, and anything half-written stays as a
 * draft.
 */
export function ComposeView({ footer }: { footer: JSX.Element }): JSX.Element {
  /*
   * Do not filter inside the selector. Return a new array on every call and zustand
   * treats it as "changed" and keeps redrawing
   */
  const allProjects = useStore((s) => s.view.projects)
  const projects = useMemo(() => allProjects.filter((p) => p.enabled), [allProjects])
  const createTask = useStore((s) => s.createTask)
  const busy = useStore((s) => s.busy)
  const drafts = useStore((s) => s.drafts)
  const setDraft = useStore((s) => s.setDraft)

  /** The choosing surface currently open. Never two at once */
  const [picking, setPicking] = useState<'project' | 'priority' | 'action' | null>(null)
  const [action, setAction] = useState<AddAction>(defaultAddAction)
  const [submitError, setSubmitError] = useState('')

  const title = drafts[NEW_TITLE] ?? ''
  const body = drafts[NEW_BODY] ?? ''
  const priority: Priority = pickPriority(drafts[NEW_PRIORITY])
  const current = drafts[NEW_PROJECT] || projects[0]?.id || ''
  const currentName = projects.find((p) => p.id === current)?.name ?? ''

  const prompt = body.trim()
  const name = title.trim()
  const submit = async (): Promise<void> => {
    if (!name || !current) return
    setSubmitError('')
    try {
      await createTask({ projectId: current, title: name, prompt, priority, action })
      // Clear only after confirming the intent persisted on the device. Clear first and a failure looks like a success.
      setDraft(NEW_TITLE, '')
      setDraft(NEW_BODY, '')
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setSubmitError(text.trim() || t('composeView.writeFailed'))
    }
  }

  return (
    <>
      <Screen
        title={t('composeView.title')}
        large
        footer={
          <Column gap="none">
            {/* The primary action spans the bar. Small and to the left, it becomes a reach */}
            <ActionRow gap="xs" align="stretch">
              <Column grow>
                <Button
                  color="primary"
                  disabled={busy || !name || !current}
                  onClick={() => void submit()}
                  fullWidth
                >
                  {ADD_ACTION_LABEL[action]}
                </Button>
              </Column>
              <Button
                color="primary"
                aria-label={t('composeView.howToAdd')}
                disabled={busy}
                onClick={() => setPicking('action')}
              >
                <Glyph name="down" step="md" />
              </Button>
            </ActionRow>
            {footer}
          </Column>
        }
      >
        <ContentBlock gap="none" placement="section">
          {submitError && (
            <ContentBlock gap="none" placement="groupNotice">
              <Alert tone="danger" title={t('composeView.addFailed')}>
                {submitError}
              </Alert>
            </ContentBlock>
          )}
          <Group>
            <GroupField>
              <TextLine
                value={title}
                onChange={(v) => setDraft(NEW_TITLE, v)}
                placeholder={t('composeView.titlePlaceholder')}
              />
            </GroupField>
            <GroupField>
              <TextArea
                value={body}
                onChange={(v) => setDraft(NEW_BODY, v)}
                rows={6}
                placeholder={t('composeView.promptPlaceholder')}
              />
            </GroupField>
          </Group>

          <Group>
            {/*
              With only one thing to choose, do not make it pressable. A surface that
              opens onto nothing but what is already chosen wastes the press.
              The row still shows - **where it will be queued should be readable before
              writing**
            */}
            <GroupPick
              label={t('composeView.project')}
              value={currentName || '—'}
              onPick={projects.length > 1 ? () => setPicking('project') : undefined}
            />
            <GroupPick
              label={t('composeView.priority')}
              value={PRIORITY_LABEL[priority]}
              onPick={() => setPicking('priority')}
            />
          </Group>
        </ContentBlock>
      </Screen>

      {picking === 'project' && (
        <Sheet<string>
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          isSelected={(v) => v === current}
          onSelect={(v) => setDraft(NEW_PROJECT, v)}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === 'priority' && (
        <Sheet<Priority>
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          isSelected={(v) => v === priority}
          onSelect={(v) => setDraft(NEW_PRIORITY, String(v))}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === 'action' && (
        <Sheet<AddAction>
          options={ADD_ACTIONS.map((value) => ({ value, label: ADD_ACTION_LABEL[value] }))}
          isSelected={(value) => value === action}
          onSelect={setAction}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}

/** Stored values are strings. Fall back to the default when unreadable (never break the screen for a draft). */
function pickPriority(raw: string | undefined): Priority {
  const value = Number(raw)
  return isPriority(value) ? value : DEFAULT_PRIORITY
}
