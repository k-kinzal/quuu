import { Alert, ContentBlock, Spinner, Text } from '@design-system/react'
import { Group, GroupRow } from '../components/GroupedList.js'
import { Screen } from '../components/Screen.js'
import { relative } from '../lib/time.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'

/**
 * Settings. **There is nothing here to set.**
 *
 * The location is fixed, syncing starts on its own, and when the iCloud permission
 * lapses it asks again by itself. Nothing is left for a person to decide.
 *
 * This surface exists anyway because **syncing happens somewhere nobody can see**.
 * It shows two times and nothing else — **when the Mac wrote** and **when the iPhone
 * could read**. If only one is stale, that alone says which side is stuck.
 * No version numbers, no breakdowns.
 *
 * **No explanatory prose.** If the export never arrived, the time field reads `—`.
 * Reading that is enough (the same policy as on the Mac).
 */
export function SettingsView({ footer }: { footer: JSX.Element }): JSX.Element {
  const refresh = useStore((s) => s.refresh)
  const refreshing = useStore((s) => s.refreshing)
  const error = useStore((s) => s.error)
  const syncError = useStore((s) => s.syncError)
  const generatedAt = useStore((s) => s.view.generatedAt)
  const loadedAt = useStore((s) => s.loadedAt)

  return (
    <Screen title={t('settingsView.title')} large footer={footer}>
      <ContentBlock gap="none" placement="section">
        {(syncError || error) && (
          <ContentBlock gap="none" placement="groupNotice">
            <Alert tone="danger" title={t('settingsView.syncFailed')}>
              {syncError || error}
            </Alert>
          </ContentBlock>
        )}
        <Group title={t('settingsView.sync')}>
          <GroupRow trailing={<Stamp value={generatedAt} />}>
            <Text>{t('settingsView.macUpdated')}</Text>
          </GroupRow>
          <GroupRow trailing={<Stamp value={loadedAt} />}>
            <Text>{t('settingsView.phoneSynced')}</Text>
          </GroupRow>
          <GroupRow onPress={() => void refresh(true)} disabled={refreshing}>
            {refreshing ? (
              <Spinner label={t('settingsView.syncing')} />
            ) : (
              <Text tone="accent">{t('settingsView.resync')}</Text>
            )}
          </GroupRow>
        </Group>
      </ContentBlock>
    </Screen>
  )
}

function Stamp({ value }: { value: string }): JSX.Element {
  return (
    <Text size="sm" tone="tertiary">
      {value ? relative(value) : '—'}
    </Text>
  )
}
