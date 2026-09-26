import { Field, Page, Section, TextArea } from '@design-system/react'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > Pull Requests.
 *
 * What a task is told when its run ends and the Pull Request it produced is not in order. Three
 * states, three prompts, each off while empty: the words are the person's, because what "fix
 * the CI" should mean - re-run, read the log, wait it out - differs per project and is still
 * being found out. A project can answer differently from its own settings.
 */
export function PullRequestSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  return (
    <Page title={t('pullRequestSettings.title')}>
      <Section title={t('pullRequestSettings.promptsSection')}>
        <Field label={t('pullRequestSettings.failure')} width="full">
          <TextArea
            rows={4}
            placeholder={t('pullRequestSettings.failurePlaceholder')}
            value={settings.pullRequestFailurePrompt}
            onChange={(e) => void setSettings({ pullRequestFailurePrompt: e.target.value })}
          />
        </Field>
        <Field label={t('pullRequestSettings.pending')} width="full">
          <TextArea
            rows={4}
            placeholder={t('pullRequestSettings.pendingPlaceholder')}
            value={settings.pullRequestPendingPrompt}
            onChange={(e) => void setSettings({ pullRequestPendingPrompt: e.target.value })}
          />
        </Field>
        <Field label={t('pullRequestSettings.conflict')} width="full">
          <TextArea
            rows={4}
            placeholder={t('pullRequestSettings.conflictPlaceholder')}
            value={settings.pullRequestConflictPrompt}
            onChange={(e) => void setSettings({ pullRequestConflictPrompt: e.target.value })}
          />
        </Field>
      </Section>
    </Page>
  )
}
