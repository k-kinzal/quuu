import {
  ContentBlock,
  Divider,
  EmptyState,
  IconButton,
  Markdown,
  Row,
  Spacer,
  Text,
  useTheme
} from '@design-system/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'

import { Composer } from '../components/Composer.js'
import { Screen } from '../components/Screen.js'
import { Sheet } from '../components/Sheet.js'
import { replyKey } from '../lib/drafts.js'
import { Glyph } from '../lib/icons.js'
import { relative } from '../lib/time.js'
import { t } from '../model/i18n/index.js'
import { TASK_STATUS_LABEL } from '../model/labels.js'
import { useStore } from '../state/store.js'
import type { SyncUnsent } from '../sync/projection.js'

import { unsentTurns } from '../sync/projection.js'

import { AWAITING_HUMAN_STATUSES } from '../sync/task.js'
import { StatusDot } from '../ui/StatusDot.js'

/**
 * A single task. **A surface for reading.**
 *
 * The reason to come here is "read the answer that came back and decide whether it can
 * be marked done". The conversation body is the lead; attributes fold into one row.
 *
 * The bottom edge holds **exactly one thing: write and send** (`Composer`). Actions
 * that change state go in the bar's `...`. There used to be five verbs along the
 * bottom, leaving a finger that had just finished reading pointed at a lone
 * "send when finished" tag. **Reading surfaces and state-changing actions are placed
 * apart.**
 *
 * An utterance not yet sent goes **at the end of the conversation** (like the Mac's
 * `PendingTurn`). It appears there the instant it is pressed - show it only after the
 * iCloud round trip and sending changes nothing on screen, indistinguishable from a
 * press that did not land.
 */
