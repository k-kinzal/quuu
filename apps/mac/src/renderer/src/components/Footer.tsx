import {
  AppShellFooter,
  Counter,
  Gauge,
  PillButton,
  Spacer,
  StatusBarItem,
  StatusBarNotice,
  StatusBarOverflow,
  Text,
  claimContextMenu,
  motionRegion,
  useTheme,
  type GaugeCell
} from '@design-system/react'
import { useMemo } from 'react'
import { contextMenu } from '../interaction/menu.js'
import { clockOrDate } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { CirclePause, CirclePlay, ICON, Lock, TriangleAlert, iconProps } from '../ui/icons.js'

/**
 * A strip for monitoring.
 *
 * Not something to read but to "notice change" on. Numbers are monospaced
 * and fixed-width so positions don't shift when digits change. When all is
 * well, the warning area stays empty.
 */
export function Footer(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const setSection = useStore((s) => s.setSection)
  const openTask = useStore((s) => s.openTask)
  const applyScheduler = useStore((s) => s.applyScheduler)
  const theme = useTheme()

  const status = snapshot?.scheduler
  const slots = useMemo<GaugeCell[]>(() => {
    if (!status) return []
    const cells: GaugeCell[] = []
    for (const agent of status.agents) {
      if (!agent.enabled) continue
      for (let i = 0; i < agent.concurrency; i++) {
        // Fill in the order running → reserved → free. Reserved is "a slot that's free but won't be handed out"
        if (i < agent.active) {
          cells.push({ kind: 'filled', title: agent.agentName })
        } else if (i < agent.active + agent.reserved) {
          cells.push({ kind: 'outlined', title: t('footer.slotReserved', { name: agent.agentName }) })
        } else if (agent.cooldownUntil) {
          cells.push({ kind: 'filled', color: theme.palette.warning.main, title: agent.agentName })
        } else {
          cells.push({ kind: 'empty', title: agent.agentName })
        }
      }
    }
    return cells
  }, [status, theme])

  if (!status) return <AppShellFooter {...motionRegion('footer', 'left')} />

  const toggle = async (): Promise<void> => {
    const next = status.running
      ? await window.quuu.scheduler.pause()
      : await window.quuu.scheduler.resume()
    applyScheduler(next)
  }

  const cooling = status.agents.filter((a) => a.cooldownUntil)
  const warning =
    cooling.length > 0
      ? t('footer.limitUntil', {
        names: cooling.map((a) => a.agentName).join(' / '),
        time: clockOrDate(cooling[0].cooldownUntil!)
      })
      : !status.running
        ? t('footer.paused')
        : (status.warnings[0] ?? '')

  return (
    <AppShellFooter
      {...motionRegion('footer', 'left')}
      accent={status.running ? undefined : theme.palette.warning.main}
      /* The monitoring band. Right-clicking even on the numbers must reach pause / resume */
      onContextMenu={(e) => {
        if (!claimContextMenu(e)) return
        void contextMenu([
          {
            label: status.running ? t('footer.pause') : t('footer.resume'),
            onSelect: () => void toggle()
          },
          {
            label: t('footer.showReview'),
            accelerator: 'Cmd+2',
            separatorBefore: true,
            onSelect: () => setSection({ kind: 'review' })
          }
        ])
      }}
    >
      <StatusBarOverflow>
        <StatusBarItem title={t('footer.slotsTitle')}>
          <Text tone="tertiary">{t('footer.running')}</Text>
          <Counter>{status.activeRuns}</Counter>
          <Text tone="tertiary">/ {status.totalSlots}</Text>
          <Gauge label={t('footer.gauge')} cells={slots} />
        </StatusBarItem>

        <StatusBarItem onClick={() => setSection({ kind: 'all' })}>
          <Text tone="tertiary">{t('footer.queued')}</Text>
          <Counter zero={status.queued === 0}>{status.queued}</Counter>
        </StatusBarItem>

        <StatusBarItem
          title={t('footer.reviewTitle')}
          onClick={() => setSection({ kind: 'review' })}
        >
          <Text tone="tertiary">{t('footer.review')}</Text>
          <Counter tone="warning" zero={status.review === 0}>
            {status.review}
          </Counter>
        </StatusBarItem>

        <StatusBarItem onClick={() => setSection({ kind: 'review' })}>
          <Text tone="tertiary">{t('footer.failed')}</Text>
          <Counter tone="danger" zero={status.failed === 0}>
            {status.failed}
          </Counter>
        </StatusBarItem>

        {status.holds.length > 0 && (
          <StatusBarItem
            accent={theme.palette.primaryText}
            title={`${t('footer.holdsTitle')}\n${status.holds
              .map((h) => `${h.taskTitle} — ${h.projectName}${h.agentName ? ` / ${h.agentName}` : ''}`)
              .join('\n')}`}
            onClick={() => void openTask(status.holds[0].taskId)}
          >
            <Lock size={ICON.sm} {...iconProps} />
            <Text tone="tertiary">{t('footer.holds')}</Text>
            <Counter>{status.holds.length}</Counter>
          </StatusBarItem>
        )}

        <Spacer />

        {warning && (
          <StatusBarNotice title={status.warnings.join('\n') || warning}>
            <TriangleAlert size={ICON.sm} {...iconProps} />
            <Text truncate>{warning}</Text>
          </StatusBarNotice>
        )}

      </StatusBarOverflow>

      <PillButton
        type="button"
        onClick={() => void toggle()}
        title={status.running ? t('footer.pause') : t('footer.resume')}
      >
        {status.running ? (
          <CirclePlay size={ICON.sm} {...iconProps} />
        ) : (
          <CirclePause size={ICON.sm} {...iconProps} />
        )}
        {status.running ? t('footer.stateRunning') : t('footer.statePaused')}
      </PillButton>

    </AppShellFooter>
  )
}
