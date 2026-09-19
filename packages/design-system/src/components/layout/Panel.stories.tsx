import type { Meta, StoryObj } from '@storybook/react-vite'
import { Maximize2, MoreHorizontal, PanelLeftClose, Plus, SlidersHorizontal, X } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Text } from '../data-display/Text.js'
import { IconButton } from '../inputs/Button.js'
import { ActivityBar } from '../navigation/ActivityBar.js'
import {
  ControlGroup,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelHeaderLead,
  PanelHeaderTrail,
  PanelHeading,
  ScrollArea,
  Toolbar
} from './Panel.js'
import { Row, Spacer } from './Stack.js'

const meta: Meta = { title: 'Layout/Panel', parameters: { layout: 'fullscreen' } }
export default meta

/** Surface hierarchy comes from lightness differences in the ground, not from borders. */
export const Surfaces: StoryObj = {
  render: () => (
    <Row gap={0} align="stretch" sx={{ height: 300 }}>
      {(['canvas', 'subtle', 'default', 'raised'] as const).map((surface) => (
        <Panel key={surface} surface={surface} grow bordered="right">
          <PanelHeader>
            <Text size="sm" weight="bold">
              {surface}
            </Text>
          </PanelHeader>
          <PanelBody pad={3}>
            <Text size="xs" tone="tertiary">
              Back to front: canvas → subtle → default → raised
            </Text>
          </PanelBody>
        </Panel>
      ))}
    </Row>
  )
}

export const HeaderSizes: StoryObj = {
  render: () => (
    <Row gap={0} align="stretch" sx={{ height: 300 }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Panel key={size} grow bordered="right">
          <PanelHeader size={size}>
            <PanelHeading count={size === 'sm' ? 1 : size === 'md' ? 20 : 128}>List {size}</PanelHeading>
            <Spacer />
            <IconButton title="Add" icon={<Plus size={iconSize.md} {...iconDefaults} />} />
            <ControlGroup>
              <IconButton title="Collapse" icon={<PanelLeftClose size={iconSize.md} {...iconDefaults} />} />
              <IconButton title="Expand" icon={<Maximize2 size={iconSize.md} {...iconDefaults} />} />
            </ControlGroup>
          </PanelHeader>
          <PanelBody pad={3}>
            <Text size="xs" tone="tertiary">
              Size-changing controls come as a pair, set slightly apart from the others.
            </Text>
          </PanelBody>
        </Panel>
      ))}
    </Row>
  )
}

/** Edge controls stay on the symbol columns that continue below the header. */
export const HeaderColumns: StoryObj = {
  render: () => (
    <Panel grow sx={{ height: 300 }}>
      <PanelHeader size="lg" leadingColumn trailingColumn>
        <PanelHeaderLead>
          <IconButton title="Close" icon={<X size={iconSize.md} {...iconDefaults} />} />
        </PanelHeaderLead>
        <PanelHeading>Details</PanelHeading>
        <Spacer />
        <PanelHeaderTrail>
          <IconButton title="More actions" icon={<MoreHorizontal size={iconSize.md} {...iconDefaults} />} />
        </PanelHeaderTrail>
      </PanelHeader>
      <Row gap={0} align="stretch" grow>
        <ActivityBar
          label="Views"
          items={[{ id: 'contents', label: 'Contents', icon: <PanelLeftClose size={iconSize.md} {...iconDefaults} /> }]}
          visibleIds={['contents']}
          onToggle={() => {}}
        />
        <PanelBody pad={3}>
          <Text size="sm" tone="secondary">Header controls align with the navigation symbols.</Text>
        </PanelBody>
        <ActivityBar
          label="Information"
          side="right"
          items={[{ id: 'properties', label: 'Properties', icon: <SlidersHorizontal size={iconSize.md} {...iconDefaults} /> }]}
          visibleIds={['properties']}
          onToggle={() => {}}
        />
      </Row>
    </Panel>
  )
}

/**
 * Only the section whose amount of content is unknowable scrolls.
 * Merging everything into one scroll pushes even fixed-amount values out of sight.
 */
export const FixedAndScrolling: StoryObj = {
  render: () => (
    <Panel width={320} bordered="left" sx={{ height: 340 }}>
      <PanelBody scroll={false} pad={3} sx={{ flex: '0 0 auto' }}>
        <Text size="xs" tone="tertiary">
          This part is fixed. Its amount is known, so it stays visible.
        </Text>
      </PanelBody>
      <Toolbar placement="section">
        <Text size="xs" weight="bold" tone="tertiary">
          Growing section
        </Text>
      </Toolbar>
      <ScrollArea>
        {Array.from({ length: 20 }, (_, i) => (
          <Text key={i} block size="sm" tone="secondary" sx={{ px: 3, py: 1 }}>
            Row {i + 1}
          </Text>
        ))}
      </ScrollArea>
      <PanelFooter>
        <Text size="xs" tone="tertiary">
          Bottom edge
        </Text>
      </PanelFooter>
    </Panel>
  )
}
