import { Field, Page, Select } from '@design-system/react'
import type { AppSettings } from '../../../../preload/api/settings.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/** Settings > Appearance. One control doesn't get three stacked headings ("Appearance", "Theme", "Color scheme"). */
export function AppearanceSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)

  return (
    <Page title={t('appearanceSettings.title')}>
      <Field label={t('appearanceSettings.scheme')} width="sm">
        <Select<AppSettings['theme']>
          aria-label={t('appearanceSettings.scheme')}
          value={settings.theme}
          onChange={(e) => void setSettings({ theme: e.target.value })}
          options={[
            { value: 'dark', label: t('appearanceSettings.dark') },
            { value: 'light', label: t('appearanceSettings.light') },
            { value: 'system', label: t('appearanceSettings.system') }
          ]}
        />
      </Field>
    </Page>
  )
}
