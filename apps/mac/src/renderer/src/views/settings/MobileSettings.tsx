import {
  Button,
  Checkbox,
  Column,
  EmptyState,
  FieldHint,
  ItemList,
  ItemRow,
  Page,
  Row,
  Section,
  Text
} from '@design-system/react'
import { useCallback, useEffect, useState } from 'react'
import type { MobileSyncStatus } from '../../../../preload/api/snapshot.js'
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
      <Section title={t('mobileSettings.syncSection')}>
        <Checkbox
          label={t('mobileSettings.syncEnable')}
          checked={enabled}
          onChange={(v: boolean) => {
            void setSettings({ mobileSyncEnabled: v }).then(refresh)
          }}
        />
        <Row gap="md">
          <Button disabled={busy || !enabled} onClick={() => void syncNow()}>
            {t('mobileSettings.syncNow')}
          </Button>
          <Text size="xs" tone="tertiary">
            {syncLabel(enabled, status)}
          </Text>
        </Row>
        {status && enabled && !status.reachable && (
          <FieldHint tone="danger">{t('mobileSettings.unreachable')}</FieldHint>
        )}
        {status?.error && <FieldHint tone="danger">{status.error}</FieldHint>}
      </Section>

      {/*
        Crossed wires (what the iPhone assumed when pressed vs. the Mac's actual state).
        Dropping these silently leaves only "I pressed it and nothing happened", so always
        surface them
      */}
      {status && status.conflicts.length > 0 && (
        <Section title={t('mobileSettings.conflictsSection')}>
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
        </Section>
      )}

      {/* With nothing to show, don't render the section at all (never make anyone read "none") */}
      {status && enabled && status.conflicts.length === 0 && (
        <EmptyState title={t('mobileSettings.noConflicts')} />
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
