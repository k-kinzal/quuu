import { usePromptFiles } from '../interaction/promptFiles.js'
import { useNewTaskAgent } from '../interaction/newTaskAgent.js'
import { PromptComposer } from './PromptComposer.js'
import { NewTaskAgentSelect } from './NewTaskAgentSelect.js'
import { NewTaskDependencySelect } from './NewTaskDependencySelect.js'
import {
  Alert,
  SplitButton
} from '@design-system/react'
import { safe } from '@orpc/client'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AddAction, Priority, TaskInput } from '../../../preload/api/tasks.js'
import { ADD_ACTIONS, addActionStatus, defaultAddAction } from '../model/addAction.js'
import { t } from '../model/i18n/index.js'
import { ADD_ACTION_LABEL } from '../model/labels.js'
import { failureReason } from '../model/operationFailure.js'
import { queryClient } from '../state/queryClient.js'

import { attachNewTaskLink, linkDependsOn, useNewTaskLink } from '../interaction/taskLink.js'
import { divideDraft, isImeComposing, isSubmitKey, joinDraft, splitDraft } from '../model/composer.js'
import { defaultTargetProjectId } from '../model/derive.js'
import { newTaskDraftKey } from '../state/drafts.js'
import { useStore } from '../state/store.js'

import { ProjectSelect } from '../ui/ProjectSelect.js'
import { focusAny } from '../interaction/focus.js'
import { ChevronDown, CirclePause, FilePen, ICON, Play, Plus, iconProps } from '../ui/icons.js'

/** State the press's outcome in shape too. Never confuse draft, hold, enqueue, and run-now. */
const ACTION_ICON: Record<AddAction, JSX.Element> = {
  draft: <FilePen size={ICON.sm} {...iconProps} />,
  held: <CirclePause size={ICON.sm} {...iconProps} />,
  queued: <Plus size={ICON.sm} {...iconProps} />,
  now: <Play size={ICON.sm} {...iconProps} />
}

/**
 * The task-creation composer at the bottom of the list (rule D).
 *
 * Same shape as the agent-conversation composer. Only the specifiable values differ:
 * this one decides "which project, at which priority".
 *
 * On a project screen the project is already decided by the hierarchy, so show it fixed.
 *
 * Line 1 of the input is the title; line 2 onward is the instructions (rule D-②). Neither
 * this rule nor the key hints get explained in helper text — instead, **the moment you
 * enter line 2, line 1 moves to the row above and is settled** (rule Q).
 * Tasks added from the list go to the queue even title-only. The title doubles as the
 * prompt when there's no body, so only choose draft explicitly via the add action.
 *
 * What happens right after adding (draft / hold / queue / run now) is chosen from the
 * submit button's `▾`. The default is the queue; only an explicit choice overrides it
 * (rule D-③).
 */
