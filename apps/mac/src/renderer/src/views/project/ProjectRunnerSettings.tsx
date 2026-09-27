import { Button, Checkbox, Field, FieldHint, Row, Section, TextInput } from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { Project } from '../../../../api/types.js'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'

export function ProjectRunnerSettings({ project }: { project: Project }): JSX.Element | null {
  const [remote, setRemote] = useState(project.gitRemote ?? '')
  const save = useMutation({ mutationFn: (patch: { gitRemote?: string; runnerEnabled?: boolean }) =>
    window.quuu.projects.update({ id: project.id, patch }), onSuccess: updated => setRemote(updated.gitRemote ?? '') }, queryClient)
  if (project.builtIn) return null
  return <Section title={t('runnerSettings.title')}>
    <Checkbox label={t('runnerSettings.allowProject')} checked={project.runnerEnabled ?? false} disabled={save.isPending}
      onChange={enabled => save.mutate({ runnerEnabled: enabled, gitRemote: remote })} />
    <FieldHint>{t('runnerSettings.projectHint')}</FieldHint>
    <Field label={t('runnerSettings.repository')} width="full">
      <Row>
        <TextInput aria-label={t('runnerSettings.repository')} value={remote} onChange={event => setRemote(event.target.value)} placeholder={t('runnerSettings.detectRemote')} />
        <Button disabled={save.isPending} onClick={() => save.mutate({ gitRemote: remote })}>{t('runnerSettings.saveRemote')}</Button>
      </Row>
    </Field>
    {save.error && <FieldHint tone="danger">{save.error.message}</FieldHint>}
  </Section>
}
