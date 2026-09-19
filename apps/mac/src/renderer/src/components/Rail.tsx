import {
  Dot,
  IconButton,
  NavHeading,
  NavItem,
  NavSection,
  SideNav,
  SideNavTop,
  Spacer,
  claimContextMenu,
  motionRegion,
  useTheme,
  type MenuItemSpec
} from '@design-system/react'
import { useMemo } from 'react'
import { copyItem, group } from '../interaction/contextMenu.js'
import { moveWithinList, pane } from '../interaction/focus.js'
import { contextMenu } from '../interaction/menu.js'
import { openWithItems } from '../interaction/openWith.js'
import { projectStateItems } from '../interaction/projectActions.js'
import { useWindowLayout } from '../interaction/useWindowLayout.js'
import { openCountByProject, reviewCount } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import type { Section } from '../state/store.js'
import { useStore } from '../state/store.js'
import { CircleCheckBig, ICON, Inbox, PanelLeftClose, PanelLeftOpen, Plus, Settings, iconProps } from '../ui/icons.js'

/**
 * L0 navigation (rule F).
 *
 * Top = the work targets seen daily, middle = projects, bottom = settings (configuration).
 *
 * Collapsed, it is not a "shrunken copy of the expanded form" (rule C-4b).
 * A vertical stack of color dots alone can't tell projects apart, so they don't stay
 * on the collapsed rail. Projects are reached via ⌘T or by opening the rail.
 *
 * **This surface takes on the window's top edge.** There is no title bar, so the
 * traffic lights (close, minimize, zoom) sit on the rail's top edge, and this is
 * also the surface you grab to move the window.
 */
