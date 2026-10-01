import { Button, Checkbox, CheckboxGroup, Column, SettingRow, SettingToggle, SettingsGroup, SettingsBlock, FieldHint, ItemList, ItemRow, ListFrame, NumberInput, Row, Select, SegmentedControl, Text, TextArea, TextInput } from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { HookEvent, TaskHook } from '../../../api/schemas/hooks.js'
import type { Project } from '../../../api/schemas/projects.js'
import { t } from '../model/i18n/index.js'
import { queryClient } from '../state/queryClient.js'
import { useSettings, useStore } from '../state/store.js'

const EVENTS: HookEvent[] = ['created', 'queued', 'held', 'started', 'stopped', 'review', 'failed', 'beforeComplete', 'completed', 'reopened', 'archived', 'restored', 'deleted']

export function HookEditor({ project }: { project?: Project }): JSX.Element {
  const settings = useSettings()
  const setSettings = useStore(s => s.setSettings)
  const snapshot = useStore(s => s.snapshot)
  const [selected, select] = useState<string | null>(null)
  const definitions = project?.taskHooks ?? settings.taskHooks ?? []
  const effective = useQuery({ queryKey: ['hooks.resolve', project?.id, settings.taskHooks, project?.taskHooks],
    queryFn: () => window.quuu.hooks.resolve({ projectId: project?.id }), retry: false, networkMode: 'always' }, queryClient)
  const mutation = useMutation({ mutationKey: project ? ['projects', 'update'] : ['settings', 'set'], meta: { feedback: 'inline' }, mutationFn: async (next: TaskHook[]) => {
    if (project) await window.quuu.projects.update({ id: project.id, patch: { taskHooks: next } })
    else await setSettings({ taskHooks: next })
    await queryClient.invalidateQueries({ queryKey: ['hooks.resolve'] })
  }, networkMode: 'always' }, queryClient)
  const saving = mutation.isPending
  const save = (next: TaskHook[]): void => mutation.mutate(next)
  const update = (hook: TaskHook): void => {
    const found = definitions.some(item => item.id === hook.id)
    void save(found ? definitions.map(item => item.id === hook.id ? hook : item) : [...definitions, hook])
  }
  const add = (commit: boolean): void => {
    const id = crypto.randomUUID()
    void save([...definitions, { id, name: t(commit ? 'hooks.commitName' : 'hooks.newName'), enabled: false,
      ...(commit ? { kind: 'agent', events: ['stopped', 'beforeComplete'], prompt: t('hooks.commitPrompt') } as const : {}) }])
    select(id)
  }
  const hook = effective.data?.find(item => item.id === selected)
  const local = definitions.find(item => item.id === selected)
  const inherited = Boolean(project && settings.taskHooks?.some(item => item.id === selected))
  const field = <K extends keyof TaskHook>(key: K, value: TaskHook[K]): void => {
    if (!selected) return
    const next: TaskHook = { ...local, id: selected }
    if (value === undefined) delete next[key]
    else next[key] = value
    update(next)
  }
  const override = (key: keyof Omit<TaskHook, 'id'>, label: string): JSX.Element | null => inherited && hook ?
    <Checkbox label={t('hooks.override', { field: label })} checked={local?.[key] !== undefined} disabled={saving}
      onChange={on => field(key, on ? hook[key] : undefined)} /> : null
  const disabled = (key: keyof TaskHook): boolean => saving || (inherited && local?.[key] === undefined)
  return <>
  <SettingsGroup contained={false} title={t('hooks.title')} hint={t(project ? 'hooks.projectHint' : 'hooks.globalHint')}>
    <ListFrame bar={<>
      <Button size="xs" disabled={saving} onClick={() => add(false)}>{t('hooks.add')}</Button>
      <Button size="xs" disabled={saving} onClick={() => add(true)}>{t('hooks.addCommit')}</Button>
      {hook && <Button size="xs" disabled={saving || !local} onClick={() => { void save(definitions.filter(item => item.id !== hook.id)); select(null) }}>{t(inherited ? 'hooks.reset' : 'hooks.remove')}</Button>}
    </>}>
      <ItemList>
        {(effective.data ?? []).map(item => <ItemRow key={item.id} type="button" selected={selected === item.id}
          onClick={() => select(selected === item.id ? null : item.id)} aria-expanded={selected === item.id}>
          <Row grow min justify="between">
            <Text truncate>{item.name || item.id}</Text>
            <Text size="xs" tone="secondary">{t(item.enabled ? 'hooks.enabled' : 'hooks.disabled')}</Text>
          </Row>
        </ItemRow>)}
      </ItemList>
    </ListFrame>
    {(mutation.error || effective.error) && <FieldHint tone="danger">{mutation.error?.message || effective.error?.message}</FieldHint>}
    <SettingsBlock>
      <Row justify="between" gap="md" wrap>
        <Column gap="xs"><Text>{t('hooks.builtinReport')}</Text><FieldHint>{t('hooks.builtinHint')}</FieldHint></Column>
        <Button onClick={() => { useStore.getState().setSection({ kind: 'settings' }); useStore.getState().setSettingsCategory('report') }}>{t('hooks.reportSettings')}</Button>
      </Row>
    </SettingsBlock>
  </SettingsGroup>
    {hook && <SettingsGroup title={hook.name || hook.id}>
      <SettingRow label={t('hooks.name')} accessory={override('name', t('hooks.name'))}>
        <TextInput key={`${hook.id}:name:${hook.name}`} aria-label={t('hooks.name')} defaultValue={hook.name} disabled={disabled('name')} onBlur={e => { if (e.target.value !== hook.name) field('name', e.target.value) }} />
      </SettingRow>
      <SettingToggle accessory={override('enabled', t('hooks.activation'))} label={t('hooks.enabled')} checked={hook.enabled} disabled={disabled('enabled')} onChange={value => field('enabled', value)} />
      <SettingRow label={t('hooks.kind')} width="auto" accessory={override('kind', t('hooks.kind'))}>
        <SegmentedControl<'agent' | 'command'> label={t('hooks.kind')} value={hook.kind}
          options={[{ value: 'agent', label: t('hooks.agent'), disabled: disabled('kind') }, { value: 'command', label: t('hooks.command'), disabled: disabled('kind') }]}
          onChange={value => field('kind', value)} />
      </SettingRow>
      {hook.kind === 'agent' ? <>
        <SettingRow label={t('hooks.target')} accessory={inherited && <Checkbox label={t('hooks.override', { field: t('hooks.target') })} checked={local?.targetId !== undefined} disabled={saving}
            onChange={on => update(on ? { ...local, id: hook.id, targetKind: hook.targetKind, targetId: hook.targetId } : Object.fromEntries(Object.entries(local ?? { id: hook.id }).filter(([key]) => key !== 'targetKind' && key !== 'targetId')) as TaskHook)} />}>
          <Select aria-label={t('hooks.target')} value={hook.targetId ? `${hook.targetKind}:${hook.targetId}` : ''} disabled={disabled('targetId')}
            options={[{ value: '', label: t('reportSettings.unset') },
              ...(hook.targetId && !(hook.targetKind === 'group' ? snapshot?.groups : snapshot?.agents)?.some(item => item.id === hook.targetId) ? [{ value: `${hook.targetKind}:${hook.targetId}`, label: t('hooks.unavailable', { id: hook.targetId }) }] : []), ...(snapshot?.groups ?? []).map(group => ({ value: `group:${group.id}`, label: group.name })),
              ...(snapshot?.agents ?? []).filter(agent => (agent.enabled && agent.source === 'user') || agent.id === hook.targetId).map(agent => ({ value: `agent:${agent.id}`, label: agent.name }))]}
            onChange={e => { const [kind, id] = e.target.value.split(':'); update({ ...local, id: hook.id, targetKind: kind === 'group' ? 'group' : 'agent', targetId: id ?? '' }) }} />
        </SettingRow>
        <SettingRow label={t('hooks.prompt')} hint={t('hooks.literalHint')} width="full" layout="stacked" accessory={override('prompt', t('hooks.prompt'))}>
            <TextArea key={`${hook.id}:prompt:${hook.prompt}`} aria-label={t('hooks.prompt')} rows={6} defaultValue={hook.prompt} disabled={disabled('prompt')} onBlur={e => { if (e.target.value !== hook.prompt) field('prompt', e.target.value) }} />
        </SettingRow>
      </> : <SettingRow label={t('hooks.command')} hint={t('hooks.commandHint')} width="full" layout="stacked" accessory={override('command', t('hooks.command'))}>
        <TextArea key={`${hook.id}:command:${hook.command}`} aria-label={t('hooks.command')} rows={5} defaultValue={hook.command} disabled={disabled('command')} onBlur={e => { if (e.target.value !== hook.command) field('command', e.target.value) }} />
      </SettingRow>}
      <SettingRow label={t('hooks.events')} hint={t('hooks.eventHint')} width="full" layout="stacked" accessory={override('events', t('hooks.events'))}>
        <CheckboxGroup label={t('hooks.events')} options={EVENTS.map(event => ({ value: event, label: t(`hooks.eventsLabels.${event}`) }))}
          value={hook.events} disabled={disabled('events')} onChange={events => field('events', events)} />
      </SettingRow>
      <SettingRow width="xs" label={t('hooks.timeout')} accessory={override('timeoutSeconds', t('hooks.timeout'))}>
        <Row><NumberInput aria-label={t('hooks.timeout')} min={1} max={86400} value={hook.timeoutSeconds} disabled={disabled('timeoutSeconds')} onChange={value => field('timeoutSeconds', value)} /></Row>
      </SettingRow>
      {hook.enabled && (hook.events.length === 0 || (hook.kind === 'agent' && (!hook.targetId || !hook.prompt.trim())) || (hook.kind === 'command' && !hook.command.trim())) && <SettingsBlock><FieldHint tone="danger">{t('hooks.incomplete')}</FieldHint></SettingsBlock>}
    </SettingsGroup>}
  </>
}
