import { Button, Page, SettingRow, SettingsGroup } from '@design-system/react'
import { PullRequestPromptFields } from '../../components/PullRequestPromptFields.js'
import { useGitHubWebSignIn } from '../../interaction/useGitHubWebSignIn.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > Pull Requests.
 *
 * What a task is told when its run ends and the Pull Request it produced is not in order. Three
 * states, three prompts, each switched on by itself and sent exactly as written: what "fix the
 * CI" should mean - re-run, read the log, wait it out - differs per project and is still being
 * found out. A project can answer differently from its own settings.
 *
 * Also the sign-in of the GitHub pages Quuu shows. It is kept across restarts, so it is made
 * here once rather than on each page.
 */
export function PullRequestSettings(): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const github = useGitHubWebSignIn()
  return (
    <Page title={t('pullRequestSettings.title')}>
      <SettingsGroup title={t('githubWeb.section')}>
        <SettingRow label={github.signedIn
          ? github.login ? t('githubWeb.signedInAs', { login: github.login }) : t('githubWeb.signedIn')
          : t('githubWeb.signedOut')} hint={t('githubWeb.hint')} width="auto">
          {github.signedIn
            ? <Button size="xs" disabled={github.busy} onClick={github.signOut}>{t('githubWeb.signOut')}</Button>
            : <Button size="xs" disabled={github.busy || github.signedIn === null} onClick={github.signIn}>{t('githubWeb.signIn')}</Button>}
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup contained={false} title={t('pullRequestSettings.promptsSection')}>
        <PullRequestPromptFields id="app" values={settings} controlled onChange={(patch) => void setSettings(patch)} />
      </SettingsGroup>
    </Page>
  )
}
