import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInputRow,
  CommandList,
  CommandRow,
  CommandRowIcon,
  Dot,
  Kbd,
  KeyCap,
  PlainInput,
  SecondaryLabel,
  Text
} from '@design-system/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '../model/labels.js'

import type { PaneId } from '../interaction/focus.js'
import { currentPane, focusAny, focusPane } from '../interaction/focus.js'
import { isImeComposing } from '../model/composer.js'
import { projectMap } from '../model/derive.js'
import { fuzzyMatch, splitByRanges } from '../model/fuzzy.js'
import type { SettingsCategory } from '../state/store.js'
import { useSettings, useStore } from '../state/store.js'
import { StatusDot } from '../ui/StatusDot.js'
import { Bell, Bot, CircleCheckBig, CirclePause, CirclePlay, FolderGit2, ICON, Inbox, Palette, PanelLeftClose, PanelRightClose, Play, Plus, Rows3, Search, Settings, SlidersHorizontal, iconProps } from '../ui/icons.js'

type Group = 'tasks' | 'go' | 'projects' | 'actions'

const GROUP_LABEL: Record<Group, string> = {
  tasks: t('palette.groups.tasks'),
  go: t('palette.groups.go'),
  projects: t('palette.groups.projects'),
  actions: t('palette.groups.actions')
}

interface Item {
  id: string
  group: Group
  title: string
  subtitle?: string
  hint?: string
  icon: JSX.Element
  /** String used for matching (title + aliases). */
  keywords: string
  run(): void
}

const MAX_PER_GROUP = 6

/**
 * The command palette (⌘T).
 *
 * Gathers "where to go / what to do" into one entry point.
 * Rule A's hierarchy stays as is; this is a shortcut for jumping to a
 * destination without walking the hierarchy.
 */
