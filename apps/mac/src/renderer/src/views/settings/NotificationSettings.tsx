import { useState } from 'react'
import {
  Button, FieldHint, IconButton, ListFrameButton, NumberInput, Page, RepeatableList,
  RepeatableRow, Row, Select, SettingRow, SettingsBlock, SettingsGroup, SettingToggle, TextArea, TextInput
} from '@design-system/react'
import { Plus, X } from 'lucide-react'
import type { NotificationKind } from '../../../../api/schemas/notifications.js'
import type { AppSettings } from '../../../../api/schemas/settings.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

const kinds: NotificationKind[] = ['review', 'failure', 'followUp', 'reportFailure', 'pullRequest', 'syncConflict']
const variables = ['{{type}}, {{title}}, {{message}}', '{{detail}}, {{taskId}}, {{taskTitle}}', '{{projectId}}, {{projectName}}']

export function NotificationSettings(): JSX.Element {
  const settings = useSettings()
  const [kind, setKind] = useState<NotificationKind>('review')
  const save = async (patch: Partial<AppSettings>): Promise<void> => {
    try { await useStore.getState().setSettings(patch) }
    catch (error) { useStore.getState().reportFailure(error, ['settings', 'set']) }
  }
  return <Page title={t('notificationSettings.title')}>
    <SettingsGroup title={t('notificationSettings.events')}>
      <SettingToggle label={t('notificationSettings.notifyOnReview')} checked={settings.notifyOnReview} onChange={v => void save({ notifyOnReview: v })} />
      <SettingToggle label={t('notificationSettings.notifyOnFailure')} checked={settings.notifyOnFailure} onChange={v => void save({ notifyOnFailure: v })} />
    </SettingsGroup>
    <SettingsGroup title={t('notificationSettings.delivery')}>
      <SettingToggle label={t('notificationSettings.native')} hint={t('notificationSettings.nativeHint')} checked={settings.nativeNotifications} onChange={v => void save({ nativeNotifications: v })} />
      <SettingToggle label={t('notificationSettings.sstp')} hint={t('notificationSettings.sstpHint')} checked={settings.sstpEnabled} onChange={v => void save({ sstpEnabled: v })}>
        <SstpEditor key={JSON.stringify([settings.sstpHost, settings.sstpPort, settings.sstpScripts])} settings={settings} kind={kind} onKindChange={setKind} />
      </SettingToggle>
    </SettingsGroup>
  </Page>
}

function SstpEditor({ settings, kind, onKindChange }: { settings: AppSettings; kind: NotificationKind; onKindChange: (kind: NotificationKind) => void }): JSX.Element {
  const [host, setHost] = useState(settings.sstpHost)
  const [port, setPort] = useState(settings.sstpPort)
  const [scripts, setScripts] = useState(settings.sstpScripts)
  const [busy, setBusy] = useState(false)
  const changed = host !== settings.sstpHost || port !== settings.sstpPort || JSON.stringify(scripts) !== JSON.stringify(settings.sstpScripts)
  const save = async (): Promise<void> => {
    setBusy(true)
    try { await useStore.getState().setSettings({ sstpHost: host.trim(), sstpPort: port, sstpScripts: scripts }) }
    catch (error) { useStore.getState().reportFailure(error, ['settings', 'set']) }
    finally { setBusy(false) }
  }
  return <>
    <SettingRow label={t('notificationSettings.host')}><TextInput value={host} onChange={e => setHost(e.target.value)} disabled={busy} /></SettingRow>
    <SettingRow label={t('notificationSettings.port')} width="sm"><NumberInput value={port} onChange={setPort} disabled={busy} /></SettingRow>
    <SettingRow label={t('notificationSettings.kind')}><Select value={kind} disabled={busy} onChange={e => onKindChange(e.target.value)} options={kinds.map(value => ({ value, label: t(`notificationSettings.kinds.${value}`) }))} /></SettingRow>
    <SettingRow label={t('notificationSettings.scripts')} hint={t('notificationSettings.scriptsHint')} layout="stacked">
      <RepeatableList bar={<ListFrameButton title={t('notificationSettings.addScript')} icon={<Plus />} disabled={busy || scripts[kind].length >= 100} onClick={() => setScripts({ ...scripts, [kind]: [...scripts[kind], '\\0{{message}}\\e'] })} />}>
        {scripts[kind].map((script, index) => <RepeatableRow key={`${kind}-${index}`} index={index}>
          <TextArea rows={3} value={script} disabled={busy} aria-label={t('notificationSettings.script', { number: index + 1 })} onChange={e => setScripts({ ...scripts, [kind]: scripts[kind].map((value, i) => i === index ? e.target.value : value) })} />
          <IconButton icon={<X />} title={t('notificationSettings.removeScript', { number: index + 1 })} disabled={busy} onClick={() => setScripts({ ...scripts, [kind]: scripts[kind].filter((_, i) => i !== index) })} />
        </RepeatableRow>)}
      </RepeatableList>
    </SettingRow>
    <SettingsBlock>
      {variables.map(names => <FieldHint key={names}>{t('notificationSettings.variables', { names })}</FieldHint>)}
      <FieldHint>{t('notificationSettings.variableHint')}</FieldHint>
      <Row><Button disabled={busy || !changed} onClick={() => void save()}>{t('notificationSettings.save')}</Button></Row>
    </SettingsBlock>
  </>
}
