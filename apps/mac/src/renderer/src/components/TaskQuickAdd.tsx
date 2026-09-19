import { useNewTaskAgent } from '../interaction/newTaskAgent.js'
import { NewTaskAgentSelect } from './NewTaskAgentSelect.js'
import { NewTaskDependencySelect } from './NewTaskDependencySelect.js'
import {
  Alert, Dot,
  IconButton,
  InlineAddRow, MarkerSlot,
  PlainInput
} from '@design-system/react'
import { safe } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { TaskInput } from '../../../preload/api/tasks.js'
import { focusAny } from '../interaction/focus.js'
import { attachNewTaskLink, linkDependsOn, useNewTaskLink } from '../interaction/taskLink.js'
import { isImeComposing, isSubmitKey } from '../model/composer.js'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { LINK_DIRECTION_LABEL } from '../model/taskLinkModel.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { ProjectSelect } from '../ui/ProjectSelect.js'

/**
 * A one-line input for queueing onto the list you are running alongside (rules C-7 / D).
 *
 * While a detail is open there is exactly one composer on screen, the conversation's (rule D).
 * So this is not a composer. It takes **the shape of a list row that became an input**
 * and accepts only a title. The title becomes the first instruction and lands in the queue.
 *
 * The destination shows its default up front and can be changed from the dot (fixed on a
 * project screen). Always show it, default included, so nobody presses Enter without knowing
 * where it lands. A changed destination is remembered (you queue several into the same place);
 * collapsing the row or moving screens doesn't revert it.
 */
export function TaskQuickAdd({
  project,
  projects,
  fixed,
  onClose
}: {
  project: Project
  projects: Project[]
  fixed: boolean
  onClose(): void
}): JSX.Element {
  const creation = useMutation({
    mutationKey: ['tasks', 'create'],
    meta: { feedback: 'inline' },
    mutationFn: (input: TaskInput) => window.quuu.tasks.create(input, { context: { feedback: 'inline' } })
  }, queryClient)
  const openTask = useStore((s) => s.openTask)
  const markLanded = useStore((s) => s.markLanded)
  /* The chosen destination lives in the store. This row collapses, so keeping it here would reset it on the next open */
  const setTargetProject = useStore((s) => s.setTargetProject)
  const setNewTaskLink = useStore((s) => s.setNewTaskLink)

  /* An ordering decided before queueing (arrives when "task that follows" was picked from a detail) */
  const linked = useNewTaskLink()

  const [title, setTitle] = useState('')
  const [projectAnchor, setProjectAnchor] = useState<HTMLElement | null>(null)
  // Don't collapse on blur while a menu is open (an OS menu takes focus off the window)
  const picking = useRef(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => ref.current?.focus(), [])

  // Pressing ⌘N again while it is already open also puts you back where you can type
  useEffect(() => {
    const focus = (): void => ref.current?.focus()
    window.addEventListener('quuu:focus-quickadd', focus)
    return () => window.removeEventListener('quuu:focus-quickadd', focus)
  }, [])

  // The parent decides the destination (an explicit pick wins; the rule lives in defaultTargetProjectId alone)
  const target = project
  const agent = useNewTaskAgent(project)

  /*
   * Drop the held ordering along with the row when it collapses.
   * If a link closed without queueing stuck around, the next unrelated task queued
   * would silently be made to wait.
   */
  const close = (): void => {
    setNewTaskLink(null)
    onClose()
  }

  const onPickingDependency = useCallback((open: boolean): void => {
    picking.current = open
    if (!open) ref.current?.focus()
  }, [])

  const openProjectPick = (event: React.MouseEvent<HTMLElement>): void => {
    picking.current = true
    setProjectAnchor(event.currentTarget)
  }
  const closeProjectPick = (): void => {
    setProjectAnchor(null)
    picking.current = false
  }

  const submit = async (openAfter: boolean): Promise<void> => {
    if (queryClient.isMutating({ mutationKey: ['tasks', 'create'] })) return
    const value = title.trim()
    if (value.length === 0) return
    const link = linked?.link ?? null
    const [error, task] = await safe(creation.mutateAsync({
      projectId: target.id,
      title: value,
      prompt: '',
      priority: 2,
      status: 'queued',
      agentOverrideId: agent.agentOverrideId,
      /* If the new task is the waiting side, link it in the same call that creates it (never run before the link exists) */
      dependsOn: linkDependsOn(link)
    }))
    if (error) return
    // A link is good for one task only. Don't carry it over to the next one queued
    setNewTaskLink(null)
    setTitle('')
    await attachNewTaskLink(task.id, link)
    // Flash where it landed. Don't move the cursor —
    // while a detail is open the cursor IS "the task you have open", so moving it
    // would throw you off what you were reading just because you queued something
    markLanded(task.id)
    if (openAfter) {
      onClose()
      await openTask(task.id)
    } else {
      // Leave the input open so you can keep queueing
      ref.current?.focus()
    }
  }

  return (
    <>
      <InlineAddRow>
        <NewTaskDependencySelect projectId={target.id} compact onPicking={onPickingDependency} />

        <PlainInput
          disabled={creation.isPending}
          ref={ref}
          type="text"
          value={title}
          spellCheck={false}
          /* The marker's tooltip carries the other task's name. At this width, a name here always gets cut off */
          placeholder={
            linked
              ? t('quickAdd.linkedPlaceholder', { direction: LINK_DIRECTION_LABEL[linked.link.direction] })
              : t('quickAdd.titlePlaceholder')
          }
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            /* Never mistake committing or cancelling an IME conversion for "queue" or "give up" (rule D-②) */
            if (isSubmitKey(e)) {
              e.preventDefault()
              void submit(e.shiftKey)
              return
            }
            if (e.key === 'Escape' && !isImeComposing(e)) {
              e.preventDefault()
              close()
              /* Don't leave focus on a collapsed row. Giving up on queueing returns you to the list */
              focusAny('list', 'chat')
            }
          }}
          onBlur={(e) => {
            // Don't collapse when ⇥ just moved to the destination marker (focus is still inside this row)
            const next = e.relatedTarget
            if (next instanceof Node && e.currentTarget.parentElement?.contains(next)) return
            // Never discard half-written text. Collapse only when focus leaves while empty
            if (title.trim().length === 0 && !picking.current) close()
          }}
        />

        <NewTaskAgentSelect target={agent} compact onPicking={open => { picking.current = open; if (!open) ref.current?.focus() }} />

        {fixed ? (
          <MarkerSlot title={target.path}>
            <Dot color={target.color} />
          </MarkerSlot>
        ) : (
          <IconButton
            size="xs"
            title={t('quickAdd.targetTitle', { name: target.name, path: target.path })}
            plainTitle
            aria-haspopup="listbox"
            icon={<Dot color={target.color} />}
            aria-expanded={Boolean(projectAnchor)}
            /* Open the menu before blur collapses the row */
            onMouseDown={(e) => {
              e.preventDefault()
              openProjectPick(e)
            }}
            /* Pressed by key (`detail` is 0). The pointer path opened it above, so don't open twice */
            onClick={(e) => {
              if (e.detail !== 0) return
              openProjectPick(e)
            }}
          />
        )}

        <ProjectSelect
          open={Boolean(projectAnchor)} anchorEl={projectAnchor} projects={projects}
          value={target.id} onChange={setTargetProject} onClose={closeProjectPick}
        />
      </InlineAddRow>
      {creation.error && <Alert title={t('quickAdd.createFailed')}>{failureReason(creation.error)}</Alert>}
    </>
  )
}