export function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const setOpen = useStore((s) => s.setPalette)
  const snapshot = useStore((s) => s.snapshot)
  const settings = useSettings()
  const setSection = useStore((s) => s.setSection)
  const setSettingsCategory = useStore((s) => s.setSettingsCategory)
  const openProjectSettings = useStore((s) => s.openProjectSettings)
  const section = useStore((s) => s.section)
  const openTask = useStore((s) => s.openTask)
  const closeDetail = useStore((s) => s.closeDetail)
  const cursorTaskId = useStore((s) => s.cursorTaskId)
  const detailOpen = useStore((s) => s.detailOpen)
  const layout = useStore((s) => s.layout)
  const setLayout = useStore((s) => s.setLayout)
  const setSettings = useStore((s) => s.setSettings)
  const applyScheduler = useStore((s) => s.applyScheduler)
  const markDoneAndAdvance = useStore((s) => s.markDoneAndAdvance)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /** The pane that had focus before opening. If closed without choosing, return there. */
  const openedFrom = useRef<PaneId | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    openedFrom.current = currentPane()
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  /**
   * Closing without choosing anything (esc, pressing the backdrop).
   *
   * The vessel itself is set to "don't restore focus" (to avoid the jump target
   * and the focus location disagreeing). **Only on a close without a choice**
   * does this return focus to where it was.
   */
  const dismiss = (): void => {
    const back = openedFrom.current
    setOpen(false)
    requestAnimationFrame(() => {
      if (!back || !focusPane(back)) focusAny('list', 'chat', 'rail')
    })
  }

  const projects = useMemo(() => projectMap(snapshot?.projects ?? []), [snapshot?.projects])
  const scheduler = snapshot?.scheduler
  const cursorTask = snapshot?.tasks.find((t) => t.id === cursorTaskId) ?? null

  const items = useMemo<Item[]>(() => {
    if (!snapshot) return []
    const out: Item[] = []
    /**
     * Close without waiting for the run (the result reaches the screen via the
     * snapshot push).
     *
     * After closing, **hand focus to the jump target's pane**. Otherwise focus stays
     * where it was before opening (usually a half-written input), and at the target
     * ↑↓ and ⏎ still belong to that input. "Moved from the launcher to the list but
     * can't move the cursor" — that actually happened.
     *
     * @param to `auto` = decide from the resulting screen / `keep` = the caller hands it off itself
     */
    const close =
      (fn: () => void | Promise<void>, to: PaneId | 'auto' | 'keep' = 'auto') =>
        () => {
          void fn()
          setOpen(false)
          if (to === 'keep') return
          // Hand off after the pane is drawn (the previous pane is still up at this point)
          requestAnimationFrame(() => {
            if (to !== 'auto') {
              focusPane(to)
              return
            }
            const s = useStore.getState()
            if (s.section.kind === 'settings' || s.projectSettingsOpen) focusAny('settings', 'rail')
            else if (s.detailOpen) focusAny('chat', 'list')
            else focusAny('list', 'rail')
          })
        }

    // --- Tasks ---
    for (const task of snapshot.tasks) {
      if (task.archived) continue
      const project = projects.get(task.projectId)
      out.push({
        id: `task:${task.id}`,
        group: 'tasks',
        title: task.title,
        subtitle: `${project?.name ?? '—'} · ${TASK_STATUS_LABEL[task.status]}`,
        icon: <StatusDot status={task.status} />,
        keywords: `${task.title} ${project?.name ?? ''} ${TASK_STATUS_LABEL[task.status]} ${PRIORITY_LABEL[task.priority]}`,
        run: close(() => void openTask(task.id))
      })
    }

    // --- Go ---
    out.push(
      {
        id: 'go:all',
        group: 'go',
        title: t('palette.allTasks'),
        hint: '⌘1',
        icon: <Inbox size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.allTasks'),
        run: close(() => setSection({ kind: 'all' }))
      },
      {
        id: 'go:review',
        group: 'go',
        title: t('palette.review'),
        subtitle: scheduler ? t('palette.count', { count: scheduler.review + scheduler.failed }) : undefined,
        hint: '⌘2',
        icon: <CircleCheckBig size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.review'),
        run: close(() => setSection({ kind: 'review' }))
      },
      {
        id: 'go:settings',
        group: 'go',
        title: t('palette.settings'),
        hint: '⌘,',
        icon: <Settings size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.settings'),
        run: close(() => setSection({ kind: 'settings' }))
      }
    )

    const categories: Array<{ id: SettingsCategory; label: string; icon: JSX.Element }> = [
      { id: 'general', label: t('palette.categories.general'), icon: <SlidersHorizontal size={ICON.md} {...iconProps} /> },
      { id: 'agents', label: t('palette.categories.agents'), icon: <Bot size={ICON.md} {...iconProps} /> },
      { id: 'notifications', label: t('palette.categories.notifications'), icon: <Bell size={ICON.md} {...iconProps} /> },
      { id: 'appearance', label: t('palette.categories.appearance'), icon: <Palette size={ICON.md} {...iconProps} /> }
    ]
    for (const c of categories) {
      out.push({
        id: `go:settings:${c.id}`,
        group: 'go',
        title: t('palette.settingsCategory', { label: c.label }),
        icon: c.icon,
        keywords: t('palette.keywords.settingsCategory', { label: c.label, id: c.id }),
        run: close(() => {
          setSection({ kind: 'settings' })
          setSettingsCategory(c.id)
        })
      })
    }

    // --- Projects ---
    for (const project of snapshot.projects) {
      const open = snapshot.tasks.filter(
        (t) => t.projectId === project.id && !t.archived && t.status !== 'done'
      ).length
      out.push({
        id: `project:${project.id}`,
        group: 'projects',
        title: project.name,
        subtitle: t('palette.openCount', { count: open }),
        icon: <Dot color={project.color} />,
        keywords: `${project.name} ${project.path}`,
        run: close(() => setSection({ kind: 'project', id: project.id }))
      })
    }

    // --- Actions ---
    if (section.kind === 'project') {
      const current = projects.get(section.id)
      out.push({
        id: 'act:projectSettings',
        group: 'actions',
        title: t('palette.projectSettings', { name: current?.name ?? '' }),
        icon: <Settings size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.projectSettings', { name: current?.name ?? '' }),
        run: close(() => openProjectSettings(true))
      })
    }

    out.push({
      id: 'act:addProject',
      group: 'actions',
      title: t('palette.addProject'),
      hint: '⌘⇧N',
      icon: <FolderGit2 size={ICON.md} {...iconProps} />,
      keywords: t('palette.keywords.addProject'),
      run: close(async () => {
        const path = await window.quuu.system.pickDirectory()
        if (!path) return
        const name = path.split('/').filter(Boolean).pop() ?? 'project'
        const created = await window.quuu.projects.create({ name, path })
        setSection({ kind: 'project', id: created.id })
        openProjectSettings(true)
      }, 'keep')
    })

    out.push({
      id: 'act:new',
      group: 'actions',
      title: t('palette.newTask'),
      hint: '⌘N',
      icon: <Plus size={ICON.md} {...iconProps} />,
      keywords: t('palette.keywords.newTask'),
      run: close(() => {
        setSection({ kind: 'all' })
        setTimeout(() => window.dispatchEvent(new CustomEvent('quuu:focus-quickadd')), 0)
      }, 'keep')
    })

    if (cursorTask) {
      if (cursorTask.status !== 'running' && cursorTask.status !== 'done') {
        out.push({
          id: 'act:run',
          group: 'actions',
          title: t('palette.runNow', { title: cursorTask.title }),
          hint: '⌘R',
          icon: <Play size={ICON.md} {...iconProps} />,
          keywords: t('palette.keywords.runNow', { title: cursorTask.title }),
          run: close(() => void window.quuu.tasks.runNow(cursorTask.id))
        })
      }
      // "Hold" takes it off the queue (keeping a slot is what P0 does; that is set as a priority)
      if (cursorTask.status === 'draft' || cursorTask.status === 'queued') {
        out.push({
          id: 'act:held',
          group: 'actions',
          title: t('palette.hold', { title: cursorTask.title }),
          icon: <CirclePause size={ICON.md} {...iconProps} />,
          keywords: t('palette.keywords.hold', { title: cursorTask.title }),
          run: close(() => void window.quuu.tasks.hold(cursorTask.id))
        })
      }
      if (cursorTask.status === 'held' || cursorTask.status === 'draft') {
        out.push({
          id: 'act:enqueue',
          group: 'actions',
          title: t('palette.enqueue', { title: cursorTask.title }),
          icon: <Inbox size={ICON.md} {...iconProps} />,
          keywords: t('palette.keywords.enqueue', { title: cursorTask.title }),
          run: close(() => void window.quuu.tasks.enqueue(cursorTask.id))
        })
      }
      if (cursorTask.status === 'review' || cursorTask.status === 'failed') {
        out.push({
          id: 'act:done',
          group: 'actions',
          title: t('palette.markDone', { title: cursorTask.title }),
          hint: '⌘⇧D',
          icon: <CircleCheckBig size={ICON.md} {...iconProps} />,
          keywords: t('palette.keywords.done', { title: cursorTask.title }),
          run: close(
            () =>
              void markDoneAndAdvance(
                cursorTask.id,
                snapshot.tasks.map((t) => t.id)
              )
          )
        })
      }
    }

    if (detailOpen) {
      out.push({
        id: 'act:back',
        group: 'actions',
        title: t('palette.maximizeList'),
        hint: 'esc',
        icon: <Rows3 size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.back'),
        run: close(closeDetail)
      })
      out.push({
        id: 'act:list',
        group: 'actions',
        title: layout.listMode === 'hidden' ? t('palette.restoreList') : t('palette.minimizeList'),
        hint: '⌘⌥2',
        icon: <PanelLeftClose size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.list'),
        run: close(() =>
          setLayout({ listMode: layout.listMode === 'hidden' ? 'compact' : 'hidden' })
        )
      })
      out.push({
        id: 'act:inspector',
        group: 'actions',
        title: layout.inspectorOpen ? t('palette.hideInfo') : t('palette.showInfo'),
        hint: '⌘\\',
        icon: <PanelRightClose size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.inspector'),
        run: close(() => setLayout({ inspectorOpen: !layout.inspectorOpen }))
      })
    }

    out.push({
      id: 'act:menu',
      group: 'actions',
      title: layout.railCollapsed ? t('palette.showMenu') : t('palette.hideMenu'),
      hint: '⌘⌥1',
      icon: <PanelLeftClose size={ICON.md} {...iconProps} />,
      keywords: t('palette.keywords.menu'),
      run: close(() => setLayout({ railCollapsed: !layout.railCollapsed }))
    })

    if (scheduler) {
      out.push({
        id: 'act:scheduler',
        group: 'actions',
        title: scheduler.running ? t('palette.pauseScheduler') : t('palette.resumeScheduler'),
        subtitle: t('palette.runningCount', { active: scheduler.activeRuns, total: scheduler.totalSlots }),
        icon: scheduler.running ? (
          <CirclePause size={ICON.md} {...iconProps} />
        ) : (
          <CirclePlay size={ICON.md} {...iconProps} />
        ),
        keywords: t('palette.keywords.scheduler'),
        run: close(() => {
          void (
            scheduler.running ? window.quuu.scheduler.pause() : window.quuu.scheduler.resume()
          ).then(applyScheduler)
        })
      })
    }

    for (const theme of ['dark', 'light', 'system'] as const) {
      if (theme === settings.theme) continue
      out.push({
        id: `act:theme:${theme}`,
        group: 'actions',
        title:
          theme === 'dark'
            ? t('palette.themeDark')
            : theme === 'light'
              ? t('palette.themeLight')
              : t('palette.themeSystem'),
        icon: <Palette size={ICON.md} {...iconProps} />,
        keywords: t('palette.keywords.theme', { theme }),
        run: close(() => void setSettings({ theme }))
      })
    }

    return out
  }, [
    applyScheduler,
    closeDetail,
    cursorTask,
    detailOpen,
    layout,
    markDoneAndAdvance,
    openTask,
    projects,
    scheduler,
    setLayout,
    setOpen,
    setSection,
    setSettings,
    setSettingsCategory,
    settings.theme,
    snapshot,
    openProjectSettings,
    section
  ])

  const results = useMemo(() => {
    const scored = items
      .map((item) => {
        const m = fuzzyMatch(query, item.keywords)
        if (!m) return null
        const titleMatch = fuzzyMatch(query, item.title)
        return {
          item,
          score: m.score + (titleMatch ? titleMatch.score : 0),
          ranges: titleMatch?.ranges ?? []
        }
      })
      .filter(
        (x): x is { item: Item; score: number; ranges: Array<[number, number]> } => x !== null
      )

    if (query.trim().length === 0) {
      // With empty input, show only "what needs a hand now" and the main destinations
      const suggested = scored.filter(
        (s) =>
          s.item.group !== 'tasks' ||
          snapshot?.tasks.find((t) => t.id === s.item.id.slice(5))?.status === 'review' ||
          snapshot?.tasks.find((t) => t.id === s.item.id.slice(5))?.status === 'failed'
      )
      return groupResults(suggested)
    }

    scored.sort((a, b) => b.score - a.score)
    return groupResults(scored)
  }, [items, query, snapshot?.tasks])

  const flat = useMemo(() => results.flatMap((g) => g.items), [results])

  useLayoutEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1))
  }, [active, flat.length])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, flat.length])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent): void => {
    /* During IME composition, the confirming Enter and Escape belong to the input, not the palette */
    if (isImeComposing(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      dismiss()
      return
    }
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault()
      setActive((i) => Math.min(flat.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      flat[active]?.item.run()
    }
  }

  return (
    <CommandDialog open={open} onClose={dismiss}>
      <CommandInputRow>
        <Search size={ICON.md} {...iconProps} />
        <PlainInput
          ref={inputRef}
          textSize="lg"
          value={query}
          placeholder={t('palette.placeholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <KeyCap>esc</KeyCap>
      </CommandInputRow>

      <CommandList ref={listRef}>
        {flat.length === 0 && <CommandEmpty>{t('palette.empty')}</CommandEmpty>}

        {results.map((group) => (
          <div key={group.group}>
            <CommandGroup>{GROUP_LABEL[group.group]}</CommandGroup>
            {group.items.map((entry) => {
              const index = flat.indexOf(entry)
              return (
                <CommandRow
                  key={entry.item.id}
                  type="button"
                  data-active={index === active || undefined}
                  active={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => entry.item.run()}
                >
                  <CommandRowIcon>{entry.item.icon}</CommandRowIcon>
                  <Text size="md" truncate grow>
                    {splitByRanges(entry.item.title, entry.ranges).map((part, i) =>
                      part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>
                    )}
                  </Text>
                  {entry.item.subtitle && (
                    <SecondaryLabel>
                      <Text size="xs" tone="tertiary" truncate>
                        {entry.item.subtitle}
                      </Text>
                    </SecondaryLabel>
                  )}
                  {entry.item.hint && <KeyCap>{entry.item.hint}</KeyCap>}
                </CommandRow>
              )
            })}
          </div>
        ))}
      </CommandList>

      <CommandFooter>
        <span>
          <Kbd>↑↓</Kbd> {t('palette.footerMove')}
        </span>
        <span>
          <Kbd>↵</Kbd> {t('palette.footerRun')}
        </span>
        <span>
          <Kbd>esc</Kbd> {t('palette.footerClose')}
        </span>
      </CommandFooter>
    </CommandDialog>
  )
}

interface Scored {
  item: Item
  score: number
  ranges: Array<[number, number]>
}

const GROUP_ORDER: Group[] = ['tasks', 'projects', 'go', 'actions']

function groupResults(scored: Scored[]): Array<{ group: Group; items: Scored[] }> {
  const byGroup = new Map<Group, Scored[]>()
  for (const s of scored) {
    const list = byGroup.get(s.item.group)
    if (list) list.push(s)
    else byGroup.set(s.item.group, [s])
  }
  return GROUP_ORDER.filter((g) => byGroup.get(g)?.length).map((group) => ({
    group,
    items: byGroup.get(group)!.slice(0, MAX_PER_GROUP)
  }))
}
