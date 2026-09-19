import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Spacer } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import {
  CollapsibleText,
  Disclosure,
  DisclosureCaret,
  DisclosureDetail,
  DisclosureSummary,
  SummaryStat
} from './Disclosure.js'

const meta: Meta = { title: 'Surfaces/Disclosure', parameters: { layout: 'fullscreen' } }
export default meta

/** The summary is what carries the value per unit of area. The detail stays folded. */
export const Summary: StoryObj = {
  render: function Render() {
    const [open, setOpen] = useState(false)
    return (
      <Disclosure>
        <DisclosureSummary type="button" onClick={() => setOpen(!open)}>
          <SummaryStat>
            <b>3</b> edits
          </SummaryStat>
          <SummaryStat>
            <b>2</b> commands
          </SummaryStat>
          <SummaryStat tone="muted">
            <b>12</b> reads
          </SummaryStat>
          <SummaryStat tone="danger">
            <b>1</b> failure
          </SummaryStat>
          <Spacer />
          <DisclosureCaret open={open} />
        </DisclosureSummary>
        {open && (
          <DisclosureDetail>
            <Column gap={1}>
              <Text size="xs" mono tone="secondary">
                src/theme/tokens.ts
              </Text>
              <Text size="xs" mono tone="secondary">
                src/components/inputs/Button.tsx
              </Text>
              <Text size="xs" mono tone="danger">
                npm run check
              </Text>
            </Column>
          </DisclosureDetail>
        )}
      </Disclosure>
    )
  }
}

export const WithAccent: StoryObj = {
  render: () => (
    <Disclosure accent="#e05c5c">
      <DisclosureSummary type="button" disabled>
        <SummaryStat tone="danger">
          <b>1</b> failure
        </SummaryStat>
        <SummaryStat tone="muted">Not pressable: there is nothing to open</SummaryStat>
      </DisclosureSummary>
    </Disclosure>
  )
}

/** Never bolt a scroll of its own onto a read-only section. If it is long, fold it. */
export const Clamped: StoryObj = {
  render: () => (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <CollapsibleText lines={3} title="The full text goes here">
        {'First line.\nSecond line.\nThird line.\nThe fourth is hidden.\nThe fifth is hidden too.'}
      </CollapsibleText>
    </div>
  )
}
