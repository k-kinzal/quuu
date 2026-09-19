import {
  InsetGroupFrame as Card,
  Column,
  InsetFieldRow as FieldRow,
  InsetGroupHeading,
  InsetGroupNote,
  InsetGroupSection,
  InsetPressRow as PressRow,
  Row,
  InsetStaticRow as StaticRow,
  Text
} from '@design-system/react'
import type { ReactNode } from 'react'
import { Glyph } from '../lib/icons.js'

/**
 * An inset grouped list. **This is the shape an iOS list has.**
 *
 * A desktop list rules the full width and packs rows tight; on a phone it is
 *
 *   - margins on both sides, placed as a rounded "card"
 *   - rules drawn only inside the card, **their left edge aligned to where the content
 *     starts** (indented by the width of the icon)
 *   - a `›` on rows that go somewhere when pressed
 *
 * Only with all three does it read as "an iOS list". Miss even one and it stays
 * "a web page pasted into an app".
 *
 * Screen assembly and the choice of icons stay on the app side. Drawing the frame,
 * rows, and boundaries goes back to the Design System's InsetGroup — decoration is
 * not reimplemented per device.
 */

export interface GroupProps {
  /** The group's heading. iOS places it above and outside the card, in small type */
  title?: string
  /** A count beside the heading. Lets the size of a section be read without opening it */
  count?: number
  /** A note placed under the group */
  note?: string
  children: ReactNode
}

export function Group({ title, count, note, children }: GroupProps): JSX.Element {
  return (
    <InsetGroupSection>
      {title && (
        <InsetGroupHeading>
          <Text size="xs" tone="tertiary" grow>
            {title}
          </Text>
          {count !== undefined && (
            <Text size="xs" tone="tertiary" tabular>
              {count}
            </Text>
          )}
        </InsetGroupHeading>
      )}
      <Card>{children}</Card>
      {note && (
        <InsetGroupNote size="xs" tone="tertiary">
          {note}
        </InsetGroupNote>
      )}
    </InsetGroupSection>
  )
}

export interface GroupRowProps {
  /** Leading icon or mark. Without one, the rule starts at the body position */
  marker?: ReactNode
  /** What sits at the trailing edge (time, count, a toggle) */
  trailing?: ReactNode
  /** Pressing moves to the next screen. Shows a `›` */
  onClick?: () => void
  /** Pressable but does not navigate (acts in place). No `›` */
  onPress?: () => void
  /** Blocks repeat presses until the work finishes */
  disabled?: boolean
  children: ReactNode
}

export function GroupRow({
  marker,
  trailing,
  onClick,
  onPress,
  disabled = false,
  children
}: GroupRowProps): JSX.Element {
  // Where the rule starts. An icon pushes the body right, so the rule follows it
  const hasMarker = Boolean(marker)
  const body = (
    <>
      {marker}
      <Column gap="hairline" align="start" min grow>
        {children}
      </Column>
      {trailing}
      {onClick && (
        <Row gap="none" fixed tone="tertiary">
          <Glyph name="chevron" step="md" />
        </Row>
      )}
    </>
  )
  const press = onClick ?? onPress
  if (!press) return <StaticRow marker={hasMarker}>{body}</StaticRow>
  return (
    <PressRow type="button" marker={hasMarker} onClick={press} disabled={disabled}>
      {body}
    </PressRow>
  )
}

/**
 * A row holding a single input. **Where you write belongs in the same card as the
 * rows you read.**
 *
 * Put a field directly on the surface and it floats as a bordered box of its own,
 * looking built differently from the rows below it. On iOS an input lines up as one
 * row of the list.
 */
export function GroupField({ children }: { children: ReactNode }): JSX.Element {
  return <FieldRow>{children}</FieldRow>
}

export interface GroupPickProps {
  /** On the left: the name of what is being chosen */
  label: string
  /** On the right: what is currently chosen */
  value: string
  /** Pressing raises the choosing surface (`Sheet`). Without it the row only shows a value */
  onPick?: () => void
}

/**
 * A row that states what was chosen. **The options themselves are never laid out in
 * the row.**
 *
 * Laying options out horizontally always overflows the screen once it meets something
 * whose count and length are not fixed (projects, for one). Name + current value fits
 * the row's width, and choosing is taken over by the surface that rises from the
 * bottom (rows of 44pt or more).
 *
 * **The value is what shrinks.** The name gets `0 0 auto` and never shrinks — let the
 * name wrap and the row's height starts changing with the length of the value, so the
 * whole list is jerked around by its values (that actually happened).
 */
export function GroupPick({ label, value, onPick }: GroupPickProps): JSX.Element {
  const body = (
    <>
      <Text fixed>{label}</Text>
      <Row gap="xxs" min justify="end" grow tone="tertiary">
        <Text size="sm" tone="tertiary" truncate title={value}>
          {value}
        </Text>
        {/* Only a choosable row shows the `▾`. Rows with a single option get none */}
        {onPick && <Glyph name="down" step="sm" />}
      </Row>
    </>
  )
  if (!onPick) return <StaticRow>{body}</StaticRow>
  return (
    <PressRow type="button" onClick={onPick}>
      {body}
    </PressRow>
  )
}
