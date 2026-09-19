import type { Meta, StoryObj } from '@storybook/react-vite'
import { FolderOpen } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { LinkButton } from '../inputs/LinkButton.js'
import { Badge } from './Badge.js'
import { DataList, DescriptionList, DetailStack } from './DescriptionList.js'
import { Dot, StatusIndicator } from './StatusIndicator.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/DescriptionList' }
export default meta

/** Attributes are "things you check", so they line up at a density you can scan without reading. */
export const Attributes: StoryObj = {
  render: () => (
    <DescriptionList sx={{ maxWidth: 320 }}>
      <dt>State</dt>
      <dd>
        <StatusIndicator shape="diamond" tone="warning" label="Awaiting review" />
        <span>Awaiting review</span>
      </dd>

      <dt>Category</dt>
      <dd>
        <Dot color="#4ea8de" />
        <Text truncate>design-system</Text>
      </dd>

      <dt>Target</dt>
      <dd>
        <Text truncate>Alpha</Text>
        <Badge tone="accent">Pinned</Badge>
      </dd>

      <dt>Location</dt>
      <dd>
        <LinkButton type="button" mono>
          <FolderOpen size={iconSize.sm} {...iconDefaults} />
          <Text truncate>~/Projects/design-system</Text>
        </LinkButton>
      </dd>

      <dt>Depends on</dt>
      <DetailStack>
        <LinkButton type="button">Settle the tokens</LinkButton>
        <LinkButton type="button" tone="warning">
          Line the components up
        </LinkButton>
      </DetailStack>

      <dt>Updated</dt>
      <dd>5 min ago</dd>
    </DescriptionList>
  )
}

/** The monospaced version, for comparing digits. Commands and IDs go here. */
export const Data: StoryObj = {
  render: () => (
    <DataList sx={{ maxWidth: 420 }}>
      <dt>Command</dt>
      <dd>claude -p --permission-mode bypassPermissions</dd>
      <dt>Location</dt>
      <dd>/Users/me/Projects/design-system</dd>
      <dt>ID</dt>
      <dd>0f3a9c21-7c11-4a2b-9a30-1d2e</dd>
      <dt>Exit code</dt>
      <dd>0</dd>
    </DataList>
  )
}
