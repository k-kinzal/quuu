import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleAlert, CircleCheckBig, Info, TriangleAlert } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { ToastStack, type ToastTone } from './Toast.js'

const meta: Meta = { title: 'Feedback/Toast', parameters: { layout: 'fullscreen' } }
export default meta

function icon(tone: ToastTone): JSX.Element {
  const props = { size: iconSize.sm, ...iconDefaults }
  if (tone === 'danger') return <CircleAlert {...props} />
  if (tone === 'warning') return <TriangleAlert {...props} />
  if (tone === 'success') return <CircleCheckBig {...props} />
  return <Info {...props} />
}

/**
 * Color and glyph alone do not carry it, so a word is always included.
 * The close glyph clears a toast without following it (`onDismiss`).
 */
export const Stack: StoryObj = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <ToastStack
        icon={icon}
        onSelect={() => undefined}
        onDismiss={() => undefined}
        toasts={[
          { id: '1', tone: 'info', message: 'The import has finished' },
          { id: '2', tone: 'success', message: 'Marked as done', detail: 'Move the tokens onto the theme' },
          { id: '3', tone: 'warning', message: 'Could not be sent', detail: 'It is already running. Add to it once it finishes' },
          { id: '4', tone: 'danger', message: 'The run failed', detail: 'ENOENT: command not found' }
        ]}
      />
    </div>
  )
}
