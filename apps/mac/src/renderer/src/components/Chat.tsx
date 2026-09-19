import { Alert, Button, ContentInset, Text } from '@design-system/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { Task } from '../../../preload/api/tasks.js'

import { useSessionPaging } from '../interaction/useSessionPaging.js'
import { focusAny, pane } from '../interaction/focus.js'
import { deliveredInstructions, failureReason, nextSend } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import { buildSections, buildTurns } from '../model/summarize.js'
import { useStore } from '../state/store.js'
import { ChevronDown, CircleAlert, ICON, iconProps } from '../ui/icons.js'
import { ChatIntro, ChatMore, ChatRoot, ChatScroll, ChatViewport, JumpToLatest } from '../ui/panes.js'
import { ExecutionActivity } from './ExecutionActivity.js'
import { PendingTurn } from './PendingTurn.js'
import { PromptSection } from './PromptSection.js'

/** How many items at the top edge are remembered across a page load. Only the first can be renamed; the rest is margin. */
const ANCHORS = 3
/** Within this distance of the window's edge, heading further asks for the next page. */
const EDGE = 160

/** Which way the reader is heading through the conversation. */
type Heading = 'older' | 'newer'
const KEY_HEADING: Record<string, Heading> = {
  ArrowUp: 'older', PageUp: 'older', Home: 'older', ArrowDown: 'newer', PageDown: 'newer', End: 'newer', ' ': 'newer'
}

/**
 * The task's leading surface (rule B).
 *
 * Most of the reason for opening a task is "see what was asked, see what was done,
 * say what's next", so the conversation sits center and largest. There's no dedicated
 * prompt field; the prompt is written as the conversation's first message.
 */
