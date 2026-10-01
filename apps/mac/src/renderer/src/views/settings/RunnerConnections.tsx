import { Button, CodeBlock, SettingToggle, InputAction, LinkButton, SettingsBlock, SettingRow, FieldHint, NumberInput, Row, SettingsGroup, Text, TextInput } from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { RunnerPairing, RunnerStatus } from '../../../../api/types.js'
import { copyText } from '../../interaction/contextMenu.js'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'

type RunnerItem = RunnerStatus['runners'][number]
type TokenAgent = RunnerStatus['credentials'][number]['agent']
const LOGIN_AGENTS = ['codex'] as const
const isLoginAgent = (name: string): name is typeof LOGIN_AGENTS[number] => (LOGIN_AGENTS as readonly string[]).includes(name)

export function RunnerConnections(): JSX.Element {
  const status = useQuery({ queryKey: ['runners.status'], queryFn: () => window.quuu.runners.status(),
    refetchInterval: 2000, retry: false, networkMode: 'always' }, queryClient)
  const [pairing, setPairing] = useState<RunnerPairing | null>(null)
  const [port, setPort] = useState<number | null>(null)
  const change = useMutation({ mutationFn: (config: { enabled: boolean; port: number }) => window.quuu.runners.configure(config),
    onSuccess: next => { queryClient.setQueryData(['runners.status'], next); setPairing(null) } }, queryClient)
  const pair = useMutation({ mutationFn: () => window.quuu.runners.pairing(), onSuccess: setPairing }, queryClient)
  const revoke = useMutation({ mutationFn: (id: string) => window.quuu.runners.revoke(id), onSuccess: () => { void status.refetch() } }, queryClient)
  const signIn = useMutation({ mutationFn: (input: { runnerId: string; agent: typeof LOGIN_AGENTS[number] }) => window.quuu.runners.signIn(input),
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
      {status.data && <RunnerTokens credentials={status.data.credentials} />}
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
      {runner.agents.map(agent => <Row key={agent.name} justify="between" wrap gap="md">
        <FieldHint tone={agent.auth === 'missing' ? 'danger' : undefined}>{t('runnerSettings.agentLine', { name: agent.name, version: agent.version, auth: t(`runnerSettings.auth.${agent.auth}`) })}</FieldHint>
        {isLoginAgent(agent.name) && agent.auth !== 'quuu' && <Button variant="ghost" disabled={!runner.online || signIn.isPending || runner.login?.state === 'waiting'}
          onClick={() => signIn.mutate({ runnerId: runner.id, agent: agent.name as typeof LOGIN_AGENTS[number] })}>
          {t(agent.auth === 'runner' ? 'runnerSettings.signInAgain' : 'runnerSettings.signIn', { name: agent.name })}
        </Button>}
      </Row>)}
      {runner.login && <RunnerLogin login={runner.login} />}
    </SettingsBlock>)}
    {(error || status.data?.error) && <SettingsBlock><FieldHint tone="danger">{error?.message || status.data?.error}</FieldHint></SettingsBlock>}
  </SettingsGroup>
}

/** A sign-in started for one Runner: waiting for the browser, handing it over, or why it stopped. */
function RunnerLogin({ login }: { login: NonNullable<RunnerItem['login']> }): JSX.Element {
  if (login.state === 'failed') return <FieldHint tone="danger">{t('runnerSettings.loginFailed', { error: login.error })}</FieldHint>
  if (login.state === 'delivering') return <FieldHint>{t('runnerSettings.loginDelivering')}</FieldHint>
  return <Row wrap gap="md">
    <FieldHint>{t('runnerSettings.loginWaiting')}</FieldHint>
    {login.url && <LinkButton tone="accent" onClick={() => window.open(login.url, '_blank', 'noopener')}>{t('runnerSettings.openLogin')}</LinkButton>}
  </Row>
}

/** Tokens saved once on this computer and lent to every Runner's matching jobs. */
function RunnerTokens({ credentials }: { credentials: RunnerStatus['credentials'] }): JSX.Element {
  const [drafts, setDrafts] = useState<Partial<Record<TokenAgent, string>>>({})
  const save = useMutation({ mutationFn: (input: { agent: TokenAgent; value: string }) => window.quuu.runners.setCredential(input),
    onSuccess: (next, input) => { queryClient.setQueryData(['runners.status'], next); setDrafts(current => ({ ...current, [input.agent]: '' })) } }, queryClient)
  return <SettingsBlock>
    <Text weight="medium">{t('runnerSettings.tokensTitle')}</Text>
    <FieldHint>{t('runnerSettings.tokensHint')}</FieldHint>
    {credentials.map(credential => {
      const draft = drafts[credential.agent] ?? ''
      return <SettingRow key={credential.agent} label={t(`runnerSettings.token.${credential.agent}`)} width="lg"
        hint={`${t(`runnerSettings.tokenHint.${credential.agent}`)} ${t(credential.configured ? 'runnerSettings.tokenSaved' : 'runnerSettings.tokenMissing')}`}
        accessory={credential.configured ? <Button variant="ghost" color="error" disabled={save.isPending}
          onClick={() => save.mutate({ agent: credential.agent, value: '' })}>{t('runnerSettings.removeToken')}</Button> : undefined}>
        <InputAction>
          <TextInput type="password" mono autoComplete="off" spellCheck={false} value={draft}
            placeholder={credential.configured ? '••••••••' : credential.variable}
            onChange={event => setDrafts(current => ({ ...current, [credential.agent]: event.target.value }))} />
          <Button disabled={save.isPending || !draft.trim()} onClick={() => save.mutate({ agent: credential.agent, value: draft })}>{t('runnerSettings.saveToken')}</Button>
        </InputAction>
      </SettingRow>
    })}
    {save.error && <FieldHint tone="danger">{save.error.message}</FieldHint>}
  </SettingsBlock>
}
