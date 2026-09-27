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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { contextMenu } from '../interaction/menu.js'
import { clockOrDate } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { slotCells, slotSummary } from '../model/slotGauge.js'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'
import { CirclePause, CirclePlay, ICON, Lock, Monitor, TriangleAlert, iconProps } from '../ui/icons.js'

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
  const setSettingsCategory = useStore((s) => s.setSettingsCategory)
  const theme = useTheme()
  // Read once per load: switching between a host and this computer reloads the window.
  const network = useQuery({ queryKey: ['network.status', 'footer'], queryFn: () => window.quuu.network.status(), staleTime: Infinity, retry: false, networkMode: 'always' }, queryClient)
  const host = network.data?.satellite.state === 'connected' ? network.data.satellite.host : null

  const status = snapshot?.scheduler
  const slots = useMemo<GaugeCell[]>(() => {
    if (!status) return []
    return slotCells(status.agents).map(({ state, title }) =>
      state === 'running'
        ? { kind: 'filled', title }
        : state === 'reserved'
          ? { kind: 'outlined', title }
          : state === 'limit'
            ? { kind: 'filled', color: theme.palette.warning.main, title }
            : { kind: 'empty', title }
    )
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
        <StatusBarItem title={slotSummary(status.agents)}>
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

        {host && (
          <StatusBarItem
            title={t('footer.hostTitle', { name: host.name })}
            onClick={() => { setSection({ kind: 'settings' }); setSettingsCategory('network') }}
          >
            <Monitor size={ICON.sm} {...iconProps} />
            <Text tone="tertiary">{t('footer.host', { name: host.name })}</Text>
          </StatusBarItem>
        )}

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
