import LinearProgress from '@mui/material/LinearProgress'
import { styled } from '@mui/material/styles'
import { feedbackMetrics } from '../../theme/feedback.js'
/** The progress added to a permanent band. A thin shape that does not push the main controls down. */
export const EdgeProgress = styled(LinearProgress)(({ theme }) => ({
  height: feedbackMetrics.progress.height,
  borderRadius: 0,
  backgroundColor: theme.palette.surface.hover
}))
