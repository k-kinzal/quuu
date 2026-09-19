import { NumericLabel, Quotation, useTheme } from '@design-system/react'
import type { ComponentProps } from 'react'
import type { Priority as PriorityLevel } from '../../../preload/api/tasks.js'
export {
  ConversationIntro as ChatIntro,
  ConversationMore as ChatMore, ConversationRoot as ChatRoot, ConversationFeed as ChatScroll, ConversationViewport as ChatViewport, DetailFixed as InspectorFixed, DetailGroup as InspectorGroup, DetailScroll as InspectorRuns, FloatingAction as JumpToLatest
} from '@design-system/react'

export function Priority({
  level,
  ...props
}: Omit<ComponentProps<typeof NumericLabel>, 'color'> & { level: PriorityLevel }): JSX.Element {
  const theme = useTheme()
  return <NumericLabel {...props} color={theme.palette.quuu.priority[level]} subdued={level >= 3} />
}
export function Pending({
  tone = 'warning',
  ...props
}: Omit<ComponentProps<typeof Quotation>, 'color'> & { tone?: 'warning' | 'queued' }): JSX.Element {
  const theme = useTheme()
  return (
    <Quotation
      {...props}
      color={tone === 'queued' ? theme.palette.quuu.status.queued : theme.palette.warning.main}
      tinted={tone !== 'queued'}
    />
  )
}
