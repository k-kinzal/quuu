import {
  ActivityStatus, Alert, Button, Composer as InputShell, ComposerActions, ComposerBox,
  ComposerInput, ComposerInputRow, ConversationFeed, ConversationWorkspace, EmptyState, IconButton,
  Message, MessageActions, MessageColumn, MessageExcerpt, MessageGroup, Panel, PanelHeader, PanelHeading,
  Spacer, Text, conversationBlock, resizeInput
} from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AssistantProposal as Proposal } from '../../../api/schemas/assistant.js'
import type { Task } from '../../../api/schemas/tasks.js'
import { AssistantProposal } from '../components/AssistantProposal.js'
import { Chat } from '../components/Chat.js'
import { Composer } from '../components/Composer.js'
import { focusAny, pane } from '../interaction/focus.js'
import { shortcut } from '../interaction/shortcut.js'
import { isSubmitKey } from '../model/composer.js'
import { conversationExcerpt } from '../model/conversationExcerpt.js'
import { clockOrDate } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { ArrowLeft, Bot, ICON, MessageSquareText, Send, Settings, User, iconProps } from '../ui/icons.js'

/** Conversation roots stay in the channel; opening one gives its replies a separate reading surface. */
export function AssistantView(): JSX.Element {
  const snapshot = useStore(s => s.snapshot)
  const selectedId = useStore(s => s.cursorTaskId)
  const detailOpen = useStore(s => s.detailOpen)
  const openTask = useStore(s => s.openTask)
  const closeDetail = useStore(s => s.closeDetail)
  const setSection = useStore(s => s.setSection)
  const setCategory = useStore(s => s.setSettingsCategory)
  const project = snapshot?.projects.find(p => p.builtIn)
  const tasks = (snapshot?.tasks.filter(task => task.projectId === project?.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const state = snapshot?.assistant
  const selected = detailOpen ? tasks.find(task => task.id === selectedId) : undefined
  const proposal = state?.proposals.find(p => p.taskId === selected?.id)
  const [follow, setFollow] = useState(true)
  const showThread = async (id: string): Promise<void> => {
    await openTask(id)
    // Move the keyboard into the opened conversation, including when it replaces the channel.
    focusAny('chat')
  }
  const hideThread = (): void => {
    closeDetail()
    requestAnimationFrame(() => focusAny('composer'))
  }
  return <ConversationWorkspace threadOpen={Boolean(selected)}>
    <Panel surface="canvas" windowHeader data-conversation-channel>
      <PanelHeader>
        <PanelHeading>{t('quuuAI.title')}</PanelHeading>
        {state?.activity === 'checking' && <ActivityStatus label={t('quuuAI.checking')} />}
        <Spacer />
        <IconButton title={t('quuuAI.settings')} icon={<Settings size={ICON.md} {...iconProps} />}
          onClick={() => { setSection({ kind: 'settings' }); setCategory('assistant') }} />
      </PanelHeader>
      <ConversationFeed contextKey="assistant" revision={state?.threads.map(thread => thread.revision).join('|') ?? tasks.length}
        follow={follow} onScroll={event => {
          const element = event.currentTarget
          setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 80)
        }} {...(!selected ? pane('chat', { tab: true }) : {})} aria-label={t('quuuAI.channel')}>
        <MessageColumn>
          {tasks.length === 0 && <EmptyState title={t('quuuAI.emptyTitle')} />}
          {tasks.map(task => <AssistantEntry key={task.id} task={task}
            proposal={state?.proposals.find(p => p.taskId === task.id)} onOpen={() => { void showThread(task.id) }} />)}
        </MessageColumn>
      </ConversationFeed>
      <NewMessage secondary={Boolean(selected)} />
    </Panel>
    {selected && <Panel surface="canvas" windowHeader bordered="left" data-conversation-thread aria-label={t('quuuAI.thread')}>
      <PanelHeader>
        <IconButton title={t('quuuAI.closeThread')} icon={<ArrowLeft size={ICON.md} {...iconProps} />} onClick={hideThread} />
        <PanelHeading title={selected.title}>{selected.title}</PanelHeading>
      </PanelHeader>
      <Chat key={selected.id} task={selected} project={project} proposal={proposal} />
      <Composer key={`input-${selected.id}`} task={selected} project={project} />
    </Panel>}
  </ConversationWorkspace>
}

function AssistantEntry({ task, proposal, onOpen }: { task: Task; proposal?: Proposal; onOpen(): void }): JSX.Element {
  const state = useStore(s => s.snapshot?.assistant)
  const open = useStore(s => s.detailOpen && s.cursorTaskId === task.id)
  const thread = state?.threads.find(item => item.taskId === task.id)
  const prompt = useMemo(() => conversationExcerpt(task.prompt || task.title), [task.prompt, task.title])
  const preview = useMemo(() => conversationExcerpt(thread?.preview ?? ''), [thread?.preview])
  const ref = useRef<HTMLDivElement>(null)
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
  const replies = <Button variant="ghost" size="xs" onClick={onOpen} aria-expanded={open}
    startIcon={<MessageSquareText size={ICON.sm} {...iconProps} />}>
    {t(thread?.replies ? 'quuuAI.replies' : 'quuuAI.openThread', { count: thread?.replies ?? 0 })}
  </Button>
  const status = <>
    {(task.status === 'running' || task.status === 'queued') && <ActivityStatus label={t(task.status === 'running' ? 'quuuAI.replying' : 'quuuAI.queued')} />}
    {task.status === 'failed' && <Text size="sm" tone="danger">{t('quuuAI.replyFailed')}</Text>}
  </>
  return <MessageGroup selected={open} {...conversationBlock(task.id)}>
    <div ref={ref}>
      <Message speaker={proposal ? t('quuuAI.title') : t('quuuAI.you')}
        icon={proposal ? <Bot size={ICON.md} {...iconProps} /> : <User size={ICON.md} {...iconProps} />}
        meta={clockOrDate(task.createdAt)}>
        {proposal ? <AssistantProposal proposal={proposal} replies={!thread?.preview ? <>{replies}{status}</> : undefined} /> : <>
          <MessageExcerpt primary>{prompt}</MessageExcerpt>
          {!thread?.preview && <MessageActions>{replies}{status}</MessageActions>}
        </>}
      </Message>
    </div>
    {thread?.preview && <Message speaker={t('quuuAI.title')} icon={<Bot size={ICON.md} {...iconProps} />}>
      <MessageExcerpt>{preview}</MessageExcerpt>
      <MessageActions>{replies}{status}</MessageActions>
    </Message>}
  </MessageGroup>
}

function NewMessage({ secondary }: { secondary: boolean }): JSX.Element {
  const text = useStore(s => s.drafts['assistant-channel'] ?? '')
  const setDraft = useStore(s => s.setDraft)
  const ref = useRef<HTMLTextAreaElement>(null)
  const send = useMutation({ mutationFn: (message: string) => window.quuu.assistant.send(message, { context: { feedback: 'inline' } }),
    onSuccess: (_task, message) => {
      if (useStore.getState().drafts['assistant-channel'] === message) setDraft('assistant-channel', '')
    } }, queryClient)
  useLayoutEffect(() => resizeInput(ref.current, 'message'), [text, secondary])
  const submit = (): void => { if (text.trim() && !send.isPending) send.mutate(text) }
  return <InputShell {...(!secondary ? pane('composer') : {})} aria-label={t('quuuAI.newMessage')}>
    <MessageColumn><ComposerBox busy={send.isPending}>
      <ComposerInputRow>
        <ComposerInput ref={ref} rows={1} value={text} data-pane-focus={!secondary ? '' : undefined} aria-label={t('quuuAI.newMessage')} placeholder={t('quuuAI.placeholder')}
          onChange={event => setDraft('assistant-channel', event.target.value)}
          onKeyDown={event => { if (isSubmitKey(event)) { event.preventDefault(); submit() } }} />
        <ComposerActions><IconButton title={`${t('quuuAI.send')} (${shortcut('Cmd+Enter')})`} aria-label={t('quuuAI.send')}
          color={secondary ? 'default' : 'primary'} disabled={!text.trim() || send.isPending} loading={send.isPending}
          onClick={submit} icon={<Send size={ICON.md} {...iconProps} />} /></ComposerActions>
      </ComposerInputRow>
      {send.error && <Alert>{failureReason(send.error)}</Alert>}
    </ComposerBox></MessageColumn>
  </InputShell>
}
