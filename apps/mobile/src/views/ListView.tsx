import {
  Alert,
  Button,
  Column,
  ContentBlock,
  ContentEnd,
  EmptyState,
  GroupCaption,
  Row,
  Spinner,
  Text,
  useTheme
} from '@design-system/react'
import { useMemo, useState } from 'react'

import { Group, GroupRow } from '../components/GroupedList.js'
import { ScopeButton } from '../components/ScopeButton.js'
import { Screen } from '../components/Screen.js'
import { Sheet } from '../components/Sheet.js'
import type { SwipeAction } from '../components/SwipeRow.js'
import { SwipeRow } from '../components/SwipeRow.js'
import { relative } from '../lib/time.js'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '../model/labels.js'
import type { TaskScope } from '../model/scope.js'
import { ALL_TASKS, TASK_SCOPES, inScope, sameScope, scopeLabel } from '../model/scope.js'
import { groupByStatus } from '../model/statusGroups.js'
import { countByScope, filterTasks, scopeKey } from '../model/taskList.js'
import { useStore } from '../state/store.js'
import type { SyncTaskView } from '../sync/projection.js'

import { StatusDot } from '../ui/StatusDot.js'

/**
 * The task list. **Directly under a tab, so it gets a large title.**
 *
 * The title is "Tasks". The app's name is not placed here - which app is open was
 * settled the moment it was picked on the home screen.
 *
 * Filtering is **one button that picks a scope**. Lay the options out along a bar and
 * each one thins as the count grows until none can be pressed (that actually
 * happened). Only the Mac's words are used (All tasks / Needs review / the 7 statuses).
 *
 * The list is **cut into sections** (Review -> Failed -> Running -> Queued -> Held ->
 * Draft). The View's display model decides the sectioning. Within a section the
 * execution order the Mac handed over is preserved. As one flat list, "what am I
 * waiting on right now" cannot be read, and the screen only reveals state after the
 * filter is applied again.
 */
