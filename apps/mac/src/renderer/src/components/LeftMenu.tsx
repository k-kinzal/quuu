import { CollapseHandle, GlassPanel, GlassPanelDivider, Resizer } from '@design-system/react'
import type { Project } from '../../../api/schemas/projects.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { ChevronRight, ICON, iconProps } from '../ui/icons.js'
import { ProjectNavigation } from '../views/project/ProjectNavigation.js'
import { Rail } from './Rail.js'
import { TaskSidebar } from './TaskSidebar.js'
import { shortcut } from '../interaction/shortcut.js'

/** Project navigation and the companion list share the rail's material and outer edge. */
export function LeftMenu({ showTasks, project }: { showTasks: boolean; project?: Project }): JSX.Element {
  const layout = useStore((s) => s.layout)
  const setLayout = useStore((s) => s.setLayout)
  const navigationResizer = !layout.railCollapsed && (
    <Resizer
      value={layout.rail}
      profile="navigation"
      label={t('leftMenu.menuWidth')}
      onChange={(rail) => setLayout({ rail })}
    />
  )

  return (
    <GlassPanel aria-label={t('leftMenu.label')}>
      <Rail />
      {showTasks || project ? (
        <>
          <GlassPanelDivider>{navigationResizer}</GlassPanelDivider>
          {project && <ProjectNavigation project={project} />}
          {/* A task opened inside a project keeps the project's own navigation beside the list that queues work */}
          {project && showTasks && <GlassPanelDivider />}
          {!showTasks ? null : layout.listMode === 'compact' ? (
            <>
              <TaskSidebar />
              <Resizer
                value={layout.list}
                profile="collection"
                label={t('leftMenu.listWidth')}
                onChange={(list) => setLayout({ list })}
              />
            </>
          ) : (
            <CollapseHandle
              title={t('leftMenu.restoreList', { shortcut: shortcut('Cmd+Alt+2') })}
              surface="transparent"
              bordered={false}
              icon={<ChevronRight size={ICON.sm} {...iconProps} />}
              onClick={() => setLayout({ listMode: 'compact' })}
            />
          )}
        </>
      ) : navigationResizer}
    </GlassPanel>
  )
}
