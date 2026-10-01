import { RunnerConnections } from './RunnerConnections.js'
import { Button, SettingToggle, SettingRow, FieldHint, NumberInput, Page, InputAction, SettingsBlock, SettingsGroup, Text } from '@design-system/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'
import { useSettings, useStore } from '../../state/store.js'

export function ConnectionSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore(s => s.setSettings)
  const status = useQuery({
    queryKey: ['servers.status'], queryFn: () => window.quuu.servers.status(),
    refetchInterval: 2000, retry: false, networkMode: 'always'
  }, queryClient)
  return <Page title={t('connectionSettings.title')}>
    <RunnerConnections />
    <SettingsGroup title={t('connectionSettings.http')}>
      <SettingToggle label={t('connectionSettings.enableHttp')} checked={settings.httpEnabled} onChange={enabled => void setSettings({ httpEnabled: enabled })} />
      <Port key={`http-${settings.httpPort}`} value={settings.httpPort} save={port => setSettings({ httpPort: port })} />
      <SettingsBlock><Text selectable>{status.data?.http.url ?? t(status.data?.http.error ? 'connectionSettings.unavailable' : settings.httpEnabled ? 'connectionSettings.starting' : 'connectionSettings.off')}</Text>
      {status.data?.http.error && <FieldHint tone="danger">{status.data.http.error}</FieldHint>}</SettingsBlock>
    </SettingsGroup>
    <SettingsGroup title={t('connectionSettings.mcp')}>
      <SettingToggle label={t('connectionSettings.enableMcp')} checked={settings.mcpEnabled} onChange={enabled => void setSettings({ mcpEnabled: enabled })} />
      <Port key={`mcp-${settings.mcpPort}`} value={settings.mcpPort} save={port => setSettings({ mcpPort: port })} />
      <SettingsBlock><Text selectable>{status.data?.mcp.url ?? t(status.data?.mcp.error ? 'connectionSettings.unavailable' : settings.mcpEnabled ? 'connectionSettings.starting' : 'connectionSettings.off')}</Text>
      {status.data?.mcp.error && <FieldHint tone="danger">{status.data.mcp.error}</FieldHint>}</SettingsBlock>
    </SettingsGroup>
    <SettingsGroup title={t('connectionSettings.credentials')}>
      <SettingsBlock>
      <Text selectable>{status.data?.connectionFile}</Text>
      <FieldHint>{t('connectionSettings.credentialsHint')}</FieldHint>
      {status.error && <FieldHint tone="danger">{status.error.message}</FieldHint>}
      </SettingsBlock>
    </SettingsGroup>
  </Page>
}

function Port({ value, save }: { value: number; save: (port: number) => Promise<unknown> }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const apply = async (): Promise<void> => { setBusy(true); try { await save(draft) } finally { setBusy(false) } }
  return <SettingRow label={t('connectionSettings.port')} width="sm">
    <InputAction>
      <NumberInput aria-label={t('connectionSettings.port')} min={0} max={65535} value={draft} zeroLabel={t('connectionSettings.automatic')} onChange={setDraft} />
      <Button disabled={busy || draft === value} onClick={() => void apply()}>{t('connectionSettings.apply')}</Button>
    </InputAction>
  </SettingRow>
}
