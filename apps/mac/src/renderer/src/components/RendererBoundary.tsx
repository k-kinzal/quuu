import { EmptyState } from '@design-system/react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../model/i18n/index.js'

const ERROR_KEY = 'taskd.renderer-error.v1'

interface RendererBoundaryProps {
  children: ReactNode
}

interface RendererBoundaryState {
  failed: boolean
}

/**
 * The renderer's last boundary, keeping an uncaught render exception from turning
 * the window into a transparent blank. Details go to local storage; the screen
 * shows only the recovery action.
 */
export class RendererBoundary extends Component<RendererBoundaryProps, RendererBoundaryState> {
  state: RendererBoundaryState = { failed: false }

  static getDerivedStateFromError(): RendererBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Exception thrown while rendering', error, info.componentStack)
    try {
      localStorage.setItem(
        ERROR_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack
        })
      )
    } catch {
      // Even when diagnostics can't be saved, the way back to recovery must remain
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <EmptyState
          title={t('rendererBoundary.title')}
          action={{ label: t('rendererBoundary.reload'), onClick: () => window.location.reload() }}
        />
      )
    }
    return this.props.children
  }
}