export function TaskComposer({ fixedProjectId }: { fixedProjectId?: string }): JSX.Element | null {
  const snapshot = useStore((s) => s.snapshot)
  const moveCursor = useStore((s) => s.moveCursor)
  const creation = useMutation({
    mutationKey: ['tasks', 'create'],
    meta: { feedback: 'inline' },
    mutationFn: (input: TaskInput) => window.quuu.tasks.create(input, { context: { feedback: 'inline' } })
  }, queryClient)
  const openTask = useStore((s) => s.openTask)
  const markLanded = useStore((s) => s.markLanded)
  const [projectAnchor, setProjectAnchor] = useState<HTMLElement | null>(null)

  /*
   * Remember the chosen target (one rule, defaultTargetProjectId — same as the list's one-line input).
   * This composer unmounts when a detail opens or you detour into settings, so keeping
   * the value here would reset to the first project every screen change.
   */
  const targetProjectId = useStore((s) => s.targetProjectId)
  const setTargetProject = useStore((s) => s.setTargetProject)

  /* The add action lives in the store for the same reason (unchosen means follow what was written) */
  const chosenAction = useStore((s) => s.addAction)
  const setAddAction = useStore((s) => s.setAddAction)
  const setNewTaskLink = useStore((s) => s.setNewTaskLink)
  const pushToast = useStore((s) => s.pushToast)

  /* Ordering decided before adding (handed over from right-click or the inspector) */
  const linked = useNewTaskLink()

  // Deleted projects are filtered out on the main side
  const projects = snapshot?.projects ?? []
  const projectId = defaultTargetProjectId(fixedProjectId ?? null, targetProjectId, null, projects)
  const [priority, setPriority] = useState<Priority>(2)
  const ref = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  /** Caret to place back in the body right after splitting/rejoining. null means don't move it */
  const caret = useRef<number | null>(null)

  /**
   * Drafts live in the store (rule D-②). This composer unmounts when a detail opens
   * or you detour into settings, so keeping the text here would lose it.
   * The project screen and the all-tasks list target different places, so their
   * drafts are separate too.
   */
  const draftKey = newTaskDraftKey(fixedProjectId)
  const text = useStore((s) => s.drafts[draftKey] ?? '')
  const setDraft = useStore((s) => s.setDraft)
  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const agent = useNewTaskAgent(project)
  const lead = divideDraft(text)
  /**
   * Body change.
   *
   * While undivided, this input IS the draft. The moment a newline lands, line 1 moves
   * to the row above, so convert the typing position into body coordinates before passing.
   */
  const changeBody = (value: string, selection: number): void => {
    if (lead.divided) {
      setDraft(draftKey, joinDraft(lead.title, value))
      return
    }
    const next = divideDraft(value)
    if (next.divided) caret.current = Math.max(0, selection - (value.length - next.body.length))
    setDraft(draftKey, value)
  }

  const files = usePromptFiles({
    value: lead.divided ? lead.body : text, onChange: changeBody, inputRef: ref,
    scope: draftKey, disabled: creation.isPending
  })

  /*
   * When the line splits or rejoins, the same characters move to a different input.
   * Without placing the typing position into the destination, the hand gets thrown
   * mid-sentence.
   */
  useLayoutEffect(() => {
    const at = caret.current
    if (at === null) return
    caret.current = null
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(at, at)
  }, [text])

  useEffect(() => {
    const focus = (): void => {
      const el = ref.current
      if (!el) return
      el.focus()
      // A draft may remain, so don't select-all.
      // Handing it over selected loses the draft on the very next keystroke
      el.setSelectionRange(el.value.length, el.value.length)
    }
    window.addEventListener('quuu:focus-quickadd', focus)
    return () => window.removeEventListener('quuu:focus-quickadd', focus)
  }, [])

  if (projects.length === 0) return null

  /*
   * If the fixed target isn't in the list, don't show the entry point at all.
   *
   * The screen of an archived project hits this. Falling back to the first project here
   * meant **the chip showed Quuu while the task landed in tmp** (the target state was
   * fixedProjectId while the display was looked up from projects). Better to be unable
   * to write when there's no target than to have what you wrote go missing.
   */
  if (fixedProjectId && !projects.some((p) => p.id === fixedProjectId)) return null

  const draft = splitDraft(text)
  const ready = draft.title.length > 0
  /*
   * Rule D-③: the button names the outcome of pressing it. Don't add buttons — fold the
   * other endings into the `▾`.
   *
   * While nothing is chosen, add to the queue.
   * Once chosen, that wins and **writing more never silently changes it** —
   * so choosing "write instructions but don't run" isn't undone the moment you write.
   */
  const action = chosenAction ?? defaultAddAction()

  /**
   * Run what was added via "run now".
   *
   * When no slot is free, **enqueue it and just state the reason**.
   * Leaving the added task as a draft would mean the press made to run it leaves
   * no trace anywhere (you'd have to notice and re-add it yourself later).
   */
  const runNow = async (taskId: string): Promise<void> => {
    const result = await window.quuu.tasks.runNow(taskId)
    if (result.ok) return
    await window.quuu.tasks.enqueue(taskId)
    pushToast({
      id: `run-${Date.now()}`,
      level: 'warn',
      message: t('taskComposer.runNowFailed'),
      detail: result.reason
    })
  }

  const submit = async (openAfter: boolean): Promise<void> => {
    if (files.isBusy() || queryClient.isMutating({ mutationKey: ['tasks', 'create'] })) return
    const { title, prompt } = splitDraft(text)
    if (title.length === 0 || !projectId) return
    const link = linked?.link ?? null
    const [error, task] = await safe(creation.mutateAsync({
      projectId,
      title,
      prompt,
      priority,
      agentOverrideId: agent.agentOverrideId,
      status: addActionStatus(action),
      /* If the waiting side is the new task, attach in the same single create (don't let it run before the link) */
      dependsOn: linkDependsOn(link)
    }))
    if (error) return
    // The link is for one task only. Don't carry it over to the next one added
    setNewTaskLink(null)
    setDraft(draftKey, '')
    markLanded(task.id)
    await attachNewTaskLink(task.id, link)
    if (action === 'now') await runNow(task.id)
    if (openAfter) await openTask(task.id)
    else {
      await moveCursor(task.id)
      ref.current?.focus()
    }
  }

  return (
    <PromptComposer label={t('taskComposer.label')} busy={files.busy || creation.isPending}
      project={project}
      onPickProject={fixedProjectId ? undefined : event => setProjectAnchor(event.currentTarget)}
      projectPickerOpen={Boolean(projectAnchor)}
      agent={<NewTaskAgentSelect target={agent} />}
      priority={priority} onPriorityChange={setPriority}
      subject={lead.divided ? {
        disabled: creation.isPending, readOnly: files.busy, ref: titleRef,
        value: lead.title, placeholder: t('taskComposer.titlePlaceholder'),
        onChange: e => setDraft(draftKey, joinDraft(e.target.value, lead.body)),
        onKeyDown: (e) => {
          if (isSubmitKey(e)) {
            e.preventDefault()
            void submit(e.shiftKey)
            return
          }
          if (isImeComposing(e)) return
          if (e.key === 'Escape') {
            focusAny('list', 'rail')
            return
          }
          /* The title is one line. A newline here means "move to the body" */
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault()
            ref.current?.focus()
            ref.current?.setSelectionRange(0, 0)
          }
        }
      } : undefined}
      inputRef={ref}
      input={{
        ...files.inputProps, disabled: creation.isPending,
        value: lead.divided ? lead.body : text,
        placeholder: lead.divided ? t('taskComposer.promptPlaceholder') : t('taskComposer.draftPlaceholder'),
        onChange: e => changeBody(e.target.value, e.target.selectionStart ?? 0),
        onKeyDown: (e) => {
          if (files.isBusy()) return
          if (e.key === 'Escape' && !isImeComposing(e)) {
            /* Stopped writing? Return focus to the list (don't strand it on body) */
            focusAny('list', 'rail')
            return
          }
          if (isSubmitKey(e)) {
            e.preventDefault()
            void submit(e.shiftKey)
            return
          }
          /*
           * Deleting at the start of the body rejoins the split lines.
           * Unless this matches deleting a visible newline, the input can
           * never go back to one line once it has split
           */
          if (
            e.key === 'Backspace' &&
            lead.divided &&
            !isImeComposing(e) &&
            e.currentTarget.selectionStart === 0 &&
            e.currentTarget.selectionEnd === 0
          ) {
            e.preventDefault()
            caret.current = lead.title.length
            setDraft(draftKey, lead.title + lead.body)
          }
        }
      }}
      errors={<>
        {files.error && <Alert title={t('promptFiles.failed')}>{failureReason(files.error)}</Alert>}
        {creation.error && <Alert title={t('taskComposer.createFailed')}>{failureReason(creation.error)}</Alert>}
      </>}
      conditions={<NewTaskDependencySelect projectId={project.id} />}
      actions={
        <SplitButton<AddAction>
          color={ready ? 'primary' : 'neutral'}
          disabled={!ready || creation.isPending || files.busy}
          onClick={() => void submit(false)}
          title={`${ADD_ACTION_LABEL[action]} (⌘↵)`}
          startIcon={ACTION_ICON[action]}
          menuTitle={t('taskComposer.addMenuTitle')}
          caret={<ChevronDown size={ICON.sm} {...iconProps} />}
          selected={action}
          options={ADD_ACTIONS.map((a) => ({
            value: a,
            label: ADD_ACTION_LABEL[a],
            icon: ACTION_ICON[a]
          }))}
          onSelect={setAddAction}
        >
          {ADD_ACTION_LABEL[action]}
        </SplitButton>
      }
    >
      <ProjectSelect
        open={Boolean(projectAnchor)} anchorEl={projectAnchor} projects={projects}
        value={projectId} onChange={setTargetProject} onClose={() => setProjectAnchor(null)}
      />
    </PromptComposer>
  )
}
