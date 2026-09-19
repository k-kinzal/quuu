import { ToastStack, iconDefaults, iconSize, type ToastTone } from '@design-system/react'
import { CircleAlert, CircleCheckBig, TriangleAlert } from 'lucide-react'
import type { ToastPayload } from '../../../preload/api/snapshot.js'
import { useStore } from '../state/store.js'

/** Mapping from the level main uses to the design system's tone. */
function toneOf(level: ToastPayload['level']): ToastTone {
  return level === 'error' ? 'danger' : level === 'success' ? 'success' : level === 'warn' ? 'warning' : 'info'
}

function icon(tone: ToastTone): JSX.Element {
  const props = { size: iconSize.sm, ...iconDefaults }
  if (tone === 'danger' || tone === 'warning') {
    return tone === 'danger' ? <CircleAlert {...props} /> : <TriangleAlert {...props} />
  }
  return <CircleCheckBig {...props} />
}

export function Toasts(): JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const revealTask = useStore((s) => s.revealTask)

  return (
    <ToastStack
      icon={icon}
      placement="aboveFooter"
      toasts={toasts.map((t) => ({ ...t, tone: toneOf(t.level) }))}
      onSelect={(toast) => {
        // Where the task is shown is the store's call (stay put when this section holds it)
        if (toast.taskId) void revealTask(toast.taskId)
        dismiss(toast.id)
      }}
      onDismiss={(toast) => dismiss(toast.id)}
    />
  )
}
