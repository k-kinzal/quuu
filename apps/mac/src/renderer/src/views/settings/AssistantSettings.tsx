import { Alert, Button, Column, NumberInput, Page, Row, SettingRow, SettingsBlock, SettingsGroup, SettingToggle, Spacer, Text, TextArea } from '@design-system/react'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { AssistantSettings as Settings } from '../../../../api/schemas/assistant.js'
import { confirmDestructive } from '../../interaction/contextMenu.js'
import { t } from '../../model/i18n/index.js'
import { failureReason } from '../../model/operationFailure.js'
import { queryClient } from '../../state/queryClient.js'
import { newTaskDraftKey, taskDraftKey } from '../../state/drafts.js'
import { useStore } from '../../state/store.js'

export function AssistantSettings(): JSX.Element {
  const [memoryVersion, setMemoryVersion] = useState(0)
  const savingMemory = useIsMutating({ mutationKey: ['assistant', 'setMemory'] }, queryClient) > 0
  const state = useStore(s => s.snapshot?.assistant)
  const query = useQuery({ queryKey: ['assistant.settings'], queryFn: () => window.quuu.assistant.state(), enabled: !state }, queryClient)
  const settings = state?.settings ?? query.data?.settings
  const configure = useMutation({ mutationFn: (patch: Partial<Settings>) => window.quuu.assistant.configure(patch, { context: { feedback: 'inline' } }) }, queryClient)
  const reset = useMutation({
    mutationKey: ['assistant', 'reset'], meta: { feedback: 'inline' },
    mutationFn: async () => {
      if (!await confirmDestructive(t('quuuAI.resetConfirm'), t('quuuAI.resetDetail'), t('quuuAI.resetAction'))) return null
      return window.quuu.assistant.reset(undefined, { context: { feedback: 'inline' } })
    },
    onSuccess: async ids => {
      if (!ids) return
      const store = useStore.getState()
      store.setDraft('assistant-channel', '')
      const project = store.snapshot?.projects.find(project => project.builtIn)
      if (project) store.setDraft(newTaskDraftKey(project.id), '')
      for (const id of ids) store.setDraft(taskDraftKey(id), '')
      if (store.cursorTaskId && ids.includes(store.cursorTaskId)) store.closeDetail()
      await queryClient.cancelQueries({ queryKey: ['assistant.memory'] })
      queryClient.removeQueries({ queryKey: ['assistant.memory'] })
      setMemoryVersion(version => version + 1)
    }
  }, queryClient)
  return <Page title={t('quuuAI.settings')}>
    <SettingsGroup>
      {settings && <SettingToggle label={t('quuuAI.proactive')} hint={t('quuuAI.proactiveHint')} checked={settings.enabled}
        onChange={value => configure.mutate({ enabled: value })}>
        <SettingRow label={t('quuuAI.interval')} width="xs"><NumberInput min={1} max={168} value={settings.intervalHours} unit={t('quuuAI.hours')}
          onChange={value => configure.mutate({ intervalHours: value })} /></SettingRow>
        <SettingRow label={t('quuuAI.threshold')} hint={t('quuuAI.thresholdHint')} width="xs"><NumberInput min={70} max={100} value={settings.confidenceThreshold} unit="%"
          onChange={value => configure.mutate({ confidenceThreshold: value })} /></SettingRow>
      </SettingToggle>}
      {configure.error && <Alert>{failureReason(configure.error)}</Alert>}
      {(state?.error || query.error) && <Alert>{state?.error ?? failureReason(query.error)}</Alert>}
    </SettingsGroup>
    <MemoryEditor key={memoryVersion} disabled={reset.isPending} />
    <SettingsGroup>
      <SettingsBlock><Row justify="between" wrap>
        <Text tone="secondary">{t('quuuAI.resetHint')}</Text>
        <Button variant="ghost" color="error" loading={reset.isPending} disabled={reset.isPending || savingMemory} onClick={() => reset.mutate()}>{t('quuuAI.reset')}</Button>
      </Row></SettingsBlock>
      {reset.error && <SettingsBlock><Alert>{failureReason(reset.error)}</Alert></SettingsBlock>}
      {reset.isSuccess && reset.data && <SettingsBlock><Text tone="secondary" role="status">{t('quuuAI.resetDone')}</Text></SettingsBlock>}
    </SettingsGroup>
  </Page>
}

function MemoryEditor({ disabled }: { disabled: boolean }): JSX.Element {
  const memory = useQuery({ queryKey: ['assistant.memory'], queryFn: () => window.quuu.assistant.memory(), refetchOnWindowFocus: false }, queryClient)
  const [draft, setDraft] = useState<{ content: string; revision: string } | null>(null)
  const save = useMutation({ mutationKey: ['assistant', 'setMemory'], mutationFn: (input: { content: string; revision: string }) => window.quuu.assistant.setMemory(input, { context: { feedback: 'inline' } }),
    onSuccess: value => { queryClient.setQueryData(['assistant.memory'], value); setDraft(null) } }, queryClient)
  const content = draft?.content ?? memory.data?.content ?? ''
  const bytes = new TextEncoder().encode(content).length
  return <SettingsGroup title={t('quuuAI.memory')}>
    <SettingRow label="MEMORY.md" hint={t('quuuAI.memoryHint')} width="full" layout="stacked">
      <TextArea rows={12} value={content} disabled={disabled || !memory.data || save.isPending} onChange={event => {
        if (memory.data) setDraft({ content: event.target.value, revision: draft?.revision ?? memory.data.revision })
      }} />
    </SettingRow>
    <SettingsBlock><Column gap="md"><Row wrap>
      <Text size="xs" tone={bytes > (memory.data?.maxBytes ?? 16384) ? 'danger' : 'tertiary'}>{t('quuuAI.memorySize', { bytes, max: memory.data?.maxBytes ?? 16384 })}</Text>
      <Spacer />
      <Button variant="ghost" disabled={disabled || memory.isFetching || save.isPending} onClick={() => { setDraft(null); save.reset(); void memory.refetch() }}>{t('quuuAI.reloadMemory')}</Button>
      <Button loading={save.isPending} disabled={disabled || !draft || save.isPending || bytes > (memory.data?.maxBytes ?? 16384)} onClick={() => { if (draft) save.mutate(draft) }}>{t('quuuAI.saveMemory')}</Button>
    </Row>
    {(save.error || memory.error) && <Alert>{failureReason(save.error ?? memory.error)}</Alert>}
    </Column></SettingsBlock>
  </SettingsGroup>
}
