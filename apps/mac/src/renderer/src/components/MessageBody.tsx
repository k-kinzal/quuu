import { memo } from 'react'
import { IconButton, Markdown } from '@design-system/react'
import { t } from '../model/i18n/index.js'
import { Copy, ICON, iconProps } from '../ui/icons.js'

/**
 * The body of an utterance.
 *
 * Agent utterances arrive as Markdown. Shown as raw notation, a heading's `#`
 * and a table's `|` carry the same weight as body text, demanding decoding before reading.
 * Render it as structure here (fenced code gets highlighting, `mermaid` becomes a diagram).
 *
 * The look belongs to the design system's `Markdown`. What this hands over is
 * **the 2 things only Quuu can do** — opening external links and copying code.
 */

// A reference that changes every render rebuilds `Markdown` wholesale, so hoist and pin it
const openLink = (href: string): void => void window.quuu.system.openExternal(href)

const codeActions = (code: string): JSX.Element => (
  <IconButton
    size="xs"
    plainTitle
    title={t('messageBody.copyCode')}
    icon={<Copy size={ICON.sm} {...iconProps} />}
    onClick={() => void window.quuu.system.copy(code)}
  />
)

/*
 * Parsing Markdown is the expensive part of drawing a conversation, and every message is parsed
 * again whenever the conversation re-renders (a new message, a snapshot, the clock). The output
 * depends on nothing but these two values, so an unchanged message is simply not parsed again.
 */
export const MessageBody = memo(function MessageBody({ text, subdued }: { text: string; subdued?: boolean }): JSX.Element {
  return (
    <Markdown onOpenLink={openLink} codeActions={codeActions} subdued={subdued}>
      {text}
    </Markdown>
  )
})
