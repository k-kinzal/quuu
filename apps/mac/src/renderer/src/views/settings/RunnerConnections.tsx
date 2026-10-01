import { Button, SettingToggle, InputAction, SettingsBlock, SettingRow, FieldHint, NumberInput, Row, SettingsGroup, Text } from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { RunnerPairing } from '../../../../api/types.js'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'

export function RunnerConnections(): JSX.Element {
  const status = useQuery({ queryKey: ['runners.status'], queryFn: () => window.quuu.runners.status(),
    refetchInterval: 2000, retry: false, networkMode: 'always' }, queryClient)
  const [pairing, setPairing] = useState<RunnerPairing | null>(null)
  const [port, setPort] = useState<number | null>(null)
  const change = useMutation({ mutationFn: (enabled: boolean) => window.quuu.runners.configure({ enabled, port: port ?? status.data?.port ?? 47833 }),
    onSuccess: () => { void status.refetch() } }, queryClient)
  const pair = useMutation({ mutationFn: () => window.quuu.runners.pairing(), onSuccess: setPairing }, queryClient)
  const revoke = useMutation({ mutationFn: (id: string) => window.quuu.runners.revoke(id), onSuccess: () => { void status.refetch() } }, queryClient)
  const error = status.error ?? change.error ?? pair.error ?? revoke.error
  return <SettingsGroup title={t('runnerSettings.title')}>
    <SettingToggle label={t('runnerSettings.enable')} hint={t('runnerSettings.hint')} checked={status.data?.enabled ?? false}
      disabled={change.isPending} onChange={enabled => change.mutate(enabled)} />
    <SettingRow label={t('runnerSettings.port')} width="md">
      <InputAction>
        <NumberInput aria-label={t('runnerSettings.port')} min={0} max={65535} value={port ?? status.data?.port ?? 47833} onChange={setPort} />
        <Button disabled={change.isPending || port === null} onClick={() => change.mutate(status.data?.enabled ?? false)}>{t('runnerSettings.apply')}</Button>
      </InputAction>
    </SettingRow>
    <SettingsBlock>
      <Row justify="between" wrap gap="md">
        <Text mono selectable>{status.data?.urls.join(' · ')}</Text>
        <Button disabled={!status.data?.listening || pair.isPending} onClick={() => pair.mutate()}>{t('runnerSettings.pair')}</Button>
      </Row>
    </SettingsBlock>
    {pairing && <SettingsBlock>
      <Text selectable>{t('runnerSettings.pin', { pin: pairing.pin })}</Text>
      <FieldHint>{t('runnerSettings.expires', { time: new Date(pairing.expiresAt).toLocaleTimeString() })}</FieldHint>
      <SettingRow layout="stacked" label={t('runnerSettings.fingerprint')}><Text mono selectable>{pairing.fingerprint}</Text></SettingRow>
      <FieldHint>{t('runnerSettings.pairHint')}</FieldHint>
    </SettingsBlock>}
    {status.data?.runners.filter(runner => !runner.revoked).map(runner => <SettingsBlock key={runner.id}>
      <Row justify="between" wrap gap="md">
        <Text weight="medium">{runner.name}</Text>
        <Text tone="secondary">{t(runner.online ? 'runnerSettings.online' : 'runnerSettings.offline')}</Text>
      </Row>
      <Row justify="between" wrap gap="md">
        <Text tone="secondary">{t('runnerSettings.capacity', { active: runner.active, capacity: runner.capacity })}</Text>
        <Button variant="ghost" color="error" disabled={runner.active > 0 || revoke.isPending} onClick={() => revoke.mutate(runner.id)}>{t('runnerSettings.revoke')}</Button>
      </Row>
      <FieldHint>{t('runnerSettings.labels', { labels: runner.labels?.join(', ') || t('runnerSettings.noLabels') })}</FieldHint>
      <FieldHint>{runner.agents.map(agent => `${agent.name} ${agent.version}`).join(' · ') || t('runnerSettings.noAgents')}</FieldHint>
    </SettingsBlock>)}
    {(error || status.data?.error) && <SettingsBlock><FieldHint tone="danger">{error?.message || status.data?.error}</FieldHint></SettingsBlock>}
  </SettingsGroup>
}
