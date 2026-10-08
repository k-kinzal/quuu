import {
  ActivityStatus, Alert, Button, Chip, Column, Composer as InputShell, ComposerActions, ComposerBox,
  ComposerInput, ComposerToolbar, ContentInset, ConversationFeed, EmptyState, IconButton, Markdown, Panel,
  PanelHeader, PanelHeading, Row, Spacer, Text, TranscriptTurn, TranscriptTurnBody, TranscriptTurnHead,
  TranscriptTurnRole, TranscriptTurnText, conversationBlock, resizeInput
} from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AssistantProposal } from '../../../api/schemas/assistant.js'
import type { Task } from '../../../api/schemas/tasks.js'
import { Chat } from '../components/Chat.js'
import { Composer } from '../components/Composer.js'
import { pane } from '../interaction/focus.js'
import { isSubmitKey } from '../model/composer.js'
import { clockOrDate } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { ICON, Send, Settings, X, iconProps } from '../ui/icons.js'

/** A single channel of conversation roots; selecting a reply keeps its task/session in a thread. */
export function AssistantView(): JSX.Element {
  const snapshot = useStore(s => s.snapshot)
  const selectedId = useStore(s => s.cursorTaskId)
  const detailOpen = useStore(s => s.detailOpen)
  const openTask = useStore(s => s.openTask)
  const closeDetail = useStore(s => s.closeDetail)
  const setSection = useStore(s => s.setSection)
  const setCategory = useStore(s => s.setSettingsCategory)
  const project = snapshot?.projects.find(p => p.builtIn)
  const tasks = snapshot?.tasks.filter(task => task.projectId === project?.id) ?? []
  const state = snapshot?.assistant
  const selected = detailOpen ? tasks.find(task => task.id === selectedId) : undefined
  const [follow, setFollow] = useState(true)
  return <>
    <Panel surface="canvas" windowHeader grow>
      <PanelHeader>
        <PanelHeading>{t('quuuAI.title')}</PanelHeading>
        <Spacer />
        {state?.activity === 'checking' && <ActivityStatus label={t('quuuAI.checking')} />}
        <IconButton title={t('quuuAI.settings')} icon={<Settings size={ICON.md} {...iconProps} />}
          onClick={() => { setSection({ kind: 'settings' }); setCategory('assistant') }} />
      </PanelHeader>
      <ConversationFeed contextKey="assistant" revision={state?.threads.map(thread => thread.revision).join('|') ?? tasks.length}
        follow={follow} onScroll={event => {
          const element = event.currentTarget
          setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 80)
        }} aria-label={t('quuuAI.channel')}>
        {tasks.length === 0 && <EmptyState title={t('quuuAI.emptyTitle')}>{t('quuuAI.emptyDescription')}</EmptyState>}
        {tasks.map(task => <AssistantEntry key={task.id} task={task}
          proposal={state?.proposals.find(p => p.taskId === task.id)} onOpen={() => { void openTask(task.id) }} />)}
      </ConversationFeed>
      {state?.activity === 'awaiting-response' && <ContentInset><Text size="sm" tone="tertiary">{t('quuuAI.awaitingResponse')}</Text></ContentInset>}
      <NewMessage />
    </Panel>
    {selected && <Panel surface="canvas" windowHeader grow bordered="left" aria-label={t('quuuAI.thread')}>
      <PanelHeader>
        <PanelHeading>{t('quuuAI.thread')}</PanelHeading>
        <Text truncate title={selected.title}>{selected.title}</Text>
        <Spacer />
        <IconButton title={t('quuuAI.closeThread')} icon={<X size={ICON.md} {...iconProps} />} onClick={closeDetail} />
      </PanelHeader>
      <Chat key={selected.id} task={selected} project={project} />
      <Composer key={`input-${selected.id}`} task={selected} project={project} />
    </Panel>}
  </>
}

