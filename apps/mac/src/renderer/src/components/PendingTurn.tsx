import { Badge, Button, ContentBlock, LinkButton, Row, Spacer } from '@design-system/react'
import { useRef, useState, type MouseEvent } from 'react'
import type { Task, TaskPatch } from '../../../preload/api/tasks.js'

import type { NextSend } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import { ROLE_LABEL } from '../model/session.js'
import { ICON, SquarePen, X, iconProps } from '../ui/icons.js'
import { PendingBody, TurnHead, TurnRole, Turn as TurnRoot, TurnRule } from '../ui/session.js'
import type { EditableBodyActions } from './EditableBody.js'
import { EditableBody } from './EditableBody.js'

/** Keep focus from leaving the text on press. If it leaves, the commit runs first. */
const keepFocus = (e: MouseEvent): void => e.preventDefault()

/**
 * Places an utterance not yet sent at the end of the conversation.
 *
 * Text written for a send-back (append and re-queue) is, to the person who wrote it,
 * "already said" — moving it to an attribute surface away from the conversation makes
 * them lose track of where it went. It sits in the same flow as the sent utterances,
 * marked as **not yet delivered**, and can be fixed in place.
 *
 * The edit entry point is an explicit button. Making the text itself the input (rule D's
 * inline rank) leaves it looking exactly like a quote, so **you can't tell it's editable
 * until you touch it**. The composer below "adds", so without an edit entry the means of
 * rewriting disappears from the screen.
 *
 * **When it will be delivered is not written in prose** (rule Q). That is the task's
 * status itself, which the list, the header, and the inspector already show in color,
 * shape, and words. All this says is "this one message hasn't been delivered yet",
 * and one mark suffices. The same holds while writing: commit and discard are pressable
 * buttons, not key hints.
 */
export function PendingTurn({ task, next }: { task: Task; next: NextSend }): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [editing, setEditing] = useState(false)

  // Waiting for an execution slot, or not even waiting? If this can't be read,
  // it looks like "I sent it and nothing happens". Say it only with the mark's
  // color and word; don't write the reason
  const waiting = task.status === 'queued'
  const actions = useRef<EditableBodyActions | null>(null)

  const label = next.field === 'pendingMessage' ? t('pendingTurn.followupLabel') : t('pendingTurn.promptLabel')

  /** Place focus from the explicit entry point. Caret goes to the end so writing can continue. */
  const edit = (): void => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  const patch = async (body: TaskPatch, inline = false): Promise<void> => {
    await window.quuu.tasks.update({ id: task.id, patch: body }, { context: { feedback: inline ? 'inline' : undefined } })
  }

  /**
   * Discard the follow-up.
   *
   * Once the follow-up is gone, `isFollowupPending` turns false, so deleting it while
   * still queued would make the next run treat itself as a **first run** and send the
   * original prompt to a new session. What was discarded was a send-back, so return
   * to review and put it back in the human's hands.
   */
  const discard = async (): Promise<void> => {
    try {
      await patch({ pendingMessage: '' })
    } catch {
      return
    }
    if (task.sessionId && task.status === 'queued') {
      await window.quuu.tasks.reopen(task.id)
    }
  }

  return (
    <TurnRoot>
      <TurnHead>
        <TurnRole user>{ROLE_LABEL.user}</TurnRole>
        <Badge tone={waiting ? 'info' : 'warning'}>{waiting ? t('pendingTurn.waiting') : t('pendingTurn.unsent')}</Badge>
        <TurnRule />
      </TurnHead>

      <PendingBody>
        <EditableBody
          value={next.value}
          label={label}
          /* What gets sent when empty is said by showing **the exact text** as the placeholder (rule Q) */
          placeholder={task.title}
          inputRef={inputRef}
          onEditingChange={setEditing}
          actionsRef={actions}
          onCommit={(text) =>
            patch(
              next.field === 'pendingMessage' ? { pendingMessage: text } : { prompt: text }, true
            )
          }
        />
      </PendingBody>

      <ContentBlock placement="actions">
        <Row gap="md">
          <Spacer />
          {editing ? (
            /* Only two moves while writing. Shown as pressable buttons, not key hints */
            <>
              <LinkButton
                type="button"
                tone="tertiary"
                onMouseDown={keepFocus}
                onClick={() => actions.current?.cancel()}
              >
                <span>{t('pendingTurn.revert')}</span>
              </LinkButton>
              <Button
                size="xs"
                color="primary"
                onMouseDown={keepFocus}
                onClick={() => actions.current?.commit()}
              >
                {t('pendingTurn.save')}
              </Button>
            </>
          ) : (
            <>
              <LinkButton type="button" tone="tertiary" onClick={edit}>
                <SquarePen size={ICON.sm} {...iconProps} />
                <span>{t('pendingTurn.edit')}</span>
              </LinkButton>
              {/* Deciding not to send is also a human operation. The entry to remove it from the conversation lives here (rule J-2) */}
              {next.field === 'pendingMessage' && (
                <LinkButton type="button" tone="tertiary" onClick={() => void discard()}>
                  <X size={ICON.sm} {...iconProps} />
                  <span>{t('pendingTurn.discard')}</span>
                </LinkButton>
              )}
            </>
          )}
        </Row>
      </ContentBlock>
    </TurnRoot>
  )
}
