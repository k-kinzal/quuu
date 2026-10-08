import { Alert, Button, Markdown, MessageActions, MessageAttachment, ReactionButton, Text } from '@design-system/react'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import type { AssistantProposal as Proposal } from '../../../api/schemas/assistant.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { ChevronDown, ICON, ThumbsDown, ThumbsUp, iconProps } from '../ui/icons.js'
import { MessageBody } from './MessageBody.js'

/** A suggestion is an utterance with an attached task, with reactions on that same utterance. */
export function AssistantProposal({ proposal, replies }: { proposal: Proposal; replies?: React.ReactNode }): JSX.Element {
  const project = useStore(s => s.snapshot?.projects.find(p => p.id === proposal.projectId))
  const openTask = useStore(s => s.revealTask)
  const mutationKey = ['assistant', 'react', proposal.taskId]
  const pending = useIsMutating({ mutationKey }, queryClient) > 0
  const react = useMutation({ mutationKey, mutationFn: (reaction: 'approve' | 'dismiss') => window.quuu.assistant.react({ taskId: proposal.taskId, reaction }, { context: { feedback: 'inline' } }) }, queryClient)
  const settled = proposal.status !== 'pending'
  return <>
    {proposal.status !== 'dismissed' && <MessageBody text={proposal.reason} />}
    <MessageAttachment title={proposal.title} meta={project?.name ?? proposal.projectId}
      caret={<ChevronDown size={ICON.sm} {...iconProps} />}>
      <Markdown>{proposal.prompt}</Markdown>
      <Text size="xs" tone="tertiary">{t('quuuAI.confidence', { value: proposal.confidence })}</Text>
    </MessageAttachment>
    <MessageActions>
      {(!settled || proposal.status === 'accepted') && <ReactionButton title={t('quuuAI.approve')}
        icon={<ThumbsUp size={ICON.sm} {...iconProps} />} selected={proposal.status === 'accepted'}
        disabled={settled || pending} loading={react.isPending && react.variables === 'approve'} onClick={() => react.mutate('approve')} />}
      {(!settled || proposal.status === 'dismissed') && <ReactionButton title={t('quuuAI.dismiss')}
        icon={<ThumbsDown size={ICON.sm} {...iconProps} />} selected={proposal.status === 'dismissed'}
        disabled={settled || pending} loading={react.isPending && react.variables === 'dismiss'} onClick={() => react.mutate('dismiss')} />}
      {proposal.executionTaskId ? <Button variant="ghost" size="xs" onClick={() => { void openTask(proposal.executionTaskId!) }}>{t('quuuAI.viewTask')}</Button>
        : settled && <Text size="xs" tone="tertiary">{t(proposal.status === 'accepted' ? 'quuuAI.accepted' : 'quuuAI.dismissed')}</Text>}
      {replies}
    </MessageActions>
    {react.error && <Alert>{failureReason(react.error)}</Alert>}
  </>
}