function AssistantEntry({ task, proposal, onOpen }: { task: Task; proposal?: AssistantProposal; onOpen(): void }): JSX.Element {
  const state = useStore(s => s.snapshot?.assistant)
  const open = useStore(s => s.detailOpen && s.cursorTaskId === task.id)
  const thread = state?.threads.find(item => item.taskId === task.id)
  const ref = useRef<HTMLElement>(null)
  const read = useMutation({ mutationFn: (revision: string) => window.quuu.assistant.markRead({ taskId: task.id, revision }) }, queryClient)
  const markRead = read.mutate
  useEffect(() => {
    const element = ref.current
    if (!element || !thread?.unread) return
    let visible = false
    const mark = (): void => { if ((visible || open) && document.visibilityState === 'visible' && document.hasFocus()) markRead(thread.revision) }
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); mark() }, { threshold: 0.5 })
    observer.observe(element)
    mark()
    window.addEventListener('focus', mark)
    document.addEventListener('visibilitychange', mark)
    return () => { observer.disconnect(); window.removeEventListener('focus', mark); document.removeEventListener('visibilitychange', mark) }
  }, [thread?.unread, thread?.revision, markRead, open])
  return <TranscriptTurn {...conversationBlock(task.id)}>
    <TranscriptTurnHead ref={ref}>
      <TranscriptTurnRole user={!proposal}>{proposal ? t('quuuAI.title') : t('quuuAI.you')}</TranscriptTurnRole>
      <Text size="xs" tone="tertiary">{clockOrDate(task.createdAt)}</Text>
      {proposal && <Chip label={t('quuuAI.suggestion')} />}
    </TranscriptTurnHead>
    <TranscriptTurnBody>
      {proposal ? <ProposalCard proposal={proposal} /> : <TranscriptTurnText role="user"><Markdown>{task.prompt || task.title}</Markdown></TranscriptTurnText>}
      {thread?.preview && <>
        <TranscriptTurnHead><TranscriptTurnRole>{t('quuuAI.title')}</TranscriptTurnRole></TranscriptTurnHead>
        <TranscriptTurnText role="assistant"><Markdown>{thread.preview}</Markdown></TranscriptTurnText>
      </>}
      <Row>
        <Button variant="ghost" size="xs" onClick={onOpen}>{t(thread?.replies ? 'quuuAI.replies' : 'quuuAI.openThread', { count: thread?.replies ?? 0 })}</Button>
        {(task.status === 'running' || task.status === 'queued') && <ActivityStatus label={t(task.status === 'running' ? 'quuuAI.replying' : 'quuuAI.queued')} />}
        {task.status === 'failed' && <Text size="sm" tone="danger">{t('quuuAI.replyFailed')}</Text>}
      </Row>
    </TranscriptTurnBody>
  </TranscriptTurn>
}

function ProposalCard({ proposal }: { proposal: AssistantProposal }): JSX.Element {
  const snapshot = useStore(s => s.snapshot)
  const openTask = useStore(s => s.revealTask)
  const react = useMutation({ mutationFn: (reaction: 'approve' | 'dismiss') => window.quuu.assistant.react({ taskId: proposal.taskId, reaction }, { context: { feedback: 'inline' } }) }, queryClient)
  const project = snapshot?.projects.find(p => p.id === proposal.projectId)
  return <Column gap="md">
    <Row wrap><Text weight="bold">{proposal.title}</Text><Chip label={project?.name ?? proposal.projectId} />
      <Text size="xs" tone="secondary">{t('quuuAI.confidence', { value: proposal.confidence })}</Text></Row>
    <Markdown>{proposal.reason}</Markdown>
    <Markdown>{proposal.prompt}</Markdown>
    <Row wrap>
      {proposal.status === 'pending' ? <>
        <Button size="xs" disabled={react.isPending} onClick={() => react.mutate('approve')}>{t('quuuAI.approve')}</Button>
        <Button size="xs" variant="ghost" disabled={react.isPending} onClick={() => react.mutate('dismiss')}>{t('quuuAI.dismiss')}</Button>
      </> : <Text size="sm" tone={proposal.status === 'accepted' ? 'success' : 'tertiary'}>{t(proposal.status === 'accepted' ? 'quuuAI.accepted' : 'quuuAI.dismissed')}</Text>}
      {proposal.executionTaskId && <Button variant="ghost" size="xs" onClick={() => { void openTask(proposal.executionTaskId!) }}>{t('quuuAI.viewTask')}</Button>}
    </Row>
    {react.error && <Alert>{failureReason(react.error)}</Alert>}
  </Column>
}

function NewMessage(): JSX.Element {
  const text = useStore(s => s.drafts['assistant-channel'] ?? '')
  const setDraft = useStore(s => s.setDraft)
  const ref = useRef<HTMLTextAreaElement>(null)
  const send = useMutation({ mutationFn: (message: string) => window.quuu.assistant.send(message, { context: { feedback: 'inline' } }),
    onSuccess: (_task, message) => {
      if (useStore.getState().drafts['assistant-channel'] === message) setDraft('assistant-channel', '')
    } }, queryClient)
  useLayoutEffect(() => resizeInput(ref.current, 'message'), [text])
  const submit = (): void => { if (text.trim() && !send.isPending) send.mutate(text) }
  return <InputShell {...pane('composer')} aria-label={t('quuuAI.newMessage')}>
    <ComposerBox busy={send.isPending}>
      <ComposerInput ref={ref} rows={1} value={text} data-pane-focus="" aria-label={t('quuuAI.newMessage')} placeholder={t('quuuAI.placeholder')}
        onChange={event => setDraft('assistant-channel', event.target.value)}
        onKeyDown={event => { if (isSubmitKey(event)) { event.preventDefault(); submit() } }} />
      {send.error && <Alert>{failureReason(send.error)}</Alert>}
      <ComposerToolbar><Text size="xs" tone="tertiary">{t('quuuAI.newThreadHint')}</Text><Spacer /><ComposerActions>
        <Button disabled={!text.trim() || send.isPending} onClick={submit} startIcon={<Send size={ICON.sm} {...iconProps} />}>{t('quuuAI.send')}</Button>
      </ComposerActions></ComposerToolbar>
    </ComposerBox>
  </InputShell>
}
