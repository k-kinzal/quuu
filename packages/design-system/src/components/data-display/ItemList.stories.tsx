import type { Meta, StoryObj } from '@storybook/react-vite'
import { Lock } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Panel } from '../layout/Panel.js'
import { Spacer } from '../layout/Stack.js'
import {
  ItemBody,
  ItemGroupHeader,
  ItemList,
  ItemMarker,
  ItemMeta,
  ItemRow,
  ItemSubline
} from './ItemList.js'
import { Dot, StatusIndicator } from './StatusIndicator.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/ItemList', parameters: { layout: 'fullscreen' } }
export default meta

const GROUPS = [
  {
    label: 'Awaiting review',
    items: [{ id: 1, shape: 'diamond', tone: 'warning', title: 'Move the tokens onto the theme', at: '26 min ago', locked: false, group: 'apps/web', color: '#60abef' }]
  },
  {
    label: 'Running',
    items: [{ id: 2, shape: 'spinner', tone: 'info', title: 'Split the components by category', at: '7 min 09 sec', locked: true, group: 'design-system', color: '#70c38f' }]
  },
  {
    label: 'Drafts',
    items: [
      { id: 3, shape: 'ring', tone: 'neutral', title: 'Redo the writing conventions', at: '', locked: false, group: 'docs-site', color: '#a286d3' },
      { id: 4, shape: 'ring', tone: 'neutral', title: 'A long title is elided at the end so the head of the identifier survives', at: '', locked: false, group: 'runtime-tools', color: '#e4a249' }
    ]
  }
] as const

/** The condition is that the identifier stays readable however narrow it gets. */
export const Default: StoryObj = {
  render: () => (
    <Panel width={280} bordered="right" sx={{ height: 360 }}>
      <ItemList>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <ItemGroupHeader>
              <span>{group.label}</span>
              <Text tabular sx={{ opacity: 0.75 }}>
                {group.items.length}
              </Text>
            </ItemGroupHeader>
            {group.items.map((item) => (
              <ItemRow key={item.id} type="button" selected={item.id === 1} title={item.title}>
                <StatusIndicator shape={item.shape} tone={item.tone} label={group.label} />
                <Text size="sm" truncate sx={{ flex: '1 1 auto' }}>
                  {item.title}
                </Text>
                <ItemMeta>
                  {item.locked && (
                    <Text tone="accent" sx={{ display: 'inline-flex' }}>
                      <Lock size={iconSize.sm} {...iconDefaults} />
                    </Text>
                  )}
                  <Dot color="#4ea8de" />
                  {item.at && (
                    <Text size="xs" tone="tertiary" tabular>
                      {item.at}
                    </Text>
                  )}
                </ItemMeta>
              </ItemRow>
            ))}
          </div>
        ))}
      </ItemList>
    </Panel>
  )
}

/**
 * The two-line form.
 *
 * There is an attribute (which category it belongs to) that has to appear alongside the
 * identifier, but adding it to the right of the same line means only the identifier
 * shrinks. The attribute escapes downward, and the first line gives all of its width to
 * the identifier.
 */
export const TwoLines: StoryObj = {
  render: () => (
    <Panel width={280} bordered="right" sx={{ height: 360 }}>
      <ItemList>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <ItemGroupHeader>
              <span>{group.label}</span>
              <Text tabular sx={{ opacity: 0.75 }}>
                {group.items.length}
              </Text>
            </ItemGroupHeader>
            {group.items.map((item) => (
              <ItemRow
                key={item.id}
                type="button"
                lines={2}
                selected={item.id === 1}
                title={item.title}
              >
                {/* The mark attaches to the first line. Centred on the row, you cannot read which line it belongs to */}
                <ItemMarker>
                  <StatusIndicator shape={item.shape} tone={item.tone} label={group.label} />
                </ItemMarker>
                <ItemBody>
                  <Text size="sm" truncate>
                    {item.title}
                  </Text>
                  <ItemSubline>
                    <Dot color={item.color} />
                    <Text tone="secondary" truncate>
                      {item.group}
                    </Text>
                    <Spacer />
                    {item.locked && (
                      <Text tone="accent" sx={{ display: 'inline-flex' }}>
                        <Lock size={iconSize.sm} {...iconDefaults} />
                      </Text>
                    )}
                    {item.at && <Text tabular>{item.at}</Text>}
                  </ItemSubline>
                </ItemBody>
              </ItemRow>
            ))}
          </div>
        ))}
      </ItemList>
    </Panel>
  )
}
