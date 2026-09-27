import { Page, Section } from '@design-system/react'
import { PullRequestPromptFields } from '../../components/PullRequestPromptFields.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > Pull Requests.
 *
 * What a task is told when its run ends and the Pull Request it produced is not in order. Three
 * states, three prompts, each switched on by itself and sent exactly as written: what "fix the
 * CI" should mean - re-run, read the log, wait it out - differs per project and is still being
 * found out. A project can answer differently from its own settings.
 */
export function PullRequestSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  return (
    <Page title={t('pullRequestSettings.title')}>
      <Section title={t('pullRequestSettings.promptsSection')}>
        <PullRequestPromptFields id="app" values={settings} controlled onChange={(patch) => void setSettings(patch)} />
      </Section>
    </Page>
  )
}
