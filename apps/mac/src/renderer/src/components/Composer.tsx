import { usePromptFiles } from '../interaction/promptFiles.js'
import { failureReason } from '../model/operationFailure.js'
import {
  Alert,
  Badge,
  Button,
  ComposerNotice,
  ComposerNoticeBody,
  ComposerNoticeText,
  ContentInset,
  IconButton
} from '@design-system/react'

import { useEffect, useRef } from 'react'
import { safe } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { queryClient } from '../state/queryClient.js'
import type { Project } from '../../../preload/api/projects.js'
import type { Task } from '../../../preload/api/tasks.js'

import { focusAny } from '../interaction/focus.js'
import { isImeComposing, isSubmitKey } from '../model/composer.js'
import { taskTargetLabel } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import { taskDraftKey } from '../state/drafts.js'
import { useStore } from '../state/store.js'
import { ArrowLeft, Clock, ICON, Send, Square, X, iconProps } from '../ui/icons.js'
import { PromptAgentChip, PromptComposer } from './PromptComposer.js'

/**
 * The composer (rule D).
 *
 * Every primary action on a task collects here. Not a bare textarea but a composite
 * that shows **where, who, and under what conditions it will run** before you send.
 *
 * The first send becomes the prompt itself. That is what makes the deferred style —
 * "queue just a title now, open it later and write the instructions" — work.
 *
 * The input is never blocked while a run is in flight. You want to say more precisely
 * while you are reading, so a send is held as a **reservation** and goes out the moment
 * the run finishes cleanly. Don't make a human "remember until it ends, then reopen and type".
 *
 * **Never add prose explaining what pressing does** (rule Q). The outcome is said by the
 * button's label and icon, what is being held by the band above the input, and the
 * commit key by the OS menu.
 */
