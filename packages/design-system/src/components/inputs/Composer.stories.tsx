import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bot, Clock, FolderOpen, Paperclip, Send, ShieldAlert, X } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Badge } from '../data-display/Badge.js'
import { Text } from '../data-display/Text.js'
import { Spacer } from '../layout/Stack.js'
import { Button, IconButton } from './Button.js'
import { PlainInput } from './InlineInput.js'
import { SegmentedControl } from './Toggle.js'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import {
  Composer,
  ComposerActions,
  ComposerBox,
  ComposerContext,
  ComposerInput,
  ComposerOptions,
  ComposerNotice,
  ComposerNoticeBody,
  ComposerNoticeText,
  ComposerSubject,
  ComposerToolbar,
  ContextChip
} from './Composer.js'

const meta: Meta = { title: 'Inputs/Composer', parameters: { layout: 'padded' } }
export default meta

/** The full shape: (1) context, (2) input, (3) actions. */
export const Default: StoryObj = {
  render: () => (
    <Composer sx={{ maxWidth: 720 }}>
      <ComposerBox>
        <ComposerContext>
          <ContextChip
            icon={<FolderOpen size={iconSize.sm} {...iconDefaults} />}
            onClick={() => undefined}
          >
            ~/Projects/design-system
          </ContextChip>
          <ContextChip
            icon={<Bot size={iconSize.sm} {...iconDefaults} />}
            badge={<Badge tone="accent">Pinned</Badge>}
            onClick={() => undefined}
          >
            Alpha
          </ContextChip>
          <ContextChip warn icon={<ShieldAlert size={iconSize.sm} {...iconDefaults} />}>
            No condition set
          </ContextChip>
        </ComposerContext>

        <ComposerInput rows={1} placeholder="Write an instruction…" />

        <ComposerToolbar>
          <IconButton title="Attach a file" icon={<Paperclip size={iconSize.sm} {...iconDefaults} />} />
          <Spacer />
          <Button color="primary" startIcon={<Send size={iconSize.sm} {...iconDefaults} />}>
            Send
          </Button>
        </ComposerToolbar>
      </ComposerBox>
    </Composer>
  )
}

/** "What happens next" slotted in above the input. */
export const WithNotice: StoryObj = {
  render: () => (
    <Composer sx={{ maxWidth: 720 }}>
      <ComposerBox>
        <ComposerContext>
          <ContextChip icon={<Bot size={iconSize.sm} {...iconDefaults} />}>Alpha</ContextChip>
        </ComposerContext>
        <ComposerNotice tone="info">
          <Clock size={iconSize.sm} {...iconDefaults} />
          <ComposerNoticeBody>
            <Badge tone="info">Queued to send</Badge>
            <ComposerNoticeText>Please add tests as well</ComposerNoticeText>
          </ComposerNoticeBody>
          <Button size="xs">Send now</Button>
          <IconButton size="xs" title="Cancel" icon={<X size={iconSize.sm} {...iconDefaults} />} />
        </ComposerNotice>
        <ComposerInput rows={1} placeholder="Keep writing…" />
        <ComposerToolbar>
          <Spacer />
          <Button color="primary">Queue to send</Button>
        </ComposerToolbar>
      </ComposerBox>
    </Composer>
  )
}

/**
 * The first line settled as the name.
 * Rather than explaining "the first line becomes the name" in prose, split the lines
 * and show it.
 */
export const WithSubject: StoryObj = {
  render: () => (
    <Composer sx={{ maxWidth: 720 }}>
      <ComposerBox>
        <ComposerContext>
          <ContextChip icon={<Bot size={iconSize.sm} {...iconDefaults} />}>Alpha</ContextChip>
        </ComposerContext>

        <ComposerSubject>
          <Text size="xs" tone="tertiary">
            Title
          </Text>
          <PlainInput
            type="text"
            textSize="md"
            defaultValue="Write the actions that generate the docs"
            placeholder="Name"
          />
        </ComposerSubject>

        <ComposerInput rows={1} defaultValue="Regenerate on every PR and comment the diff" />

        <ComposerToolbar>
          <Spacer />
          <Button color="primary" startIcon={<Send size={iconSize.sm} {...iconDefaults} />}>
            Run
          </Button>
        </ComposerToolbar>
      </ComposerBox>
    </Composer>
  )
}

export const Busy: StoryObj = {
  render: () => (
    <Composer sx={{ maxWidth: 720 }}>
      <ComposerBox busy>
        <ComposerInput rows={1} disabled placeholder="Sending…" />
        <ComposerToolbar>
          <Spacer />
          <Button color="primary" disabled>
            Send
          </Button>
        </ComposerToolbar>
      </ComposerBox>
    </Composer>
  )
}

/** Options and send share one band; long values wrap inside the available space. */
function InlineOptionsExample({ fixed = false }: { fixed?: boolean }): JSX.Element {
  return <Composer>
    <ComposerBox>
      <ComposerSubject>
        <Text size="xs" tone="tertiary">Title</Text>
        <PlainInput aria-label="Title" textSize="md" defaultValue="Update the reference" readOnly={fixed} />
      </ComposerSubject>
      <ComposerInput rows={1} placeholder="Write an instruction…" />
      <ComposerToolbar>
        <ComposerOptions>
          <ContextChip icon={<FolderOpen size={iconSize.sm} {...iconDefaults} />} title="/workspace/organization/design-system-reference" onClick={fixed ? undefined : () => undefined}>design-system-reference</ContextChip>
          <ContextChip icon={<Bot size={iconSize.sm} {...iconDefaults} />} title="Alpha" onClick={fixed ? undefined : () => undefined}>Alpha</ContextChip>
          <SegmentedControl label="Mode" value="fast" options={[{ value: 'fast', label: 'Fast' }, { value: 'full', label: 'Full' }, { value: 'auto', label: 'Auto' }, { value: 'off', label: 'Off' }]} onChange={() => undefined} />
        </ComposerOptions>
        <ComposerActions>
          {fixed && <Button variant="ghost">Cancel</Button>}
          <Button color="primary" startIcon={<Send size={iconSize.sm} {...iconDefaults} />}>Send</Button>
        </ComposerActions>
      </ComposerToolbar>
    </ComposerBox>
  </Composer>
}

export const InlineOptions: StoryObj = { render: () => <div style={{ maxWidth: 720 }}><InlineOptionsExample /></div> }
export const FixedOptions: StoryObj = { render: () => <div style={{ maxWidth: 720 }}><InlineOptionsExample fixed /></div> }
export const NarrowOptions: StoryObj = { render: () => <div style={{ width: 360 }}><InlineOptionsExample /></div> }
export const NarrowFixedOptions: StoryObj = { render: () => <div style={{ width: 360 }}><InlineOptionsExample fixed /></div> }
export const ConstrainedOptions: StoryObj = { render: () => <div style={{ width: 240 }}><InlineOptionsExample fixed /></div> }
export const TouchOptions: StoryObj = { render: () => <ThemeProvider density="comfortable"><div style={{ width: 390 }}><InlineOptionsExample /></div></ThemeProvider> }
