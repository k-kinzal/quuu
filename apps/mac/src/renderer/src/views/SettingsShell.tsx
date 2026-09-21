import { MenuNav, MenuNavItem, MenuNavTitle, Panel, Row } from '@design-system/react'
import { moveWithinList, pane } from '../interaction/focus.js'
import { useWindowLayout } from '../interaction/useWindowLayout.js'
import { t } from '../model/i18n/index.js'
import type { SettingsCategory } from '../state/store.js'
import { useStore } from '../state/store.js'
import { Bell, Bot, ICON, Palette, ScrollText, SlidersHorizontal, Smartphone, iconProps } from '../ui/icons.js'
import { AgentSettings } from './settings/AgentSettings.js'
import { AppearanceSettings } from './settings/AppearanceSettings.js'
import { GeneralSettings } from './settings/GeneralSettings.js'
import { MobileSettings } from './settings/MobileSettings.js'
import { NotificationSettings } from './settings/NotificationSettings.js'
import { ReportSettings } from './settings/ReportSettings.js'

const CATEGORIES: Array<{
  id: SettingsCategory
  label: string
  icon: JSX.Element
}> = [
    { id: 'general', label: t('settingsShell.general'), icon: <SlidersHorizontal size={ICON.md} {...iconProps} /> },
    { id: 'agents', label: t('settingsShell.agents'), icon: <Bot size={ICON.md} {...iconProps} /> },
    { id: 'report', label: t('settingsShell.report'), icon: <ScrollText size={ICON.md} {...iconProps} /> },
    { id: 'notifications', label: t('settingsShell.notifications'), icon: <Bell size={ICON.md} {...iconProps} /> },
    { id: 'mobile', label: 'iPhone', icon: <Smartphone size={ICON.md} {...iconProps} /> },
    { id: 'appearance', label: t('settingsShell.appearance'), icon: <Palette size={ICON.md} {...iconProps} /> }
  ]

/**
 * Settings.
 *
 * Items keep growing, so always divide by category. The category list is already
 * at its minimal form, so opening a category doesn't shrink it.
 *
 * **No descriptions on categories.** Writing "how the scheduler behaves" under
 * "General" changes nothing about where you click. It turns a 4-word list into
 * 8 lines and only adds choosing effort.
 */
export function SettingsShell(): JSX.Element {
  const category = useStore((s) => s.settingsCategory)
  const setCategory = useStore((s) => s.setSettingsCategory)
  const layout = useStore((s) => s.layout)
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()

  return (
    <Row gap="none" align="stretch" grow min>
      {/* The category column is walkable with ↑↓ too (rows stacked vertically behave the same everywhere) */}
      <MenuNav onKeyDown={(e) => moveWithinList(e, 'button')}>
        {/* With the rail collapsed this column takes the window's top-left, so the
            traffic lights land on the title. Step aside by exactly what they overhang */}
        <MenuNavTitle startInset={layout.railCollapsed ? WINDOW_BUTTONS_OVERHANG : undefined}>
          {t('settingsShell.title')}
        </MenuNavTitle>
        {CATEGORIES.map((c) => (
          <MenuNavItem
            key={c.id}
            icon={c.icon}
            label={c.label}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
          />
        ))}
      </MenuNav>

      <Panel surface="canvas" grow scroll {...pane('settings', { tab: true })} aria-label={t('settingsShell.title')}>
        {category === 'general' && <GeneralSettings />}
        {category === 'agents' && <AgentSettings />}
        {category === 'report' && <ReportSettings />}
        {category === 'notifications' && <NotificationSettings />}
        {category === 'mobile' && <MobileSettings />}
        {category === 'appearance' && <AppearanceSettings />}
      </Panel>
    </Row>
  )
}
