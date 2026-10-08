import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

/** A secondary conversation shares the canvas; below two reading columns it takes the focus. */
export const ConversationWorkspace = styled('div', { shouldForwardProp: blockProps('threadOpen') })<{ threadOpen: boolean }>(({ threadOpen }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  containerType: 'inline-size',
  containerName: 'conversation',
  '& > [data-conversation-channel]': {
    flex: '1 1 0',
    ...(threadOpen ? { '@container conversation (max-width: 720px)': { display: 'none' } } : {})
  },
  '& > [data-conversation-thread]': {
    flex: '0 0 46%',
    '@container conversation (max-width: 720px)': { flex: '1 1 0', borderLeft: 0 }
  }
}))
