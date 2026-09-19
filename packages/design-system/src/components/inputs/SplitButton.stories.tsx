import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronDown, CirclePause, FilePen, Play, Plus } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Column, Row } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { SplitButton, type SplitOption } from './SplitButton.js'

/**
 * The shape for when one act has several possible outcomes.
 * The default is named by the main button; the rest fold into the `▾`.
 */
const meta: Meta<typeof SplitButton> = { title: 'Inputs/SplitButton', component: SplitButton }
export default meta

const caret = <ChevronDown size={iconSize.sm} {...iconDefaults} />
const icon = { sm: iconSize.sm, ...iconDefaults }

type Action = 'draft' | 'held' | 'queued' | 'now'

const LABEL: Record<Action, string> = {
  draft: 'Add as a draft',
  held: 'Add on hold',
  queued: 'Add',
  now: 'Run now'
}

const ICON: Record<Action, JSX.Element> = {
  draft: <FilePen size={icon.sm} {...iconDefaults} />,
  held: <CirclePause size={icon.sm} {...iconDefaults} />,
  queued: <Plus size={icon.sm} {...iconDefaults} />,
  now: <Play size={icon.sm} {...iconDefaults} />
}

const OPTIONS: SplitOption<Action>[] = (['draft', 'held', 'queued', 'now'] as Action[]).map((v) => ({
  value: v,
  label: LABEL[v],
  icon: ICON[v]
}))

/** What you picked becomes the main button's word (so the press and its outcome do not disagree). */
export const Default: StoryObj = {
  render: () => {
    const [action, setAction] = useState<Action>('queued')
    return (
      <SplitButton<Action>
        color="primary"
        menuTitle="How to add"
        caret={caret}
        startIcon={ICON[action]}
        options={OPTIONS}
        selected={action}
        onSelect={setAction}
      >
        {LABEL[action]}
      </SplitButton>
    )
  }
}

/** Solid / outline / ghost alike: the divider comes out at the same strength. */
export const Variants: StoryObj = {
  render: () => (
    <Column gap={4}>
      {(['solid', 'outline', 'ghost'] as const).map((variant) => (
        <Column key={variant} gap={2}>
          <Text size="xs" tone="tertiary" mono>
            {variant}
          </Text>
          <Row wrap gap={3}>
            {(['neutral', 'primary', 'success', 'error'] as const).map((color) => (
              <SplitButton<Action>
                key={color}
                variant={variant}
                color={color}
                menuTitle="Another way to finish"
                caret={caret}
                options={OPTIONS}
                selected="queued"
                onSelect={() => {}}
              >
                {color}
              </SplitButton>
            ))}
          </Row>
        </Column>
      ))}
    </Column>
  )
}

export const Sizes: StoryObj = {
  render: () => (
    <Row gap={3} align="center">
      {(['xs', 'sm', 'md'] as const).map((size) => (
        <SplitButton<Action>
          key={size}
          size={size}
          color="primary"
          menuTitle="Another way to finish"
          caret={caret}
          options={OPTIONS}
          selected="queued"
          onSelect={() => {}}
        >
          {size}
        </SplitButton>
      ))}
    </Row>
  )
}

/** The `▾` opens even when the main button cannot be pressed (decide first, write after). */
export const DisabledMain: StoryObj = {
  render: () => (
    <SplitButton<Action>
      disabled
      menuTitle="How to add"
      caret={caret}
      options={OPTIONS}
      selected="draft"
      onSelect={() => {}}
      startIcon={ICON.draft}
    >
      Add as a draft
    </SplitButton>
  )
}
