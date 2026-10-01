import { FieldHint, SettingsBlock, SettingToggle, SettingsGroup, TextArea } from '@design-system/react'
import { t } from '../model/i18n/index.js'
import { PULL_REQUEST_PROMPT_KINDS, PULL_REQUEST_PROMPT_VARIABLE_TEXT } from '../model/pullRequestPrompts.js'

type Kind = (typeof PULL_REQUEST_PROMPT_KINDS)[number]
export type PullRequestPromptValues = { [K in Kind['prompt']]: string } & { [K in Kind['enabled']]: boolean }

/**
 * The three Pull Request prompts, each with its own switch.
 *
 * A switch apart from the text: not every project wants all three, and turning one off should not
 * cost what was written. The text box is revealed only while on, preserving its draft while
 * hidden. `controlled` is off for a project, whose fields must not hold a value mid-typing
 * (`ProjectDetail`), and on for the app settings, which write through as they change.
 */
export function PullRequestPromptFields({ id, values, controlled, onChange }: {
  id: string
  values: PullRequestPromptValues
  controlled: boolean
  onChange(patch: Partial<PullRequestPromptValues>): void
}): JSX.Element {
  return (
    <>
      {PULL_REQUEST_PROMPT_KINDS.map(({ kind, prompt, enabled }) => (
        <SettingsGroup key={kind}>
          <SettingToggle
            label={t(`pullRequestSettings.${kind}`)}
            checked={values[enabled]}
            onChange={(v: boolean) => onChange({ [enabled]: v })}
          >
            <SettingsBlock><TextArea
              key={`${id}-${kind}`}
              rows={3}
              aria-label={t(`pullRequestSettings.${kind}`)}
              placeholder={t('pullRequestSettings.promptPlaceholder')}
              disabled={!values[enabled]}
              {...(controlled ? { value: values[prompt] } : { defaultValue: values[prompt] })}
              onChange={(e) => onChange({ [prompt]: e.target.value })}
            /></SettingsBlock>
          </SettingToggle>
        </SettingsGroup>
      ))}
      {PULL_REQUEST_PROMPT_KINDS.some(({ enabled }) => values[enabled]) && <FieldHint>{t('pullRequestSettings.variables', { names: PULL_REQUEST_PROMPT_VARIABLE_TEXT })}</FieldHint>}
    </>
  )
}
