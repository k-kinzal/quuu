import { SettingRow, SettingsGroup, Page, SegmentedControl } from '@design-system/react'
import type { AppSettings } from '../../../../api/schemas/settings.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/** Settings > Appearance. One control doesn't get three stacked headings ("Appearance", "Theme", "Color scheme"). */
export function AppearanceSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)

  return (
    <Page title={t('appearanceSettings.title')}>
      <SettingsGroup>
      <SettingRow label={t('appearanceSettings.scheme')} width="auto">
        <SegmentedControl<AppSettings['theme']>
          label={t('appearanceSettings.scheme')}
          value={settings.theme}
          onChange={(theme) => void setSettings({ theme })}
          options={[
            { value: 'dark', label: t('appearanceSettings.dark') },
            { value: 'light', label: t('appearanceSettings.light') },
            { value: 'system', label: t('appearanceSettings.system') }
          ]}
        />
      </SettingRow>
      </SettingsGroup>
    </Page>
  )
}
