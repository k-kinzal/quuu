import { TranscriptPendingBody, TranscriptToolCluster, useTheme } from '@design-system/react'
import type { ComponentProps } from 'react'
export {
  TranscriptImageFrame as ImageFrame, TranscriptImageMissing as ImageMissing, TranscriptImageStrip as ImageStrip, TranscriptSection as Section, TranscriptSectionAnchor as SectionAnchor, TranscriptSectionHead as SectionHead,
  TranscriptSectionTitle as SectionTitle, TranscriptSession as Session,
  TranscriptSessionScroll as SessionScroll, TranscriptThinkingBody as ThinkingBody, TranscriptThinkingToggle as ThinkingToggle, TranscriptToolError as ToolError, TranscriptToolImages as ToolImages, TranscriptToolLine as ToolLine,
  TranscriptToolDetail as ToolDetail, TranscriptToolEntry as ToolEntry, TranscriptToolVerb as ToolVerb, TranscriptTurn as Turn, TranscriptTurnBody as TurnBody, TranscriptTurnHead as TurnHead, TranscriptTurnRole as TurnRole, TranscriptTurnRule as TurnRule, TranscriptTurnText as TurnText
} from '@design-system/react'

/** Hands the display component only the meaning "not yet sent". */
export function PendingBody(
  props: Omit<ComponentProps<typeof TranscriptPendingBody>, 'color'>
): JSX.Element {
  const theme = useTheme()
  return <TranscriptPendingBody {...props} color={theme.palette.quuu.status.queued} />
}
export type ToolTone = 'write' | 'shell' | 'other'
export function ToolCluster({
  tone,
  ...props
}: Omit<ComponentProps<typeof TranscriptToolCluster>, 'tone'> & { tone: ToolTone }): JSX.Element {
  return (
    <TranscriptToolCluster
      {...props}
      tone={tone === 'write' ? 'accent' : tone === 'shell' ? 'success' : 'neutral'}
    />
  )
}
