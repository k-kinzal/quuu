import { StatusIndicator, Text, type StatusShape, type StatusTone } from '@design-system/react'
import type { HookRun } from '../../../api/schemas/hooks.js'
import { t } from '../model/i18n/index.js'

const STATUS: Record<HookRun['status'], { shape: StatusShape; tone: StatusTone }> = {
  queued: { shape: 'quarter', tone: 'neutral' },
  starting: { shape: 'spinner', tone: 'accent' },
  running: { shape: 'spinner', tone: 'accent' },
  succeeded: { shape: 'check', tone: 'neutral' },
  failed: { shape: 'cross', tone: 'danger' },
  canceled: { shape: 'pause', tone: 'neutral' }
}

export function HookStatus({ status }: { status: HookRun['status'] }): JSX.Element {
  const label = t(`hooks.status.${status}`)
  return <>
    <span aria-hidden="true"><StatusIndicator {...STATUS[status]} label={label} /></span>
    <Text size="xs" fixed tone={status === 'failed' ? 'danger' : status === 'running' || status === 'starting' ? 'accent' : 'tertiary'}>{label}</Text>
  </>
}
