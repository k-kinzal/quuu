import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Button } from '../inputs/Button.js'
import { IconButton } from '../inputs/Button.js'
import { Column, Row } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { Menu, useMenu, type MenuItemSpec } from './Menu.js'

/**
 * **The press-to-open menu.**
 *
 * The menu that comes up on right click is a different part (the OS draws it). This is
 * the surface that comes out stuck to what you **pressed** — a button, a chip, a value
 * row. The surface is decided by how it is invoked, so the two are never swapped even
 * when the contents match.
 */
const meta: Meta<typeof Menu> = { title: 'Surfaces/Menu', component: Menu }
export default meta

const ITEMS: MenuItemSpec[] = [
  { label: 'Run now', accelerator: 'Cmd+R' },
  { label: 'Mark as done', accelerator: 'Cmd+Shift+D' },
  { label: 'Reserve a slot', separatorBefore: true },
  {
    label: 'Priority',
    separatorBefore: true,
    submenu: [
      { label: 'P0' },
      { label: 'P1', checked: true },
      { label: 'P2' },
      { label: 'P3' }
    ]
  },
  { label: 'Already imported', disabled: true },
  { label: 'Delete…', separatorBefore: true }
]

/** Opened from a glyph-only button. **No tooltip** (it would stack a second surface on the menu). */
export const FromIconButton: StoryObj = {
  render: () => {
    const menu = useMenu()
    return (
      <Row>
        <IconButton
          title="More actions"
          menu
          aria-expanded={menu.isOpen}
          icon={<MoreHorizontal size={iconSize.md} {...iconDefaults} />}
          onClick={menu.open}
        />
        <Menu
          open={menu.isOpen}
          anchorEl={menu.anchorEl}
          onClose={menu.close}
          items={() => ITEMS}
          label="More actions"
        />
      </Row>
    )
  }
}

/**
 * When there are many candidates. **Show the head, fold the rest into one row.**
 *
 * Pressing the folded row replaces it with the remainder (the surface stays open).
 * Cutting them off with nothing but a count leaves the candidates in there unpickable.
 */
export const Folded: StoryObj = {
  render: () => {
    const menu = useMenu()
    const rest: MenuItemSpec[] = Array.from({ length: 24 }, (_, i) => ({
      label: `Thing to do ${i + 4}`
    }))
    return (
      <Row>
        <Button onClick={menu.open}>Show candidates</Button>
        <Menu
          open={menu.isOpen}
          anchorEl={menu.anchorEl}
          onClose={menu.close}
          items={() => [
            { label: 'Thing to do 1' },
            { label: 'Thing to do 2' },
            { label: 'Thing to do 3' },
            { label: `Show ${rest.length} more`, more: rest }
          ]}
          label="Candidates"
        />
      </Row>
    )
  }
}

/**
 * When the thing pressed is at the bottom edge of the screen.
 * The surface **draws, then measures** and swings upward (no placement to write out).
 */
export const NearTheEdge: StoryObj = {
  render: () => {
    const menu = useMenu()
    return (
      <Column
        gap={2}
        sx={{ height: 320, justifyContent: 'flex-end', alignItems: 'flex-start' }}
      >
        <Text size="sm" tone="tertiary">
          A button at the bottom edge. It does not fit below, so it opens upward
        </Text>
        <Button onClick={menu.open}>Open</Button>
        <Menu
          open={menu.isOpen}
          anchorEl={menu.anchorEl}
          onClose={menu.close}
          items={() => ITEMS}
          label="Opened from the bottom edge"
        />
      </Column>
    )
  }
}
