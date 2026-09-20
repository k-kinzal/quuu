import {
  AmbientGradient,
  AppShell,
  AppShellBody,
  AppShellMain,
  EmptyState,
  MotionLayout,
  Panel,
  ThemeProvider,
  jaStrings
} from '@design-system/react'
import { useEffect } from 'react'
import type { CommandPayload } from '../../preload/api/desktop.js'
import { CommandPalette } from './components/CommandPalette.js'
import { Footer } from './components/Footer.js'
import { LeftMenu } from './components/LeftMenu.js'
import { RendererBoundary } from './components/RendererBoundary.js'
import { TaskOverview } from './components/TaskOverview.js'
import { TaskWorkspace } from './components/TaskWorkspace.js'
import { Toasts } from './components/Toasts.js'
import { stepHistory, useSwipeBackForward } from './interaction/backForward.js'
import { confirmDestructive } from './interaction/contextMenu.js'
import type { PaneId } from './interaction/focus.js'
import { focusAny, focusPane, isTyping, movePaneFocus, openContextMenuAtFocus } from './interaction/focus.js'
import { runTaskListKey } from './interaction/listNav.js'
import { openWithCommand } from './interaction/openWith.js'
import { startNewTask } from './interaction/taskLink.js'
import { useOrderedTasks } from './interaction/useTasks.js'
import { isJapanese, t } from './model/i18n/index.js'
import { useCursorTask, useStore } from './state/store.js'
import { buildTheme } from './ui/theme.js'
import { SettingsShell } from './views/SettingsShell.js'
import { ProjectDetail } from './views/project/ProjectDetail.js'

/**
 * The color scheme just passes through the value settings holds. Resolving `system`
 * and following the OS stays inside the design system.
 *
 * The theme layers domain colors via `buildTheme` (the split: rules belong to the
 * design system, vocabulary to the app).
 *
 * `translucent` declares "don't paint the window's ground". Quuu has no window band,
 * and the rail and list are surfaces that let the OS blur show through, so each
 * surface paints its own ground.
 */
export function App(): JSX.Element {
  const theme = useStore((s) => s.settings?.theme ?? 'dark')
  return (
    <ThemeProvider colorScheme={theme} buildTheme={buildTheme} translucent strings={isJapanese ? jaStrings : undefined}>
      <RendererBoundary>
        <Shell />
        <AmbientGradient />
      </RendererBoundary>
    </ThemeProvider>
  )
}

/**
 * Hand focus over only after the pane exists.
 *
 * `setSection` and `closeDetail` only schedule a re-render, so calling `focus()`
 * right away targets a pane that isn't in the DOM yet (what's there is the pane
 * about to disappear).
 */
function focusPaneSoon(id: PaneId): void {
  requestAnimationFrame(() => focusPane(id))
}

/**
 * Return focus to the list.
 *
 * The list isn't always there (minimized, or the settings pane). Fall back to the
 * chat, and failing that the rail. **Never leave focus stranded on body** —
 * keys landing there reach no one, and all that's left is "it doesn't work".
 */
function focusList(): void {
  requestAnimationFrame(() => focusAny('list', 'chat', 'rail'))
}