export function TaskView({ taskId }: { taskId: string }): JSX.Element {
  const theme = useTheme()
  const task = useStore((s) => s.view.tasks.find((t) => t.id === taskId))
  const detail = useStore((s) => s.detail)
  const loading = useStore((s) => s.detailLoading)
  const detailUnavailable = useStore((s) => s.detailUnavailable)
  const projects = useStore((s) => s.view.projects)
  const open = useStore((s) => s.open)
  const markDone = useStore((s) => s.markDone)
  const sendBack = useStore((s) => s.sendBack)
  const enqueue = useStore((s) => s.enqueue)
  const unqueue = useStore((s) => s.unqueue)
  const archive = useStore((s) => s.archive)
  const busy = useStore((s) => s.busy)

  /*
   * A follow-up is held as a draft. **Leaving the screen mid-writing is ordinary**
   * (going back to the list, following a notification into another app), and nothing
   * may be lost there
   */
  const drafts = useStore((s) => s.drafts)
  const setDraft = useStore((s) => s.setDraft)
  const key = useMemo(() => replyKey(taskId), [taskId])
  const message = drafts[key] ?? ''

  const [menu, setMenu] = useState(false)
  const pending = useStore((s) => s.pending)
  // Right after sending, scroll far enough that the new utterance is visible
  const end = useRef<HTMLDivElement>(null)

  /*
   * The utterance not yet sent. **A hook, so it sits ahead of any early return.**
   * This is what appears in the conversation the instant it is pressed (`pending` has
   * already become a file by then)
   */
  const unsent = useMemo(
    () => unsentTurns(detail, taskId, task?.status, [...pending.values()]),
    [detail, taskId, task?.status, pending]
  )

  if (!task) {
    return (
      <Screen title={t('taskView.title')} onBack={() => open({ kind: 'list' })}>
        <EmptyState title={t('taskView.notFound')} />
      </Screen>
    )
  }

  const project = projects.find((p) => p.id === task.projectId)
  const awaiting = AWAITING_HUMAN_STATUSES.includes(task.status)
  const messages = detail?.messages ?? []
  const running = task.status === 'running'

  const send = (): void => {
    const text = message.trim()
    if (!text) return
    setDraft(key, '')
    void sendBack(taskId, text).then(() => {
      end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }

  /*
   * The `...` lists **only what passes in that state**. Leave something greyed out
   * that a race would reject anyway and every open runs into "pressable but does
   * nothing".
   */
  const items: { label: string; run: () => void }[] = []
  if (awaiting) items.push({ label: t('taskView.markDone'), run: () => void markDone(taskId) })
  if (task.status === 'draft' || task.status === 'held') {
    items.push({ label: t('taskView.queue'), run: () => void enqueue(taskId) })
  }
  if (task.status === 'queued') {
    items.push({ label: t('taskView.hold'), run: () => void unqueue(taskId) })
  }
  // What is running does not stop (canceling is the Mac's authority)
  if (!running) items.push({ label: t('taskView.archive'), run: () => void archive(taskId) })

  return (
    <>
      <Screen
        title={task.title}
        onBack={() => open({ kind: 'list' })}
        actions={
          items.length > 0 && (
            <IconButton
              title={t('taskView.actions')}
              plainTitle
              size="md"
              icon={<Glyph name="more" step="lg" />}
              onClick={() => setMenu(true)}
            />
          )
        }
        footer={
          <Composer
            value={message}
            onChange={(text) => setDraft(key, text)}
            onSend={send}
            disabled={busy}
            placeholder={
              running ? t('taskView.sendWhenFinished') : t('taskView.sendBackPlaceholder')
            }
          />
        }
      >
        {/* Attributes in one row. No table stacked on top of a reading surface */}
        <ContentBlock placement="footer">
          <Row gap="md" wrap>
            <StatusDot status={task.status} />
            <Text size="sm" tone="secondary">
              {TASK_STATUS_LABEL[task.status]}
            </Text>
            <Text size="sm" tone="tertiary" truncate>
              {project?.name ?? ''}
            </Text>
            <Spacer />
            <Text size="sm" tone="tertiary">
              {relative(task.updatedAt)}
            </Text>
            {task.pending > 0 && (
              <Text size="sm" color={theme.palette.warning.main}>
                {t('taskView.notSynced')}
              </Text>
            )}
          </Row>
        </ContentBlock>
        <Divider />

        {messages.length === 0 && unsent.length === 0 ? (
          /* A conversation iCloud holds but this iPhone has not read is not "none yet" — same lie as the list's */
          <EmptyState
            title={
              loading
                ? t('taskView.loading')
                : detailUnavailable
                  ? t('taskView.fetchingFromCloud')
                  : t('taskView.noConversation')
            }
          >
            {!loading && detailUnavailable && (
              <Text size="sm" tone="tertiary">
                {detailUnavailable}
              </Text>
            )}
          </EmptyState>
        ) : (
          <ContentBlock gap="none" placement="trailing">
            {/* Say it was cut with a mark, not with prose */}
            {detail?.truncated && (
              <ContentBlock placement="footer">
                <Text size="sm" tone="tertiary">
                  ⋯
                </Text>
              </ContentBlock>
            )}
            {messages.map((m) => (
              <Turn
                key={m.id}
                who={
                  m.role === 'user'
                    ? t('taskView.you')
                    : m.role === 'assistant'
                      ? t('taskView.agent')
                      : t('taskView.system')
                }
                note={m.tools > 0 ? t('taskView.tools', { count: m.tools }) : ''}
                at={m.at}
              >
                <Markdown>{m.text}</Markdown>
              </Turn>
            ))}

            {/*
              Not sent yet. **Placed in the same run as what was sent.**
              Move it onto the attributes surface and the person who wrote it loses
              track of where it went (the same judgment as on the Mac)
            */}
            {unsent.map((u) => (
              <Turn key={u.id} who={t('taskView.you')} mark={<Mark unsent={u} />}>
                <Text preWrap tone={u.arrived ? 'primary' : 'secondary'}>
                  {u.text}
                </Text>
              </Turn>
            ))}
          </ContentBlock>
        )}
        <div ref={end} />
      </Screen>

      {menu && (
        <Sheet<() => void>
          options={items.map((i) => ({ value: i.run, label: i.label }))}
          isSelected={() => false}
          onSelect={(run) => run()}
          onClose={() => setMenu(false)}
        />
      )}
    </>
  )
}

/** One turn of the conversation. **Sent and not-yet-sent take the same shape.** */
function Turn({
  who,
  note,
  at,
  mark,
  children
}: {
  who: string
  note?: string
  at?: string | null
  /** A mark placed to the right of the speaker */
  mark?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <ContentBlock gap="sm" placement="body">
      <Row gap="md">
        <Text size="sm" weight="medium" tone="secondary">
          {who}
        </Text>
        {mark}
        {note && (
          <Text size="sm" tone="tertiary">
            {note}
          </Text>
        )}
        <Spacer />
        {at && (
          <Text size="sm" tone="tertiary">
            {relative(at)}
          </Text>
        )}
      </Row>
      {children}
    </ContentBlock>
  )
}

/**
 * The mark for "has not arrived yet". **Never says when it will** (the same as the
 * Mac's convention Q). Every word here is already used somewhere on screen.
 */
function Mark({ unsent }: { unsent: SyncUnsent }): JSX.Element {
  const theme = useTheme()
  if (!unsent.arrived) {
    return (
      <Text size="sm" color={theme.palette.warning.main}>
        {t('taskView.notSynced')}
      </Text>
    )
  }
  return (
    <Text size="sm" tone="tertiary">
      {unsent.reserved ? t('taskView.sendWhenFinished') : t('taskView.sendNextRun')}
    </Text>
  )
}
