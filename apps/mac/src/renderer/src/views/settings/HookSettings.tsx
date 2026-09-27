import { Page, Section } from '@design-system/react'
import { HookEditor } from '../../components/HookEditor.js'
import { HookHistory } from '../../components/HookHistory.js'
import { t } from '../../model/i18n/index.js'

export function HookSettings(): JSX.Element {
  return <Page title={t('hooks.title')}>
    <HookEditor />
    <Section title={t('hooks.history')}><HookHistory /></Section>
  </Page>
}
