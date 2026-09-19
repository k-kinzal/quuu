import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bot, FolderGit2, Inbox, Search, Settings } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Kbd, KeyCap } from '../data-display/Code.js'
import { Text } from '../data-display/Text.js'
import { Button } from '../inputs/Button.js'
import { PlainInput } from '../inputs/InlineInput.js'
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInputRow,
  CommandList,
  CommandRow,
  CommandRowIcon
} from './CommandDialog.js'

const meta: Meta = { title: 'Surfaces/CommandDialog', parameters: { layout: 'fullscreen' } }
export default meta

const ITEMS = [
  { group: 'Destinations', icon: <Inbox size={iconSize.md} {...iconDefaults} />, label: 'All', hint: '⌘1' },
  { group: 'Destinations', icon: <FolderGit2 size={iconSize.md} {...iconDefaults} />, label: 'design-system', sub: '5 items' },
  { group: 'Destinations', icon: <Settings size={iconSize.md} {...iconDefaults} />, label: 'Settings', hint: '⌘,' },
  { group: 'Actions', icon: <Bot size={iconSize.md} {...iconDefaults} />, label: 'Run now', hint: '⌘R' }
]

/** A shortcut, not a replacement for the hierarchy. Never build a feature reachable only from here. */
export const Default: StoryObj = {
  render: function Render() {
    const [open, setOpen] = useState(true)
    const [active, setActive] = useState(0)
    let group = ''
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <CommandDialog open={open} onClose={() => setOpen(false)}>
          <CommandInputRow>
            <Search size={iconSize.md} {...iconDefaults} />
            <PlainInput textSize="lg" placeholder="Search, or run a command…" />
            <KeyCap>esc</KeyCap>
          </CommandInputRow>
          <CommandList>
            {ITEMS.map((item, i) => {
              const header = item.group !== group ? item.group : null
              group = item.group
              return (
                <div key={item.label}>
                  {header && <CommandGroup>{header}</CommandGroup>}
                  <CommandRow
                    type="button"
                    active={i === active}
                    onMouseMove={() => setActive(i)}
                  >
                    <CommandRowIcon>{item.icon}</CommandRowIcon>
                    <Text size="md" truncate sx={{ flex: '1 1 auto' }}>
                      <mark>{item.label.slice(0, 2)}</mark>
                      {item.label.slice(2)}
                    </Text>
                    {item.sub && (
                      <Text size="xs" tone="tertiary">
                        {item.sub}
                      </Text>
                    )}
                    {item.hint && <KeyCap>{item.hint}</KeyCap>}
                  </CommandRow>
                </div>
              )
            })}
          </CommandList>
          <CommandFooter>
            <span>
              <Kbd>↑↓</Kbd> Move
            </span>
            <span>
              <Kbd>↵</Kbd> Run
            </span>
            <span>
              <Kbd>esc</Kbd> Close
            </span>
          </CommandFooter>
        </CommandDialog>
      </div>
    )
  }
}

export const NoResults: StoryObj = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <CommandDialog open onClose={() => undefined}>
        <CommandInputRow>
          <Search size={iconSize.md} {...iconDefaults} />
          <PlainInput textSize="lg" defaultValue="zzz" readOnly />
        </CommandInputRow>
        <CommandList>
          <CommandEmpty>Nothing matches</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </div>
  )
}
