import { Text, claimContextMenu, useTheme } from '@design-system/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { copyItem, selectionItems } from '../interaction/contextMenu.js'
import { contextMenu } from '../interaction/menu.js'
import { clockTime } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { ROLE_LABEL } from '../model/session.js'
import type { ChatSection } from '../model/summarize.js'
import { turnText } from '../model/summarize.js'
import { Section, SectionAnchor, SectionHead, SectionTitle, TurnRole, TurnRule } from '../ui/session.js'
import { SessionTurn } from './SessionTurn.js'

/**
 * One instruction and the bundle of responses to it.
 *
 * What you lose track of while reading a long conversation is "**which instruction is
 * this a response to**", not "how many files changed". So what stays pinned at the top
 * is the instruction's one line.
 *
 * The heading gets pushed out and replaced when the next instruction arrives
 * (the `Section` vessel decides).
 */
export function PromptSection({
  section,
  cwd,
  scrollRef
}: {
  section: ChatSection
  cwd: string | null
  scrollRef: RefObject<HTMLElement>
}): JSX.Element {
  const anchorRef = useRef<HTMLDivElement>(null)
  // Behind the heading is "not visible". Lower the measured top edge by its height
  const headHeight = useTheme().density.row.sm
  const floating = useFloatingHead(anchorRef, scrollRef, headHeight)

  const head = section.head
  const prompt = head ? turnText(head) : ''

  return (
    <Section>
      {head && (
        <>
          <SectionHead
            floating={floating}
            /* Rule K-1: a truncated line carries a way back to the full text */
            title={floating ? section.headline : undefined}
            /* Rule N-2: the more a surface stays pinned, the more not being able to extract in place means retyping */
            onContextMenu={(e) => {
              if (!prompt || !claimContextMenu(e)) return
              void contextMenu([...selectionItems(), ...copyItem(t('promptSection.copyPrompt'), prompt)])
            }}
          >
            <TurnRole user>{ROLE_LABEL.user}</TurnRole>
            {floating && section.headline ? (
              <SectionTitle>{section.headline}</SectionTitle>
            ) : (
              <TurnRule />
            )}
            {head.startedAt && (
              <Text tabular>
                {clockTime(head.startedAt)}
                {head.endedAt && head.endedAt !== head.startedAt && `–${clockTime(head.endedAt)}`}
              </Text>
            )}
          </SectionHead>

          <SessionTurn turn={head} cwd={cwd} headless />
          <SectionAnchor ref={anchorRef} />
        </>
      )}

      {section.rest.map((turn) => (
        <SessionTurn key={turn.id} turn={turn} cwd={cwd} />
      ))}
    </Section>
  )
}

/** Width that takes in the whole lower part of the conversation. A value that keeps the marker inside the box even for long conversations. */
const BELOW = 1_000_000

/**
 * Whether the heading has floated (the full instruction has scrolled past the top).
 *
 * While the full text is visible, the heading doesn't show the first line — that
 * would just put the same sentence twice. The line is handed over once it's out of
 * view (the same as macOS putting a document's title into the toolbar after the
 * title has scrolled away).
 *
 * Measuring positions on every scroll multiplies with the number of sections.
 * Leave it to intersection observation and receive only the moment it flips.
 */
function useFloatingHead(
  anchor: RefObject<HTMLElement>,
  scroll: RefObject<HTMLElement>,
  headHeight: number
): boolean {
  const [floating, setFloating] = useState(false)

  useEffect(() => {
    const target = anchor.current
    const root = scroll.current
    if (!target || !root) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.rootBounds) return
        // The marker sits above the heading's bottom edge = the full instruction is no longer visible
        setFloating(entry.boundingClientRect.top < entry.rootBounds.top)
      },
      /*
       * Observe with a box stretched far downward.
       *
       * Intersection notifications come **only when the state changes**. With the box
       * at the pane's height, "still below" and "already gone above" are equally
       * "not intersecting", so a frame that scrolls fast across the marker gets no
       * notification. In fact, the second instruction's heading stayed without its
       * line. Stretching the bottom so "below the marker = intersecting" means
       * crossing it always flips the state.
       */
      { root, rootMargin: `-${headHeight}px 0px ${BELOW}px 0px`, threshold: 0 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [anchor, scroll, headHeight])

  return floating
}
