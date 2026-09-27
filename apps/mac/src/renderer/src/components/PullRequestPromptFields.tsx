import { Checkbox, Field, FieldHint, TextArea } from '@design-system/react'
import { t } from '../model/i18n/index.js'
import { PULL_REQUEST_PROMPT_KINDS, PULL_REQUEST_PROMPT_VARIABLE_TEXT } from '../model/pullRequestPrompts.js'

type Kind = (typeof PULL_REQUEST_PROMPT_KINDS)[number]
export type PullRequestPromptValues = { [K in Kind['prompt']]: string } & { [K in Kind['enabled']]: boolean }

/**
 * The three Pull Request prompts, each with its own switch.
 *
 * A switch apart from the text: not every project wants all three, and turning one off should not
 * cost what was written. The text box stays readable while off, so what would be sent is never a
 * mystery. `controlled` is off for a project, whose fields must not hold a value mid-typing
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
        <Field key={kind} label={t(`pullRequestSettings.${kind}`)} width="full">
          <Checkbox
            label={t('pullRequestSettings.send')}
            checked={values[enabled]}
            onChange={(v: boolean) => onChange({ [enabled]: v })}
          />
          <TextArea
            key={`${id}-${kind}`}
            rows={3}
            aria-label={t(`pullRequestSettings.${kind}`)}
            placeholder={t('pullRequestSettings.promptPlaceholder')}
            disabled={!values[enabled]}
            {...(controlled ? { value: values[prompt] } : { defaultValue: values[prompt] })}
            onChange={(e) => onChange({ [prompt]: e.target.value })}
          />
        </Field>
      ))}
      <FieldHint>{t('pullRequestSettings.variables', { names: PULL_REQUEST_PROMPT_VARIABLE_TEXT })}</FieldHint>
    </>
  )
}
