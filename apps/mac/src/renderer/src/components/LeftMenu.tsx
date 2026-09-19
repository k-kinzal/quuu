import { CollapseHandle, GlassPanel, GlassPanelDivider, Resizer } from '@design-system/react'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { ChevronRight, ICON, iconProps } from '../ui/icons.js'
import { Rail } from './Rail.js'
import { TaskSidebar } from './TaskSidebar.js'

/** The list running alongside the nav stays inside the same single sheet of material, open or collapsed. */
export function LeftMenu({ showTasks }: { showTasks: boolean }): JSX.Element {
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
      {showTasks ? (
        <>
          <GlassPanelDivider>{navigationResizer}</GlassPanelDivider>
          {layout.listMode === 'compact' ? (
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
              title={t('leftMenu.restoreList')}
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