export function Rail(): JSX.Element {
  const { COLLAPSED_RAIL_WIDTH, WINDOW_BUTTONS_INSET } = useWindowLayout()
  const snapshot = useStore((s) => s.snapshot)
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const openProjectSettings = useStore((s) => s.openProjectSettings)
  const layout = useStore((s) => s.layout)
  const setLayout = useStore((s) => s.setLayout)
  const theme = useTheme()

  const collapsed = layout.railCollapsed
  const counts = useMemo(() => openCountByProject(snapshot?.tasks ?? []), [snapshot?.tasks])
  const reviews = useMemo(() => reviewCount(snapshot?.tasks ?? []), [snapshot?.tasks])
  /* Removed projects don't enter the snapshot (main filters them out) */
  const projects = snapshot?.projects ?? []
  const open = useMemo(() => {
    let total = 0
    for (const v of counts.values()) total += v
    return total
  }, [counts])

  const isActive = (target: Section): boolean => {
    if (target.kind === 'project') return section.kind === 'project' && section.id === target.id
    return section.kind === target.kind
  }

  const addProject = async (): Promise<void> => {
    const path = await window.quuu.system.pickDirectory()
    if (!path) return
    const name = path.split('/').filter(Boolean).pop() ?? 'project'
    const created = await window.quuu.projects.create({ name, path })
    setSection({ kind: 'project', id: created.id })
    openProjectSettings(true)
  }

  const toggle = (
    <IconButton
      title={collapsed ? t('rail.showMenu') : t('rail.hideMenu')}
      icon={
        collapsed ? (
          <PanelLeftOpen size={ICON.md} {...iconProps} />
        ) : (
          <PanelLeftClose size={ICON.md} {...iconProps} />
        )
      }
      onClick={() => setLayout({ railCollapsed: !collapsed })}
    />
  )

  return (
    <SideNav
      collapsed={collapsed}
      width={layout.rail}
      /* One column's width of symbols. The traffic lights' overhang is absorbed as margin by the adjacent heading. */
      collapsedWidth={COLLAPSED_RAIL_WIDTH}
      /* Material and border belong to LeftMenu's single vessel. */
      surface="transparent"
      bordered={false}
      {...pane('rail')}
      {...motionRegion('navigation', 'left')}
      aria-label={t('rail.label')}
      /*
       * Vertically stacked rows are walkable with ↑↓.
       * ⇥ also walks them, but ⇥ doubles as "to the next pane",
       * so walking within the pane is handled here (same shape as list and chat)
       */
      onKeyDown={(e) => moveWithinList(e, 'button')}
      /* "Add project" is reachable even off the rows (don't make anyone hunt for the ＋) */
      onContextMenu={(e) => {
        if (!claimContextMenu(e)) return
        void contextMenu([
          {
            label: t('rail.addProjectMenu'),
            accelerator: 'Cmd+Shift+N',
            onSelect: () => void addProject()
          },
          {
            label: collapsed ? t('rail.showMenuItem') : t('rail.hideMenuItem'),
            accelerator: 'Cmd+Alt+1',
            separatorBefore: true,
            onSelect: () => setLayout({ railCollapsed: !collapsed })
          }
        ])
      }}
    >
      {/*
        The window's top band. Home of the traffic lights, and the surface you grab
        to move the window. The collapsed width is exactly filled by the traffic
        lights, so nothing is placed there then
      */}
      <SideNavTop
        collapsed={collapsed}
        draggable
        inset={collapsed ? undefined : WINDOW_BUTTONS_INSET}
      >
        {!collapsed && toggle}
      </SideNavTop>

      {/* Collapsed, the expand control sits below the band at the head of the symbol column (one axis) */}
      {collapsed && <SideNavTop collapsed>{toggle}</SideNavTop>}

      <NavSection>
        <NavItem
          icon={<Inbox size={ICON.md} {...iconProps} />}
          label={t('rail.allTasks')}
          badge={open}
          collapsed={collapsed}
          active={isActive({ kind: 'all' })}
          onClick={() => setSection({ kind: 'all' })}
        />
        <NavItem
          icon={<CircleCheckBig size={ICON.md} {...iconProps} />}
          label={t('rail.review')}
          badge={reviews}
          accent={theme.palette.warning.main}
          collapsed={collapsed}
          active={isActive({ kind: 'review' })}
          onClick={() => setSection({ kind: 'review' })}
        />
      </NavSection>

      {/* Rule C-4b: no projects when collapsed (dots alone can't be told apart) */}
      {!collapsed && (
        <NavSection grow>
          <NavHeading>
            <span>{t('rail.projects')}</span>
            <IconButton
              size="xs"
              title={t('rail.addProjectTitle')}
              icon={<Plus size={ICON.sm} {...iconProps} />}
              onClick={() => void addProject()}
            />
          </NavHeading>

          {projects.length === 0 && (
            <NavItem
              icon={<Plus size={ICON.md} {...iconProps} />}
              label={t('rail.add')}
              onClick={() => void addProject()}
            />
          )}

          {projects.map((p) => (
            <NavItem
              key={p.id}
              icon={<Dot emphasis color={p.color} muted={!p.enabled} />}
              label={p.name}
              title={p.path}
              badge={counts.get(p.id)}
              active={isActive({ kind: 'project', id: p.id })}
              onClick={() => setSection({ kind: 'project', id: p.id })}
              onContextMenu={(e) => {
                if (claimContextMenu(e)) void contextMenu(projectMenuItems(p.id))
              }}
            />
          ))}
        </NavSection>
      )}

      {collapsed && <Spacer />}

      {/* Rule F: configuration is pinned to the very bottom */}
      <NavSection pinned>
        <NavItem
          icon={<Settings size={ICON.md} {...iconProps} />}
          label={t('rail.settings')}
          collapsed={collapsed}
          active={isActive({ kind: 'settings' })}
          onClick={() => setSection({ kind: 'settings' })}
        />
      </NavSection>
    </SideNav>
  )
}

/** What can be done to a single project. Opens from both a rail row and the list surface. */
function projectMenuItems(projectId: string): MenuItemSpec[] {
  const state = useStore.getState()
  const project = state.snapshot?.projects.find((p) => p.id === projectId)
  if (!project) return []

  return [
    { label: t('rail.open'), onSelect: () => state.setSection({ kind: 'project', id: project.id }) },
    {
      label: t('rail.projectSettings'),
      onSelect: () => {
        state.setSection({ kind: 'project', id: project.id })
        state.openProjectSettings(true)
      }
    },
    ...group(openWithItems({ kind: 'project', id: project.id })),
    ...group(copyItem(t('rail.copyDirectory'), project.path)),
    ...group(projectStateItems(project))
  ]
}
