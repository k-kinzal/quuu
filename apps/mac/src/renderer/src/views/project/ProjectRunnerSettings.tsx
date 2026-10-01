import { Button, Dialog, DialogActions, DialogContent, DialogTitle, SettingToggle, SettingRow, FieldHint, InputAction, SettingsBlock, SettingsGroup, TextInput } from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { Project, ProjectInput } from '../../../../api/types.js'
import { t } from '../../model/i18n/index.js'
import { queryClient } from '../../state/queryClient.js'

export function ProjectRunnerSettings({ project }: { project: Project }): JSX.Element | null {
  const [remote, setRemote] = useState(project.gitRemote ?? '')
  const [labels, setLabels] = useState((project.runnerLabels ?? []).join(', '))
  const [setup, setSetup] = useState(false)
  const setupTitle = useId()
  const save = useMutation({ mutationFn: (patch: Partial<ProjectInput>) =>
    window.quuu.projects.update({ id: project.id, patch }) }, queryClient)
  const selectedLabels = (): string[] => [...new Set(labels.split(',').map(label => label.trim()).filter(Boolean))]
  if (project.builtIn) return null
  return <SettingsGroup title={t('runnerSettings.title')}>
    <SettingToggle label={t('runnerSettings.allowProject')} hint={t('runnerSettings.projectHint')} checked={project.runnerEnabled ?? false} disabled={save.isPending}
      onChange={enabled => {
        if (enabled && !project.gitRemote?.trim()) { save.reset(); setSetup(true) }
        else save.mutate({ runnerEnabled: enabled })
      }}>
      <SettingRow label={t('runnerSettings.requiredLabels')} hint={t('runnerSettings.labelsHint')} width="full" layout="stacked">
        <InputAction>
          <TextInput aria-label={t('runnerSettings.requiredLabels')} value={labels} onChange={event => setLabels(event.target.value)} placeholder={t('runnerSettings.labelsPlaceholder')} />
          <Button disabled={save.isPending} onClick={() => save.mutate({ runnerLabels: selectedLabels() })}>{t('runnerSettings.saveLabels')}</Button>
        </InputAction>
      </SettingRow>
      <SettingRow label={t('runnerSettings.repository')} width="full" layout="stacked">
        <InputAction>
          <TextInput aria-label={t('runnerSettings.repository')} value={remote} onChange={event => setRemote(event.target.value)} placeholder={t('runnerSettings.detectRemote')} />
          <Button disabled={save.isPending} onClick={() => save.mutate({ gitRemote: remote })}>{t('runnerSettings.saveRemote')}</Button>
        </InputAction>
      </SettingRow>
    </SettingToggle>
    {save.error && <SettingsBlock><FieldHint tone="danger">{save.error.message}</FieldHint></SettingsBlock>}
    <Dialog open={setup} onClose={() => { if (!save.isPending) setSetup(false) }} aria-labelledby={setupTitle} fullWidth maxWidth="sm">
      <DialogTitle id={setupTitle}>{t('runnerSettings.setupTitle')}</DialogTitle>
      <DialogContent>
        <SettingsGroup hint={t('runnerSettings.setupHint')}>
          <SettingRow label={t('runnerSettings.repository')} layout="stacked">
            <TextInput value={remote} disabled={save.isPending} onChange={event => setRemote(event.target.value)} placeholder={t('runnerSettings.detectRemote')} />
          </SettingRow>
          <SettingRow label={t('runnerSettings.requiredLabels')} hint={t('runnerSettings.labelsHint')} layout="stacked">
            <TextInput value={labels} disabled={save.isPending} onChange={event => setLabels(event.target.value)} placeholder={t('runnerSettings.labelsPlaceholder')} />
          </SettingRow>
          {save.error && <SettingsBlock><FieldHint tone="danger">{save.error.message}</FieldHint></SettingsBlock>}
        </SettingsGroup>
      </DialogContent>
      <DialogActions>
        <Button disabled={save.isPending} onClick={() => setSetup(false)}>{t('runnerSettings.cancelSetup')}</Button>
        <Button color="primary" disabled={save.isPending} onClick={() => save.mutate({ runnerEnabled: true, gitRemote: remote, runnerLabels: selectedLabels() }, { onSuccess: () => setSetup(false) })}>{t('runnerSettings.saveAndEnable')}</Button>
      </DialogActions>
    </Dialog>
  </SettingsGroup>
}
