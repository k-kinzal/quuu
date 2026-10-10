import { Alert, Markdown, MessageAction, MessageActions, MessageAttachment, MessageStatus, ReactionButton, Text } from '@design-system/react'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import type { AssistantProposal as Proposal } from '../../../api/schemas/assistant.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { Check, ChevronDown, ChevronRight, ICON, Plus, ThumbsDown, ThumbsUp, X, iconProps } from '../ui/icons.js'
import { MessageBody } from './MessageBody.js'

/** A suggestion is an utterance with an attached task, with reactions on that same utterance. */
export function AssistantProposal({ proposal, replies }: { proposal: Proposal; replies?: React.ReactNode }): JSX.Element {
  const project = useStore(s => s.snapshot?.projects.find(p => p.id === proposal.projectId))
  const openTask = useStore(s => s.revealTask)
  const reactionKey = ['assistant', 'react', proposal.taskId]
  const reactionPending = useIsMutating({ mutationKey: reactionKey }, queryClient) > 0
  const react = useMutation({ mutationKey: reactionKey, meta: { feedback: 'inline' }, mutationFn: (reaction: 'approve' | 'dismiss' | 'clear') => window.quuu.assistant.react({ taskId: proposal.taskId, reaction }, { context: { feedback: 'inline' } }) }, queryClient)
  const creationKey = ['assistant', 'createTask', proposal.taskId]
  const creating = useIsMutating({ mutationKey: creationKey }, queryClient) > 0
  const create = useMutation({ mutationKey: creationKey, meta: { feedback: 'inline' }, mutationFn: () => window.quuu.assistant.createTask({ taskId: proposal.taskId }, { context: { feedback: 'inline' } }) }, queryClient)
  const closeKey = ['assistant', 'close', proposal.taskId]
  const closing = useIsMutating({ mutationKey: closeKey }, queryClient) > 0
  const close = useMutation({ mutationKey: closeKey, meta: { feedback: 'inline' }, mutationFn: () => window.quuu.assistant.close({ taskId: proposal.taskId }, { context: { feedback: 'inline' } }) }, queryClient)
  // A successful response can arrive before the snapshot that carries its durable receipt.
  const receipt = create.data?.taskId === proposal.taskId ? create.data : undefined
  const executionTaskId = proposal.executionTaskId ?? receipt?.executionTaskId
  const created = Boolean(executionTaskId) || proposal.status === 'accepted' || receipt?.status === 'accepted'
  const closed = proposal.status === 'dismissed' || (close.data?.taskId === proposal.taskId && close.data.status === 'dismissed')
  return <>
    <MessageBody text={proposal.reason} />
    <MessageAttachment title={proposal.title} meta={project?.name ?? proposal.projectId}
      caret={<ChevronDown size={ICON.sm} {...iconProps} />}
      actions={closed ? <MessageStatus><X size={ICON.sm} {...iconProps} aria-hidden="true" />{t('quuuAI.closed')}</MessageStatus> : created ? <>
        <MessageStatus><Check size={ICON.sm} {...iconProps} aria-hidden="true" />{t('quuuAI.created')}</MessageStatus>
        {executionTaskId && <MessageAction icon={<ChevronRight size={ICON.sm} {...iconProps} aria-hidden="true" />} onClick={() => { void openTask(executionTaskId) }}>{t('quuuAI.viewTask')}</MessageAction>}
      </> : <><MessageAction loading={creating} disabled={closing}
        icon={<Plus size={ICON.sm} {...iconProps} aria-hidden="true" />} onClick={() => create.mutate()}>
        {t(creating ? 'quuuAI.creating' : create.isError ? 'quuuAI.retryCreate' : 'quuuAI.createTask')}
      </MessageAction>
      <MessageAction loading={closing} disabled={creating}
        icon={<X size={ICON.sm} {...iconProps} aria-hidden="true" />} onClick={() => close.mutate()}>
        {t(closing ? 'quuuAI.closing' : close.isError ? 'quuuAI.retryClose' : 'quuuAI.closeProposal')}
      </MessageAction></>}>
      <Markdown>{proposal.prompt}</Markdown>
      <Text size="xs" tone="tertiary">{t('quuuAI.confidence', { value: proposal.confidence })}</Text>
    </MessageAttachment>
    {create.error && !created && !closed && <Alert>{t('quuuAI.createFailed', { reason: failureReason(create.error) })}</Alert>}
    {close.error && !created && !closed && <Alert>{t('quuuAI.closeFailed', { reason: failureReason(close.error) })}</Alert>}
    <MessageActions>
      <ReactionButton title={t('quuuAI.like')}
        icon={<ThumbsUp size={ICON.sm} {...iconProps} />} selected={proposal.reaction === 'approve'}
        disabled={reactionPending} loading={react.isPending && (react.variables === 'approve' || (react.variables === 'clear' && proposal.reaction === 'approve'))}
        onClick={() => react.mutate(proposal.reaction === 'approve' ? 'clear' : 'approve')} />
      <ReactionButton title={t('quuuAI.dislike')}
        icon={<ThumbsDown size={ICON.sm} {...iconProps} />} selected={proposal.reaction === 'dismiss'}
        disabled={reactionPending} loading={react.isPending && (react.variables === 'dismiss' || (react.variables === 'clear' && proposal.reaction === 'dismiss'))}
        onClick={() => react.mutate(proposal.reaction === 'dismiss' ? 'clear' : 'dismiss')} />
      {replies}
    </MessageActions>
    {react.error && <Alert>{failureReason(react.error)}</Alert>}
  </>
}
