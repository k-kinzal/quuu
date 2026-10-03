import { Button, CodeBlock, Column, SettingToggle, InputAction, SettingsBlock, SettingRow, FieldHint, NumberInput, Row, SettingsGroup, Text } from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { RunnerPairing, RunnerStatus } from '../../../../api/types.js'
import { copyText } from '../../interaction/contextMenu.js'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'

type RunnerItem = RunnerStatus['runners'][number]
type LoginAgent = NonNullable<RunnerItem['login']>['agent']
const LOGIN_AGENTS: readonly string[] = ['codex', 'claude', 'cursor-agent'] satisfies LoginAgent[]
const isLoginAgent = (name: string): name is LoginAgent => LOGIN_AGENTS.includes(name)

export function RunnerConnections(): JSX.Element {
  const status = useQuery({ queryKey: ['runners.status'], queryFn: () => window.quuu.runners.status(),
    refetchInterval: 2000, retry: false, networkMode: 'always' }, queryClient)
  const [pairing, setPairing] = useState<RunnerPairing | null>(null)
  const [port, setPort] = useState<number | null>(null)
  const change = useMutation({ mutationFn: (config: { enabled: boolean; port: number }) => window.quuu.runners.configure(config),
    onSuccess: next => { queryClient.setQueryData(['runners.status'], next); setPairing(null) } }, queryClient)
  const pair = useMutation({ mutationFn: () => window.quuu.runners.pairing(), onSuccess: setPairing }, queryClient)
  const revoke = useMutation({ mutationFn: (id: string) => window.quuu.runners.revoke(id), onSuccess: () => { void status.refetch() } }, queryClient)
  const signIn = useMutation({ mutationFn: (input: { runnerId: string; agent: LoginAgent }) => window.quuu.runners.signIn(input),
    onSuccess: next => queryClient.setQueryData(['runners.status'], next) }, queryClient)
  const error = status.error ?? change.error ?? pair.error ?? revoke.error ?? signIn.error
  return <SettingsGroup title={t('runnerSettings.title')}>
    <SettingToggle label={t('runnerSettings.enable')} hint={t('runnerSettings.hint')} checked={status.data?.enabled ?? false}
      disabled={change.isPending || !status.data} onChange={enabled => change.mutate({ enabled, port: status.data?.port ?? 47833 })}>
      <SettingRow label={t('runnerSettings.port')} width="md">
        <InputAction>
          <NumberInput aria-label={t('runnerSettings.port')} min={0} max={65535} value={port ?? status.data?.port ?? 47833} onChange={setPort} />
          <Button disabled={change.isPending || port === null || port === status.data?.port} onClick={() => change.mutate({ enabled: status.data?.enabled ?? false, port: port ?? status.data?.port ?? 47833 })}>{t('runnerSettings.apply')}</Button>
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
        <SettingRow layout="stacked" label={t('runnerSettings.command')} hint={t('runnerSettings.commandHint')}
          accessory={<Button onClick={() => copyText(pairing.command)}>{t('runnerSettings.copyCommand')}</Button>}>
          <CodeBlock>{pairing.command}</CodeBlock>
        </SettingRow>
      </SettingsBlock>}
    </SettingToggle>
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
      {runner.agents.length === 0 && <FieldHint>{t('runnerSettings.noAgents')}</FieldHint>}
      {runner.agents.map(agent => <Column key={agent.name} gap="xs" role="group" aria-label={agent.name}>
        <Row justify="between" wrap gap="md">
        <FieldHint tone={agent.auth === 'missing' || agent.auth === 'expired' ? 'danger' : undefined}>{t('runnerSettings.agentLine', { name: agent.name, version: agent.version, auth: t(`runnerSettings.auth.${agent.auth}`) })}</FieldHint>
        {isLoginAgent(agent.name) && <Button variant={agent.auth === 'expired' ? 'outline' : 'ghost'} disabled={!runner.online || agent.auth === 'unknown' || signIn.isPending || runner.login?.state === 'waiting' || runner.login?.state === 'delivering'}
          onClick={() => { if (isLoginAgent(agent.name)) signIn.mutate({ runnerId: runner.id, agent: agent.name }) }}>
          {t(['signedIn', 'expired', 'unverified'].includes(agent.auth) ? 'runnerSettings.signInAgain' : 'runnerSettings.signIn', { name: agent.name })}
        </Button>}
        </Row>
        {agent.auth === 'expired' && <FieldHint tone="danger">{t('runnerSettings.authExpired', { name: agent.name })}</FieldHint>}
        {agent.auth === 'unverified' && <FieldHint>{t('runnerSettings.authUnverified')}</FieldHint>}
        {runner.login?.agent === agent.name && <RunnerLogin login={runner.login} />}
      </Column>)}
      {runner.agents.some(agent => agent.auth === 'unknown') && <FieldHint>{t('runnerSettings.updateRunner')}</FieldHint>}
    </SettingsBlock>)}
    {(error || status.data?.error) && <SettingsBlock><FieldHint tone="danger">{error?.message || status.data?.error}</FieldHint></SettingsBlock>}
  </SettingsGroup>
}

/** A sign-in started for one Runner: waiting for the browser, handing it over, or why it stopped. */
function RunnerLogin({ login }: { login: NonNullable<RunnerItem['login']> }): JSX.Element {
  if (login.state === 'failed') return <FieldHint tone="danger">{t('runnerSettings.loginFailed', { error: login.error })}</FieldHint>
  if (login.state === 'delivering') return <FieldHint>{t('runnerSettings.loginDelivering')}</FieldHint>
  return <FieldHint>{t('runnerSettings.loginWaiting', { name: login.agent })}</FieldHint>
}
