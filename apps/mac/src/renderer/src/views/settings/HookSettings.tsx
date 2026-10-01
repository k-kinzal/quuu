import { Page, SettingsGroup } from '@design-system/react'
import { HookEditor } from '../../components/HookEditor.js'
import { HookHistory } from '../../components/HookHistory.js'
import { t } from '../../model/i18n/index.js'

export function HookSettings(): JSX.Element {
  return <Page title={t('hooks.title')}>
    <HookEditor />
    <SettingsGroup contained={false} title={t('hooks.history')}><HookHistory /></SettingsGroup>
  </Page>
}
