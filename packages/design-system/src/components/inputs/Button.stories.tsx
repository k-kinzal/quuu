import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, Plus, Send, Settings, Trash2, X } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Column, Row } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { Button, IconButton } from './Button.js'
import { LinkButton } from './LinkButton.js'

const meta: Meta<typeof Button> = { title: 'Inputs/Button', component: Button }
export default meta

const VARIANTS = ['solid', 'outline', 'ghost'] as const
const COLORS = ['neutral', 'primary', 'success', 'warning', 'error', 'info', 'secondary'] as const

export const Variants: StoryObj = {
  render: () => (
    <Column gap={4}>
      {VARIANTS.map((variant) => (
        <Column key={variant} gap={2}>
          <Text size="xs" tone="tertiary" mono>
            {variant}
          </Text>
          <Row wrap gap={2}>
            {COLORS.map((color) => (
              <Button key={color} variant={variant} color={color}>
                {color}
              </Button>
            ))}
          </Row>
        </Column>
      ))}
    </Column>
  )
}

export const Sizes: StoryObj = {
  render: () => (
    <Row gap={2} align="center">
      {(['xs', 'sm', 'md'] as const).map((size) => (
        <Button key={size} size={size} startIcon={<Plus size={iconSize.sm} {...iconDefaults} />}>
          {size}
        </Button>
      ))}
    </Row>
  )
}

export const WithIcons: StoryObj = {
  render: () => (
    <Row wrap gap={2}>
      <Button color="primary" startIcon={<Send size={iconSize.sm} {...iconDefaults} />}>
        Send
      </Button>
      <Button color="success" startIcon={<Check size={iconSize.sm} {...iconDefaults} />}>
        Mark as done
      </Button>
      <Button variant="ghost" color="error" startIcon={<Trash2 size={iconSize.sm} {...iconDefaults} />}>
        Delete
      </Button>
      <Button disabled>Not pressable</Button>
    </Row>
  )
}

/** An icon-only button requires a `title`. The type enforces it. */
export const IconOnly: StoryObj = {
  render: () => (
    <Row gap={2}>
      {(['xs', 'sm', 'md'] as const).map((size) => (
        <IconButton
          key={size}
          size={size}
          title={`Settings (${size})`}
          icon={<Settings size={iconSize.md} {...iconDefaults} />}
        />
      ))}
      <IconButton color="success" title="Done" icon={<Check size={iconSize.md} {...iconDefaults} />} />
      <IconButton color="error" title="Close" icon={<X size={iconSize.md} {...iconDefaults} />} />
      <IconButton disabled title="Not pressable" icon={<Plus size={iconSize.md} {...iconDefaults} />} />
    </Row>
  )
}

/** A frameless button placed next to a value to say "you can change it from here". */
export const Link: StoryObj = {
  render: () => (
    <Row wrap gap={3}>
      <LinkButton type="button">Change</LinkButton>
      <LinkButton type="button" tone="accent">
        Currently in effect
      </LinkButton>
      <LinkButton type="button" tone="warning">
        Waiting
      </LinkButton>
      <LinkButton type="button" mono>
        ~/Projects/design-system
      </LinkButton>
      <LinkButton type="button" disabled>
        Unavailable
      </LinkButton>
    </Row>
  )
}

/** Whatever the color, actions of the same size keep the same text metrics and outline. */
export const ActionPairs: StoryObj = {
  render: () => <Column gap="lg">
    {(['xs', 'sm', 'md'] as const).map((size) => <Row key={size} gap="md">
      <Text size="xs">{size}</Text>
      <Button size={size}>Run</Button><Button size={size} color="success">Confirm</Button>
      <Button size={size} variant="outline">Save</Button><Button size={size} color="primary" loading>Send</Button>
    </Row>)}
  </Column>
}
