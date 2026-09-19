import { HistoryChain, useTheme } from '@design-system/react'
import type { ComponentProps } from 'react'
export {
  HistoryDuration as RunDuration, HistoryResult as RunResult, HistoryRow as RunRow, HistoryTable as RunTable, HistoryTarget as RunTarget, HistoryTime as RunTime
} from '@design-system/react'
export function RunChain(props: ComponentProps<typeof HistoryChain>): JSX.Element {
  const theme = useTheme()
  return <HistoryChain {...props} color={theme.palette.quuu.status.review} />
}