export function ListView({ footer }: { footer: JSX.Element }): JSX.Element {
  /*
   * Do not filter inside the selector. zustand decides re-rendering by whether the
   * reference matches last time, so returning a new array on every call means
   * **the updates never stop** (that actually happened).
   */
  const all = useStore((s) => s.view.tasks)
  const scope = useStore((s) => s.scope)
  const setScope = useStore((s) => s.setScope)
  const openTask = useStore((s) => s.openTask)
  const rejected = useStore((s) => s.rejected)
  const dismissRejected = useStore((s) => s.dismissRejected)
  const projects = useStore((s) => s.view.projects)
  const phase = useStore((s) => s.phase)
  const error = useStore((s) => s.error)
  const syncError = useStore((s) => s.syncError)
  const exportUnavailable = useStore((s) => s.exportUnavailable)
  const refresh = useStore((s) => s.refresh)
  const requestAccess = useStore((s) => s.requestAccess)
  const markDone = useStore((s) => s.markDone)
  const archive = useStore((s) => s.archive)
  const generatedAt = useStore((s) => s.view.generatedAt)
  const omittedDone = useStore((s) => s.view.omittedDone)

  const [picking, setPicking] = useState(false)

  const tasks = useMemo(() => filterTasks(all, scope), [all, scope])
  // Cut into sections. Within a section the exported order (the Mac's orderTasks) stands
  const groups = useMemo(() => groupByStatus(tasks), [tasks])
  const counts = useMemo(() => countByScope(all), [all])
  const options = useMemo(
    () =>
      TASK_SCOPES.map((s) => ({
        value: s,
        label: scopeLabel(s),
        count: counts.get(scopeKey(s)) ?? 0
      })),
    [counts]
  )

  const projectName = (id: string): string => projects.find((p) => p.id === id)?.name ?? ''

  return (
    <>
      <Screen
        title={t('listView.title')}
        large
        actions={<ScopeButton label={scopeLabel(scope)} onClick={() => setPicking(true)} />}
        footer={footer}
      >
        {syncError && (
          <ContentBlock gap="none" placement="groupNotice">
            <Alert tone="danger" title={t('listView.syncFailed')}>
              {syncError}
            </Alert>
          </ContentBlock>
        )}
        {rejected.map((r) => (
          <ContentBlock key={r.intentId} gap="none" placement="groupNotice">
            <Alert tone="warning" title={t('listView.rejected')}>
              <Column gap="md" align="start">
                <Text>{r.reason}</Text>
                <Row gap="md">
                  <Button onClick={() => void openTask(r.taskId)}>{t('listView.open')}</Button>
                  <Button variant="ghost" onClick={() => dismissRejected(r.intentId)}>
                    {t('listView.close')}
                  </Button>
                </Row>
              </Column>
            </Alert>
          </ContentBlock>
        ))}

        {/*
          A surface that makes someone wait **always carries something moving**. Text
          alone reads as "frozen" within seconds. Every state gets a next step
        */}
        {phase === 'starting' || phase === 'loading' || phase === 'needsAccess' ? (
          /*
           * This is also reached while permission is being requested. **Show nothing
           * to press** - the OS surface is above this, and all a person does is press
           * "Open"
           */
          <EmptyState title={t('listView.loading')}>
            <Spinner />
          </EmptyState>
        ) : phase === 'declined' ? (
          /*
           * The OS permission was declined. **This is the one place a hand is needed**
           * (the destination is fixed and there is nothing to choose - only permission)
           */
          <EmptyState
            title={t('listView.needsAccess')}
            action={{ label: t('listView.allow'), onClick: () => void requestAccess() }}
          />
        ) : phase === 'failed' ? (
          <EmptyState
            title={t('listView.loadFailed')}
            action={{ label: t('listView.retry'), onClick: () => void refresh() }}
          >
            <Text size="sm" tone="tertiary">
              {error}
            </Text>
          </EmptyState>
        ) : !generatedAt ? (
          /*
           * Nothing from the Mac on screen yet. **Say which side is holding it up.** When iCloud
           * has the export and this iPhone could not read it, blaming the Mac sends a person to
           * the wrong machine (that actually happened, outside). The reason goes here, and the
           * button asks iCloud for it right away instead of waiting on the next re-read
           */
          <EmptyState
            title={
              exportUnavailable ? t('listView.fetchingFromCloud') : t('listView.waitingForMac')
            }
            action={{ label: t('listView.syncNow'), onClick: () => void refresh(true) }}
          >
            <Spinner />
            {exportUnavailable && (
              <Text size="sm" tone="tertiary">
                {exportUnavailable}
              </Text>
            )}
          </EmptyState>
        ) : tasks.length === 0 ? (
          <EmptyState
            /* Words and phrasing match the Mac's empty surface (the same scene in TaskOverview) */
            title={
              sameScope(scope, ALL_TASKS)
                ? t('listView.emptyAll')
                : t('listView.emptyScope', { scope: scopeLabel(scope) })
            }
            action={
              sameScope(scope, ALL_TASKS)
                ? undefined
                : { label: t('listView.showAll'), onClick: () => setScope(ALL_TASKS) }
            }
          />
        ) : (
          <>
            {groups.map((group) => (
              <Group
                key={group.status}
                title={TASK_STATUS_LABEL[group.status]}
                count={group.tasks.length}
              >
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectName={projectName(task.projectId)}
                    onOpen={() => void openTask(task.id)}
                    onDone={() => void markDone(task.id)}
                    onArchive={() => void archive(task.id)}
                  />
                ))}
              </Group>
            ))}
            {/* Do not silence what was cut. But place only the count (no prose) */}
            {scope.kind === 'status' && scope.status === 'done' && omittedDone > 0 && (
              <GroupCaption>
                <Text size="xs" tone="tertiary">
                  {t('listView.omittedDone', { count: omittedDone })}
                </Text>
              </GroupCaption>
            )}
            {/* A breath of space so the last row does not stick to the bottom bar */}
            <ContentEnd />
          </>
        )}
      </Screen>

      {picking && (
        <Sheet<TaskScope>
          options={options}
          isSelected={(v) => sameScope(v, scope)}
          onSelect={setScope}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

/**
 * One row of the list. Pressing goes to the detail, so it carries a `›` (drawn by
 * `GroupRow`). Swiping left reveals actions. **Only the ones that pass in that state.**
 */
function TaskRow({
  task,
  projectName,
  onOpen,
  onDone,
  onArchive
}: {
  task: SyncTaskView
  projectName: string
  onOpen: () => void
  onDone: () => void
  onArchive: () => void
}): JSX.Element {
  const theme = useTheme()
  const actions: SwipeAction[] = []
  // Only what sits at the stage a human reads and decides can be marked done (the same condition as decide)
  if (inScope({ kind: 'review' }, task.status)) {
    actions.push({ label: t('listView.done'), tone: theme.palette.quuu.status.done, run: onDone })
  }
  // A running task cannot be archived (what is running does not stop)
  if (task.status !== 'running') {
    actions.push({ label: t('listView.archive'), tone: theme.palette.text.tertiary, run: onArchive })
  }
  const marks = [
    projectName,
    task.priority <= 1 ? PRIORITY_LABEL[task.priority] : '',
    task.hasPending ? t('listView.waitingToSend') : '',
    task.hasReserved ? t('listView.sendWhenFinished') : ''
  ].filter(Boolean)

  return (
    <SwipeRow actions={actions}>
      <GroupRow
        marker={<StatusDot status={task.status} />}
        onClick={onOpen}
        trailing={
          <Column gap="hairline" align="end" fixed>
            <Text size="xs" tone="tertiary" tabular>
              {relative(task.updatedAt)}
            </Text>
            {/* A row carrying an action that has not reached the Mac yet says so */}
            {task.pending > 0 && (
              <Text size="xs" color={theme.palette.warning.main}>
                {t('listView.notSynced')}
              </Text>
            )}
          </Column>
        }
      >
        <Text truncate fill>
          {task.title}
        </Text>
        <Text size="xs" tone="tertiary" truncate fill>
          {marks.join(' · ')}
        </Text>
      </GroupRow>
    </SwipeRow>
  )
}
