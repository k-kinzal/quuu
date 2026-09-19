import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Bell,
  Bot,
  CircleCheckBig,
  Inbox,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  SlidersHorizontal
} from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Dot } from '../data-display/StatusIndicator.js'
import { IconButton } from '../inputs/Button.js'
import { Spacer } from '../layout/Stack.js'
import { useTheme } from '../../theme/ThemeProvider.js'
import {
  MenuNav,
  MenuNavItem,
  MenuNavTitle,
  NavHeading,
  NavItem,
  NavSection,
  SideNav,
  SideNavTop
} from './NavList.js'

const meta: Meta = { title: 'Navigation/NavList', parameters: { layout: 'fullscreen' } }
export default meta

/**
 * Only things looked at daily go here. Collapsed is not a shrunken copy of expanded —
 * anything that a row of dots cannot tell apart is not kept.
 */
export const Side: StoryObj = {
  render: function Render() {
    const theme = useTheme()
    const [collapsed, setCollapsed] = useState(false)
    const [active, setActive] = useState('all')
    return (
      <div style={{ display: 'flex', height: 420 }}>
        <SideNav collapsed={collapsed} collapsedWidth={42}>
          <SideNavTop collapsed={collapsed}>
            <IconButton
              title={collapsed ? 'Expand' : 'Collapse'}
              icon={
                collapsed ? (
                  <PanelLeftOpen size={iconSize.md} {...iconDefaults} />
                ) : (
                  <PanelLeftClose size={iconSize.md} {...iconDefaults} />
                )
              }
              onClick={() => setCollapsed(!collapsed)}
            />
          </SideNavTop>

          <NavSection>
            <NavItem
              icon={<Inbox size={iconSize.md} {...iconDefaults} />}
              label="All"
              badge={6}
              collapsed={collapsed}
              active={active === 'all'}
              onClick={() => setActive('all')}
            />
            <NavItem
              icon={<CircleCheckBig size={iconSize.md} {...iconDefaults} />}
              label="Awaiting review"
              badge={2}
              accent={theme.palette.warning.main}
              collapsed={collapsed}
              active={active === 'review'}
              onClick={() => setActive('review')}
            />
          </NavSection>

          {!collapsed && (
            <NavSection grow>
              <NavHeading>
                <span>Categories</span>
                <IconButton
                  size="xs"
                  title="Add"
                  icon={<Plus size={iconSize.sm} {...iconDefaults} />}
                />
              </NavHeading>
              <NavItem
                icon={<Dot size={8} color="#4ea8de" />}
                label="design-system"
                badge={5}
                active={active === 'ds'}
                onClick={() => setActive('ds')}
              />
              <NavItem
                icon={<Dot size={8} color="#e2a03f" muted />}
                label="runtime (paused)"
                badge={1}
                active={active === 'rt'}
                onClick={() => setActive('rt')}
              />
            </NavSection>
          )}

          {collapsed && <Spacer />}

          <NavSection pinned>
            <NavItem
              icon={<Settings size={iconSize.md} {...iconDefaults} />}
              label="Settings"
              collapsed={collapsed}
              active={active === 'settings'}
              onClick={() => setActive('settings')}
            />
          </NavSection>
        </SideNav>
      </div>
    )
  }
}

/** The list of categories. It is already at its smallest, so it does not shrink when contents open. */
export const Menu: StoryObj = {
  render: function Render() {
    const [active, setActive] = useState('general')
    return (
      <div style={{ display: 'flex', height: 320 }}>
        <MenuNav>
          <MenuNavTitle>Settings</MenuNavTitle>
          <MenuNavItem
            icon={<SlidersHorizontal size={iconSize.md} {...iconDefaults} />}
            label="General"
            hint="How it behaves"
            active={active === 'general'}
            onClick={() => setActive('general')}
          />
          <MenuNavItem
            icon={<Bot size={iconSize.md} {...iconDefaults} />}
            label="Run targets"
            hint="Defining the launch conditions"
            active={active === 'agents'}
            onClick={() => setActive('agents')}
          />
          <MenuNavItem
            icon={<Bell size={iconSize.md} {...iconDefaults} />}
            label="Notifications"
            hint="How you are told"
            active={active === 'notify'}
            onClick={() => setActive('notify')}
          />
          <MenuNavItem
            icon={<Palette size={iconSize.md} {...iconDefaults} />}
            label="Appearance"
            hint="How it looks"
            active={active === 'look'}
            onClick={() => setActive('look')}
          />
        </MenuNav>
      </div>
    )
  }
}