export function Chat({ task, project, active = true }: { task: Task; project: Project | undefined; active?: boolean }): JSX.Element {
  const session = useStore((s) => s.session)
  const loading = useStore((s) => s.sessionLoading)
  const runs = useStore((s) => s.runs)
  const selectedRunId = useStore((s) => s.selectedRunId)
  const { pending: pageLoading, load: loadMore } = useSessionPaging()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const paging = useRef(false)
  /**
   * The reader's place while a page is on its way: the first items at or below the top
   * edge with their screen positions, and the height there was. Several items are kept
   * because the page arriving in front of the window can rename its first item (the
   * prose that opens it may fold into the message before it); the ones after keep their
   * names. The height covers a window that is one folded item, as raw output is.
   */
  const anchor = useRef<{ items: { id: string; top: number }[]; height: number; before: typeof session } | null>(null)
  /**
   * Whether the reader has moved since a page last arrived. A page is asked for by the
   * reader's own movement — a wheel, a key, a drag — never by the pane's own layout. A
   * page arriving shifts the content and can leave the window's far edge within reach,
   * and the scroll events that follow are the pane settling, not the reader heading there.
   * On a run whose earlier pages fold into a few tool lines, the newer page was asked for
   * the moment the earlier one arrived, and the window bounced back every time, so the
   * conversation could not be read backwards past that point.
   */
  const moved = useRef(false)
  const lastTop = useRef(0)

  const run = runs.find((r) => r.id === selectedRunId) ?? null
  const cwd = run?.cwd ?? project?.path ?? null
  // A fresh array every time would make the useMemos below run on every render
  const messages = useMemo(() => session?.messages ?? [], [session])
  const turns = useMemo(() => buildTurns(messages), [messages])
  const sections = useMemo(() => buildSections(turns), [turns])

  useEffect(() => {
    setFollow(true)
  }, [selectedRunId, task.id])

  /**
   * The utterance not yet sent. The follow-up written for a send-back, the prompt about
   * to be re-sent, and the first instruction never sent at all — each goes at **the end
   * of the conversation**, not on an attribute surface (to the person who wrote it,
   * it's "already said", so moving it away from the conversation loses track of it).
   *
   * Hidden while a past run is open. That run's end is not "the continuation of this",
   * so placing the next send there makes it unreadable which run it follows.
   */
  const latest = runs.length === 0 || runs[0]?.id === selectedRunId
  /*
   * What the agent already holds out of the instruction that waits to be sent. Only the end of
   * the conversation can say it, so nothing is claimed while a newer page is still unread.
   */
  const delivered = useMemo(
    () => (latest && !session?.hasNewer ? deliveredInstructions(messages, runs, task.sessionId) : []),
    [latest, session?.hasNewer, messages, runs, task.sessionId]
  )
  const next = latest ? nextSend(task, runs.length > 0, delivered) : null

  useLayoutEffect(() => {
    if (!active) return
    const el = scrollRef.current
    if (!anchor.current || !el || anchor.current.before === session) return
    const saved = anchor.current
    anchor.current = null
    const nodes = new Map([...el.querySelectorAll<HTMLElement>('[data-chat-item]')].map(node => [node.dataset.chatItem, node]))
    const kept = saved.items.find(item => nodes.has(item.id))
    if (kept) el.scrollTop += nodes.get(kept.id)!.getBoundingClientRect().top - kept.top
    // Nothing on screen kept its name. While the window's end stayed where it was,
    // everything that changed height sits above the reader
    else if (saved.before?.last === session?.last) el.scrollTop += el.scrollHeight - saved.height
    // Where the pane settled is where the reader's next movement is measured from
    lastTop.current = el.scrollTop
    moved.current = false
  }, [active, session])

  const revision = useMemo(() => ({ messages, next: next?.value }), [messages, next?.value])

  const page = async (direction: 'older' | 'newer' | 'latest'): Promise<void> => {
    if (paging.current) return
    paging.current = true
    moved.current = false
    const el = scrollRef.current
    if (el && direction !== 'latest') {
      const edge = el.getBoundingClientRect().top
      const items: { id: string; top: number }[] = []
      for (const node of el.querySelectorAll<HTMLElement>('[data-chat-item]')) {
        if (items.length === ANCHORS) break
        const { top } = node.getBoundingClientRect()
        if (top >= edge && node.dataset.chatItem) items.push({ id: node.dataset.chatItem, top })
      }
      anchor.current = { items, height: el.scrollHeight, before: session }
      setFollow(false)
    }
    try {
      await loadMore(direction)
      if (direction === 'latest') setFollow(true)
    } catch {
      // The mutation reports the failure; release the anchor so normal reading can continue.
      anchor.current = null
    } finally {
      paging.current = false
    }
  }

  const atEdge = (heading: Heading): boolean => {
    const el = scrollRef.current
    if (!el || paging.current || loading) return false
    if (heading === 'older') return el.scrollTop < EDGE && session?.hasMore === true
    return el.scrollHeight - el.scrollTop - el.clientHeight < EDGE && session?.hasNewer === true
  }

  /**
   * The reader is heading somewhere. At the window's edge that asks for the next page
   * right away: at the very top nothing can scroll any further, so a wheel there would
   * otherwise never be heard. A drag has no direction until the pane moves.
   */
  const head = (heading: Heading | null): void => {
    if (!active || !scrollRef.current) return
    moved.current = true
    lastTop.current = scrollRef.current.scrollTop
    if (heading && atEdge(heading)) void page(heading)
  }

  const onScroll = (): void => {
    if (!active) return
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setFollow(!session?.hasNewer && bottom < 48)
    const delta = el.scrollTop - lastTop.current
    lastTop.current = el.scrollTop
    // Only a movement the reader made counts, and its own direction says which page it wants
    if (!moved.current || delta === 0) return
    const heading = delta < 0 ? 'older' : 'newer'
    if (atEdge(heading)) void page(heading)
  }

  const neverRan = runs.length === 0
  /*
   * How the run ended goes **where it ended**: after the last thing the agent said. Carried at
   * the head of the pane it read as the opening of a conversation it is the outcome of, and on a
   * conversation of any length it sat a screen away from what it is about.
   */
  const failure = task.status === 'failed' && latest && !session?.hasNewer
    ? failureReason(runs[0], messages)
    : null

  // A written instruction appears at the end of the conversation as the "not yet sent"
  // utterance (`next`). Guidance here is only for when nothing is written at all
  const hasPrompt = task.prompt.trim().length > 0

  return (
    <ChatRoot>
      <ChatViewport>
        {/*
          The conversation is a "reading surface". With focus on it, ↑↓ ⇞ ⇟ read
          onward (the vessel's default behavior). Without focus, someone without a
          wheel can't read a long conversation to the end
        */}
        <ChatScroll
          ref={scrollRef}
          revision={revision}
          contextKey={`${task.id}:${selectedRunId ?? ''}`}
          follow={follow && !session?.hasNewer}
          active={active}
          onScroll={onScroll}
          onWheel={(e) => head(e.deltaY < 0 ? 'older' : e.deltaY > 0 ? 'newer' : null)}
          onKeyDown={(e) => { const heading = KEY_HEADING[e.key]; if (heading) head(heading) }}
          onPointerDown={() => head(null)}
          onTouchStart={() => head(null)}
          {...(active ? pane('chat', { tab: true }) : {})}
          aria-label={t('chat.pane')}
        >
          {loading && (
            <Text size="sm" tone="tertiary">
              {t('chat.loading')}
            </Text>
          )}

          {/*
            An empty surface says what would fill it with **the next move, not prose**
            (rule Q). With no prompt, the only place to write is the composer at the
            bottom, so hand focus there. With no log, place a way to open the real
            readable thing (the run log)
          */}
          {!loading && neverRan && !hasPrompt && (
            <ChatIntro>
              <ContentInset>
                <Text block size="md" tone="secondary">
                  {t('chat.noPromptYet')}
                </Text>
              </ContentInset>
              <Button size="xs" onClick={() => focusAny('composer')}>
                {t('chat.writePrompt')}
              </Button>
            </ChatIntro>
          )}

          {!loading && !neverRan && task.status !== 'running' && session && !session.exists && messages.length === 0 && (
            <ChatIntro>
              <ContentInset>
                <Text block size="md" tone="secondary">
                  {t('chat.noSessionLog')}
                </Text>
              </ContentInset>
              {run && (
                  <Button
                    size="xs"
                    onClick={() => void window.quuu.system.reveal(run.stdoutLogPath)}
                  >
                    {t('chat.openRunLog')}
                  </Button>
              )}
            </ChatIntro>
          )}

          {session?.hasMore && (
            <ChatMore>
              <Button size="xs" disabled={pageLoading} onClick={() => void page('older')}>
                {pageLoading ? t('chat.loading') : t('chat.loadEarlier', { total: session.totalMessages })}
              </Button>
            </ChatMore>
          )}

          {/*
            The conversation bundles per instruction. A bundle's heading (the
            instruction's one line) stays pinned while scrolling and gets pushed out
            and replaced when the next instruction arrives
          */}
          {sections.map((section) => (
            <PromptSection key={section.id} section={section} cwd={cwd} scrollRef={scrollRef} />
          ))}

          {session?.hasNewer && <ChatMore><Button size="xs" disabled={pageLoading} onClick={() => void page('newer')}>{t('chat.loadNewer')}</Button></ChatMore>}

          {failure && (
            <ContentInset space="section">
              <Alert
                title={t('chat.runFailed')}
                icon={<CircleAlert size={ICON.md} {...iconProps} />}
              >
                {failure}
              </Alert>
            </ContentInset>
          )}

          {!session?.hasNewer && run && <ExecutionActivity run={run} messages={messages} />}
          {!session?.hasNewer && next && <PendingTurn task={task} next={next} />}
        </ChatScroll>

        {/* Floats at the window's bottom edge. Stays within the conversation even as the composer grows */}
        {!follow && messages.length > 0 && (
          <JumpToLatest
            type="button"
            onClick={() => void page('latest')}
          >
            <ChevronDown size={ICON.sm} {...iconProps} />
            {t('chat.jumpToLatest')}
          </JumpToLatest>
        )}
      </ChatViewport>
    </ChatRoot>
  )
}
