import {
  Button,
  SettingToggle,
  Column,
  SettingsBlock,
  SettingRow,
  FieldHint,
  ItemList,
  ItemRow,
  Page,
  SettingsGroup,
  Text
} from '@design-system/react'
import { useCallback, useEffect, useState } from 'react'
import type { MobileSyncStatus } from '../../../../api/schemas/snapshot.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings › iPhone.
 *
 * **Never make anyone choose the location.** It is hard-coded to one place inside iCloud
 * Drive. Making it selectable gave nobody a reason to select anything and only added a step.
 *
 * **Show only "when it last lined up".** Neither the version number nor the written/read
 * breakdown is a value that changes what a person does next. Since syncing happens out of
 * sight, one clue that separates "merely quiet" from "stuck" is enough.
 */
export function MobileSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const openTask = useStore((s) => s.openTask)
  const [status, setStatus] = useState<MobileSyncStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await window.quuu.mobile.status())
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [refresh])

  const syncNow = async (): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await window.quuu.mobile.syncNow())
    } finally {
      setBusy(false)
    }
  }

  const enabled = settings.mobileSyncEnabled

  return (
    <Page title="iPhone">
      <SettingsGroup title={t('mobileSettings.syncSection')}>
        <SettingToggle
          label={t('mobileSettings.syncEnable')}
          checked={enabled}
          onChange={(v: boolean) => {
            void setSettings({ mobileSyncEnabled: v }).then(refresh)
          }}
        />
        <SettingRow label={syncLabel(enabled, status)} width="auto">
          <Button disabled={busy || !enabled} onClick={() => void syncNow()}>
            {t('mobileSettings.syncNow')}
          </Button>
        </SettingRow>
        {status && enabled && !status.reachable && (
          <SettingsBlock><FieldHint tone="danger">{t('mobileSettings.unreachable')}</FieldHint></SettingsBlock>
        )}
        {status?.error && <SettingsBlock><FieldHint tone="danger">{status.error}</FieldHint></SettingsBlock>}
      </SettingsGroup>

      {/*
        Crossed wires (what the iPhone assumed when pressed vs. the Mac's actual state).
        Dropping these silently leaves only "I pressed it and nothing happened", so always
        surface them
      */}
      {status && status.conflicts.length > 0 && (
        <SettingsGroup title={t('mobileSettings.conflictsSection')}>
          <ItemList>
            {status.conflicts.map((c) => (
              <ItemRow
                key={c.intentId}
                type="button"
                lines={2}
                title={t('mobileSettings.open')}
                onClick={() => void openTask(c.taskId)}
              >
                <Column gap="none" align="start">
                  <Text truncate>{c.reason}</Text>
                  <Text size="xs" tone="tertiary">
                    {stamp(c.at)}
                  </Text>
                </Column>
              </ItemRow>
            ))}
          </ItemList>
        </SettingsGroup>
      )}

      {/* With nothing to show, don't render the section at all (never make anyone read "none") */}
      {status && enabled && status.conflicts.length === 0 && (
        <FieldHint>{t('mobileSettings.noConflicts')}</FieldHint>
      )}
    </Page>
  )
}

/** When it last lined up. **No written/read breakdown** (it changes nobody's behavior). */
function syncLabel(enabled: boolean, status: MobileSyncStatus | null): string {
  if (!enabled) return t('mobileSettings.off')
  if (!status) return ''
  const last = [status.lastExportAt, status.lastImportAt].filter(Boolean).sort().pop()
  return last ? t('mobileSettings.lastSync', { time: stamp(last) }) : t('mobileSettings.neverSynced')
}

function stamp(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleString()
}