function Shell(): JSX.Element {
  const ready = useStore((s) => s.ready)
  const initializationError = useStore((s) => s.initializationError)
  const init = useStore((s) => s.init)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const setLayout = useStore((s) => s.setLayout)
  const layout = useStore((s) => s.layout)
  const detailOpen = useStore((s) => s.detailOpen)
  const closeDetail = useStore((s) => s.closeDetail)
  const openTask = useStore((s) => s.openTask)
  const projectSettingsOpen = useStore((s) => s.projectSettingsOpen)
  const openProjectSettings = useStore((s) => s.openProjectSettings)
  const snapshot = useStore((s) => s.snapshot)
  const task = useCursorTask()
  const ordered = useOrderedTasks()

  useEffect(() => {
    void init()
  }, [init])

  useSwipeBackForward()

  /**
   * Commands from the native menu / tray / notifications.
   * Shortcuts are defined in one place — the menu — so the renderer
   * only executes commands here.
   */
  useEffect(() => {
    const run = async (payload: CommandPayload): Promise<void> => {
      const { command, taskId, projectId, value } = payload
      const s = useStore.getState()
      const cursor = taskId ?? s.cursorTaskId
      const list = ordered.map((t) => t.id)

      switch (command) {
        case 'view.palette':
          s.setPalette(!s.paletteOpen)
          return
        /*
         * After moving to the destination, hand focus to that pane.
         *
         * Just moving leaves focus where it was before the press (usually an input).
         * Then ↑↓ and ⏎ at the destination belong to that input, and
         * **the list can't be driven by keyboard alone** (that's how it actually was)
         */
        case 'view.all':
          setSection({ kind: 'all' })
          focusList()
          return
        case 'view.review':
          setSection({ kind: 'review' })
          focusList()
          return
        case 'view.settings':
          setSection({ kind: 'settings' })
          focusPaneSoon('settings')
          return
        case 'view.project':
          // What the menu points at may be gone (archived, deleted)
          if (projectId && s.snapshot?.projects.some((p) => p.id === projectId)) {
            setSection({ kind: 'project', id: projectId })
            focusList()
          }
          return
        case 'view.search':
          // The palette is the one place to search (no search field at the top of the window).
          // ⌘F stays as macOS convention and lands in the same place
          s.setPalette(true)
          return
        /*
         * Retrace steps. Which screens count as somewhere you have been is the
         * store's to say (`state/navigation.ts`); the same path serves the swipe,
         * so a key and a gesture can never land differently
         */
        case 'view.back':
        case 'view.forward':
          await stepHistory(command === 'view.back' ? -1 : 1)
          return
        case 'focus.next':
          movePaneFocus(1)
          return
        case 'focus.prev':
          movePaneFocus(-1)
          return
        case 'menu.context':
          openContextMenuAtFocus()
          return
        case 'panel.rail':
          setLayout({ railCollapsed: !s.layout.railCollapsed })
          return
        case 'panel.list': {
          if (!s.detailOpen) return
          const next = s.layout.listMode === 'hidden' ? 'compact' : 'hidden'
          setLayout({ listMode: next })
          // Don't leave focus on a hidden pane / when a pane comes back, focus comes back with it
          if (next === 'compact') focusList()
          else focusPaneSoon('chat')
          return
        }
        case 'panel.inspector':
          setLayout({ inspectorOpen: !s.layout.inspectorOpen })
          return
        case 'project.add': {
          const path = await window.quuu.system.pickDirectory()
          if (!path) return
          const name = path.split('/').filter(Boolean).pop() ?? 'project'
          const created = await window.quuu.projects.create({ name, path })
          setSection({ kind: 'project', id: created.id })
          openProjectSettings(true)
          return
        }
        case 'project.settings':
          if (s.section.kind === 'project') openProjectSettings(true)
          return
        /*
         * One path opens the queueing surface (`startNewTask`). The surface differs
         * per screen (the full-width table uses the bottom composer; while the detail
         * is open, the list's one-line input), so spelling out how to open it here
         * quickly produces a state where only one of them got fixed
         */
        case 'task.new':
          // No carry-over: don't let a previously chosen target leak into the next task
          startNewTask(null)
          return
        case 'task.addAfter':
        case 'task.addBefore':
          if (cursor) {
            startNewTask({
              taskId: cursor,
              direction: command === 'task.addAfter' ? 'after' : 'before',
              mode: 'done'
            })
          }
          return
        case 'task.open':
          // A task named by the command comes from an OS notification: land where the
          // toast would (stay in this section when it holds the task). Without one it is
          // ⌘O on the row under the cursor, which is in view by definition
          if (taskId) {
            await s.revealTask(taskId)
            focusList()
          } else if (cursor) {
            await openTask(cursor)
            // Opening keeps focus on the list (same as ⏎, so moving to the next task stays possible)
            focusList()
          }
          return
        case 'task.close':
          if (s.detailOpen) {
            closeDetail()
            focusList()
          }
          return
        case 'task.runNow':
          if (cursor) await window.quuu.tasks.runNow(cursor)
          return
        case 'task.markDone':
          if (cursor) await s.markDoneAndAdvance(cursor, list)
          return
        case 'task.sendBack':
          if (!cursor) return
          if (!s.detailOpen) await openTask(cursor)
          setTimeout(() => window.dispatchEvent(new CustomEvent('quuu:focus-composer')), 0)
          return
        case 'task.setPriority': {
          if (!cursor || value === undefined) return
          if (value !== 0 && value !== 1 && value !== 2 && value !== 3) return
          await window.quuu.tasks.update({ id: cursor, patch: { priority: value } })
          return
        }
        /*
         * The 3 ways into the working directory. The destination is where the task
         * actually ran (the worktree if there is one). Why it can't open comes back
         * from main and is said in a toast (never silently do nothing)
         */
        case 'task.openTerminal':
        case 'task.resumeTerminal':
        case 'task.openEditor':
          if (cursor) openWithCommand(command, cursor)
          return
        case 'task.archive':
          if (cursor) {
            await window.quuu.tasks.archive({ id: cursor, archived: true })
            // Return focus only when the open pane disappears. Don't steal it mid-typing
            if (s.detailOpen) {
              closeDetail()
              focusList()
            }
          }
          return
        case 'task.delete': {
          if (!cursor) return
          const target = s.snapshot?.tasks.find((t) => t.id === cursor)
          if (!target) return
          const ok = await confirmDestructive(
            t('app.deleteTaskConfirm', { title: target.title }),
            t('app.deleteTaskDetail')
          )
          if (!ok) return
          await window.quuu.tasks.remove(cursor)
          if (s.detailOpen) closeDetail()
          return
        }
      }
    }

    return window.quuuEvents.command((payload) => void run(payload))
  }, [closeDetail, openProjectSettings, openTask, ordered, setLayout, setSection])

  /**
   * Only keys that make no sense on a menu are handled here.
   * ⌘-style shortcuts are defined by the native menu.
   *
   * Keys a pane handled itself (the list's ↑↓, etc.) show up as `defaultPrevented`,
   * so they aren't processed twice. What lands here is
   *
   *   - **Esc** (go back one level). It should mean the same from any pane
   *   - ↑↓ ⏎ **when no pane has focus** (body). Right after launch, or right after a pane disappears
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const state = useStore.getState()
      // While open, the panes behind hold no focus (the palette owns its own keys)
      if (state.paletteOpen) return
      // Don't re-process what a pane already answered
      if (e.defaultPrevented) return

      const typing = isTyping(e.target)

      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        /*
         * Esc while typing belongs to the input (canceling IME, collapsing a draft).
         * Inputs return focus to the list themselves, so don't intercept here
         */
        if (typing) return
        if (state.detailOpen) {
          e.preventDefault()
          closeDetail()
          focusList()
        } else if (state.projectSettingsOpen) {
          e.preventDefault()
          openProjectSettings(false)
          focusList()
        }
        return
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      /*
       * If a pane has focus, ↑↓ ⏎ belong to that pane.
       * This may take them only **when nothing has focus**
       */
      const active = document.activeElement
      if (active && active !== document.body) return
      runTaskListKey(e, ordered)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeDetail, openProjectSettings, ordered])

  if (!ready) {
    return (
      <AppShell glass>
        <AppShellBody>
          <AppShellMain windowHeader>
            <AppShellBody>
              <EmptyState
                title={initializationError ? t('app.loadFailed') : t('app.loading')}
                action={initializationError ? { label: t('app.retry'), onClick: () => void init() } : undefined}
              >
                {initializationError}
              </EmptyState>
            </AppShellBody>
            <Footer />
          </AppShellMain>
        </AppShellBody>
        <Toasts />
      </AppShell>
    )
  }

  const isSettings = section.kind === 'settings'
  const project =
    section.kind === 'project' ? snapshot?.projects.find((p) => p.id === section.id) : undefined

  return (
    <AppShell glass>
      <AppShellBody>
        <MotionLayout
          motionKey={`${detailOpen ? task?.id ?? 'missing' : 'overview'}:${layout.railCollapsed}:${layout.listMode}`}
          contextKey={`${section.kind}:${section.kind === 'project' ? section.id : ''}:${projectSettingsOpen}`}
        >
          <LeftMenu showTasks={!isSettings && !(projectSettingsOpen && project) && detailOpen} />
          <AppShellMain windowHeader>
            <AppShellBody>
              {isSettings ? (
                <SettingsShell />
              ) : projectSettingsOpen && project ? (
                <ProjectDetail project={project} onBack={() => openProjectSettings(false)} />
              ) : detailOpen ? (
                task ? (
                  <TaskWorkspace task={task} />
                ) : (
                  <Panel surface="canvas" grow>
                    <EmptyState title={t('app.taskNotFound')} />
                  </Panel>
                )
              ) : (
                <TaskOverview />
              )}
            </AppShellBody>
            <Footer />
          </AppShellMain>
        </MotionLayout>
      </AppShellBody>
      <CommandPalette />
      <Toasts />
    </AppShell>
  )
}