export function Composer({
  task,
  project
}: {
  task: Task
  project: Project | undefined
}): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const refreshRuns = useStore((s) => s.refreshRuns)

  /**
   * Half-written instructions live in the store (rule D-②). The composer unmounts
   * from something as small as opening project settings, so keeping the text here
   * would mean "go look at settings, come back, and it's gone".
   * The key is per task, so moving between tasks naturally surfaces that task's draft.
   */
  const draftKey = taskDraftKey(task.id)
  const text = useStore((s) => s.drafts[draftKey] ?? '')
  const setDraft = useStore((s) => s.setDraft)

  const sendingMutation = useMutation({
    mutationKey: ['tasks', 'send', task.id],
    mutationFn: async (message: string) => {
      const result = await window.quuu.tasks.send({ id: task.id, message }, { context: { feedback: 'inline' } })
      if (!result.ok) throw new Error(result.reason)
      return result
    },
    onSuccess: async () => {
      setDraft(draftKey, '')
      await refreshRuns(task.id)
    }
  }, queryClient)
  const sending = sendingMutation.isPending
  const ref = useRef<HTMLTextAreaElement>(null)
  const files = usePromptFiles({ value: text, onChange: value => setDraft(draftKey, value), inputRef: ref, scope: draftKey, disabled: sending })

  useEffect(() => {
    const focus = (): void => {
      const el = ref.current
      if (!el) return
      el.focus()
      // Put the caret at the end so a draft can be continued where it left off
      el.setSelectionRange(el.value.length, el.value.length)
    }
    window.addEventListener('quuu:focus-composer', focus)
    return () => window.removeEventListener('quuu:focus-composer', focus)
  }, [])

  const isRunning = task.status === 'running'
  const isFirst = !task.sessionId
  /** Written and handed over during a run. Sent automatically once the run ends cleanly. */
  const reserved = task.reservedMessage.trim()
  // Queued means waiting on an automatic retry, so the reservation goes out when that run ends
  const willAutoSend = isRunning || task.status === 'queued'
  // If instructions haven't been sent yet, what you write here is **appended to them**.
  // The target is visible at the end of the conversation (PendingTurn), and the input's
  // placeholder reads "append to the instructions…". Those two say it isn't a replacement.
  // Never say it in helper prose (rule Q).
  // To rewrite instead, the entry point is "Edit" on the pending turn at the end of the conversation
  const appendsToPrompt = isFirst && task.prompt.trim().length > 0

  const action = isRunning
    ? { label: t('composer.action.reserve'), enabled: true }
    : isFirst
      ? { label: appendsToPrompt && task.status === 'queued' ? t('composer.action.append') : t('composer.action.run'), enabled: true }
      : task.status === 'review'
        ? { label: t('composer.action.sendBack'), enabled: true }
        : task.status === 'failed'
          ? { label: t('composer.action.rerun'), enabled: true }
          : task.status === 'done'
            ? { label: t('composer.action.resume'), enabled: true }
            : { label: t('composer.action.append'), enabled: true }

  /**
   * Send. Whether this queues now or reserves depends on the run state, and main decides that.
   * Calling with an empty string sends only the held reservation ("send now").
   */
  const send = async (message: string): Promise<void> => {
    if (files.isBusy() || queryClient.isMutating({ mutationKey: ['tasks', 'send', task.id] })) return
    await safe(sendingMutation.mutateAsync(message))
  }

  const submit = (): void => {
    if (text.trim().length === 0 || !action.enabled) return
    void send(text)
  }

  return (
    <PromptComposer label={t('composer.pane')} busy={sending || files.busy}
      project={project}
      agent={<PromptAgentChip label={snapshot ? taskTargetLabel(snapshot, task, project) : t('composer.unassigned')} />}
      priority={task.priority}
      onPriorityChange={priority => void window.quuu.tasks.update({ id: task.id, patch: { priority } })}
      subject={{ value: task.title, readOnly: true }}
      notice={reserved.length > 0 && (
        <ComposerNotice tone={willAutoSend ? 'info' : 'warning'}>
          <Clock size={ICON.sm} {...iconProps} />
          <ComposerNoticeBody>
            <ContentInset space="caption">
              <Badge tone={willAutoSend ? 'info' : 'warning'}>
                {willAutoSend ? t('composer.reservedBadge.scheduled') : t('composer.reservedBadge.unsent')}
              </Badge>
            </ContentInset>
            <ComposerNoticeText>{reserved}</ComposerNoticeText>
          </ComposerNoticeBody>
          {!willAutoSend && (
            <Button size="xs" onClick={() => void send('')}>
              {t('composer.sendNow')}
            </Button>
          )}
          <IconButton
            size="xs"
            title={t('composer.cancelReserved')}
            icon={<X size={ICON.sm} {...iconProps} />}
            onClick={() => void window.quuu.tasks.clearReserved(task.id)}
          />
        </ComposerNotice>
      )}
      inputRef={ref}
      input={{
        ...files.inputProps, value: text, disabled: sending,
        placeholder: isRunning
          ? t('composer.placeholder.running')
          : appendsToPrompt
            ? t('composer.placeholder.append')
            : isFirst
              ? t('composer.placeholder.first')
              : t('composer.placeholder.followup'),
        onChange: e => setDraft(draftKey, e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Escape' && !isImeComposing(e)) {
            /* Give focus back to the list when you stop writing. Dropping it on body means the next key reaches nobody */
            focusAny('list', 'chat')
            return
          }
          if (!isSubmitKey(e)) return
          e.preventDefault()
          submit()
        }
      }}
      errors={<>
        {files.error && <Alert title={t('promptFiles.failed')}>{failureReason(files.error)}</Alert>}
      </>}
      actions={<>
        {/* Cancelling is an act on the task, not on the composer, but this is where you
            reach for it mid-run, so it stays. The lead action (send) is always right beside it */}
        {isRunning && (
          <Button
            variant="ghost"
            color="error"
            startIcon={<Square size={ICON.sm} {...iconProps} />}
            onClick={() => void window.quuu.tasks.cancel(task.id)}
          >
            {t('composer.cancel')}
          </Button>
        )}

        <Button
          color="primary"
          loading={sending}
          disabled={!action.enabled || text.trim().length === 0 || sending || files.busy}
          onClick={submit}
          title={`${action.label} (⌘↵)`}
          startIcon={
            isRunning ? (
              <Clock size={ICON.sm} {...iconProps} />
            ) : action.label === t('composer.action.sendBack') ? (
              <ArrowLeft size={ICON.sm} {...iconProps} />
            ) : (
              <Send size={ICON.sm} {...iconProps} />
            )
          }
        >
          {action.label}
        </Button>
      </>}
    />
  )
}
