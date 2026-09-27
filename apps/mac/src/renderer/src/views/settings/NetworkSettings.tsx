import { Button, Checkbox, Column, Field, FieldHint, NumberInput, Page, Row, Section, Text, TextInput } from '@design-system/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { NetworkStatus } from '../../../../api/schemas/network.js'
import { t } from '../../model/i18n/index.js'
import { failureReason } from '../../model/operationFailure.js'
import { queryClient } from '../../state/queryClient.js'

const KEY = ['network.status']

/**
 * Settings › Multiple Computers.
 *
 * Always this computer's own, even while the window shows a host: which role it plays is not
 * something the host decides for it.
 */
export function NetworkSettings(): JSX.Element {
  const status = useQuery({
    queryKey: KEY, queryFn: () => window.quuu.network.status(),
    refetchInterval: 2000, retry: false, networkMode: 'always'
  }, queryClient)
  const apply = (next: NetworkStatus): void => { queryClient.setQueryData(KEY, next) }
  const data = status.data
  return <Page title={t('networkSettings.title')}>
    {status.error && <FieldHint tone="danger">{status.error.message}</FieldHint>}
    {data && <HostSection status={data} apply={apply} />}
    {data && <SatelliteSection status={data} apply={apply} />}
  </Page>
}

function HostSection({ status, apply }: { status: NetworkStatus; apply: (next: NetworkStatus) => void }): JSX.Element {
  const host = status.host
  const expires = host.pairing ? new Date(host.pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return <Section title={t('networkSettings.host')}>
    <Checkbox label={t('networkSettings.enableHost')} checked={host.enabled} onChange={enabled => void window.quuu.network.configure({ hostEnabled: enabled }).then(apply)} />
    <Port key={host.port} value={host.port} save={port => window.quuu.network.configure({ hostPort: port }).then(apply)} />
    {host.enabled && <Text selectable>{host.addresses.length ? host.addresses.join('  ') : t(host.error ? 'networkSettings.unavailable' : 'networkSettings.starting')}</Text>}
    {host.error && <FieldHint tone="danger">{host.error}</FieldHint>}
    <Row gap="md">
      <Button disabled={!host.enabled || host.addresses.length === 0} onClick={() => void window.quuu.network.openPairing().then(apply)}>{t('networkSettings.pair')}</Button>
      {host.pairing && <Text selectable mono>{host.pairing.code}</Text>}
    </Row>
    {host.pairing && <FieldHint>{t('networkSettings.pairingHint', { time: expires })}</FieldHint>}
    {host.devices.length > 0 && <Column gap="xs" align="stretch">
      <Text tone="tertiary">{t('networkSettings.devices')}</Text>
      {host.devices.map(device => <Row key={device.id} gap="md">
        <Text truncate>{device.name}</Text>
        <Text size="xs" tone="tertiary">{new Date(device.pairedAt).toLocaleDateString()}</Text>
        <Button onClick={() => void remove(device)}>{t('networkSettings.remove')}</Button>
      </Row>)}
    </Column>}
    <FieldHint>{t('networkSettings.hostHint')}</FieldHint>
  </Section>

  async function remove(device: { id: string; name: string }): Promise<void> {
    const confirmed = await window.quuu.system.confirm({ message: t('networkSettings.removeConfirm', { name: device.name }), detail: t('networkSettings.removeDetail'), confirmLabel: t('networkSettings.remove') })
    if (confirmed) apply(await window.quuu.network.removeDevice(device.id))
  }
}

function SatelliteSection({ status, apply }: { status: NetworkStatus; apply: (next: NetworkStatus) => void }): JSX.Element {
  const satellite = status.satellite
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pair = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      apply(await window.quuu.network.pair({ address, code: code.replace(/\D/g, '') }, { context: { feedback: 'inline' } }))
      setCode('')
    } catch (failure) { setError(failureReason(failure)) } finally { setBusy(false) }
  }
  const state = satellite.state === 'connected' ? t('networkSettings.connected', { name: satellite.host?.name, address: satellite.host?.address })
    : satellite.state === 'searching' ? t('networkSettings.searching', { name: satellite.host?.name })
      : satellite.state === 'unpaired' ? t('networkSettings.unpaired') : t('networkSettings.off')
  return <Section title={t('networkSettings.satellite')}>
    <Checkbox label={t('networkSettings.enableSatellite')} checked={satellite.enabled} onChange={enabled => void window.quuu.network.configure({ satelliteEnabled: enabled }).then(apply)} />
    <Text>{state}</Text>
    {satellite.error && <FieldHint tone="danger">{satellite.error}</FieldHint>}
    {satellite.enabled && satellite.host && <Row>
      <Button onClick={() => void window.quuu.network.unpair().then(apply)}>{t('networkSettings.unpair')}</Button>
    </Row>}
    {satellite.enabled && !satellite.host && <>
      {satellite.discovered.length > 0 && <Column gap="xs" align="stretch">
        <Text tone="tertiary">{t('networkSettings.discovered')}</Text>
        {satellite.discovered.map(peer => <Row key={peer.id} gap="md">
          <Text truncate>{peer.name}</Text>
          <Text size="xs" tone="tertiary">{peer.address}</Text>
          <Button onClick={() => setAddress(peer.address)}>{t('networkSettings.choose')}</Button>
        </Row>)}
      </Column>}
      <Field label={t('networkSettings.address')}>
        <TextInput aria-label={t('networkSettings.address')} value={address} placeholder="192.168.1.20:47810" onChange={event => setAddress(event.target.value)} />
      </Field>
      <Field label={t('networkSettings.code')} width="sm">
        <Row>
          <TextInput aria-label={t('networkSettings.code')} value={code} mono inputProps={{ inputMode: 'numeric', maxLength: 7 }} onChange={event => setCode(event.target.value)} />
          <Button disabled={busy || !address.trim() || code.replace(/\D/g, '').length !== 6} onClick={() => void pair()}>{t('networkSettings.pairWithHost')}</Button>
        </Row>
      </Field>
      {error && <FieldHint tone="danger">{error}</FieldHint>}
    </>}
    <FieldHint>{t('networkSettings.satelliteHint')}</FieldHint>
  </Section>
}

function Port({ value, save }: { value: number; save: (port: number) => Promise<unknown> }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const apply = async (): Promise<void> => { setBusy(true); try { await save(draft) } finally { setBusy(false) } }
  return <Field label={t('networkSettings.port')} width="sm">
    <Row>
      <NumberInput aria-label={t('networkSettings.port')} min={1} max={65535} value={draft} onChange={setDraft} />
      <Button disabled={busy || draft === value || draft < 1} onClick={() => void apply()}>{t('networkSettings.apply')}</Button>
    </Row>
  </Field>
}
