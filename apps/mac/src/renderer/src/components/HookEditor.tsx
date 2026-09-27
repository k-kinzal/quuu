import { Button, Checkbox, Column, Field, FieldHint, ListFrame, NumberInput, Row, Section, Select, Text, TextArea, TextInput } from '@design-system/react'
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
  return <Section title={t('hooks.title')}>
    <FieldHint>{t(project ? 'hooks.projectHint' : 'hooks.globalHint')}</FieldHint>
    <ListFrame bar={<>
      <Button size="xs" disabled={saving} onClick={() => add(false)}>{t('hooks.add')}</Button>
      <Button size="xs" disabled={saving} onClick={() => add(true)}>{t('hooks.addCommit')}</Button>
      {hook && <Button size="xs" disabled={saving || !local} onClick={() => { void save(definitions.filter(item => item.id !== hook.id)); select(null) }}>{t(inherited ? 'hooks.reset' : 'hooks.remove')}</Button>}
    </>} pad>
      <Column gap="sm">
        {(effective.data ?? []).map(item => <Button key={item.id} size="sm" onClick={() => select(item.id)}>
          {item.name || item.id} · {t(item.enabled ? 'hooks.enabled' : 'hooks.disabled')}
        </Button>)}
        <Text tone="secondary">{t('hooks.builtinReport')}</Text>
        <FieldHint>{t('hooks.builtinHint')}</FieldHint>
        <Button size="xs" onClick={() => { useStore.getState().setSection({ kind: 'settings' }); useStore.getState().setSettingsCategory('report') }}>{t('hooks.reportSettings')}</Button>
      </Column>
    </ListFrame>
    {(mutation.error || effective.error) && <FieldHint tone="danger">{mutation.error?.message || effective.error?.message}</FieldHint>}
    {hook && <Column gap="md">
      <Field label={t('hooks.name')}>
        {override('name', t('hooks.name'))}
        <TextInput key={`${hook.id}:name:${hook.name}`} aria-label={t('hooks.name')} defaultValue={hook.name} disabled={disabled('name')} onBlur={e => { if (e.target.value !== hook.name) field('name', e.target.value) }} />
      </Field>
      {override('enabled', t('hooks.activation'))}
      <Checkbox label={t('hooks.enabled')} checked={hook.enabled} disabled={disabled('enabled')} onChange={value => field('enabled', value)} />
      <Field label={t('hooks.kind')}>
        {override('kind', t('hooks.kind'))}
        <Select aria-label={t('hooks.kind')} value={hook.kind} disabled={disabled('kind')} options={[{ value: 'agent', label: t('hooks.agent') }, { value: 'command', label: t('hooks.command') }]}
          onChange={e => field('kind', e.target.value === 'command' ? 'command' : 'agent')} />
      </Field>
      {hook.kind === 'agent' ? <>
        <Field label={t('hooks.target')}>
          {inherited && <Checkbox label={t('hooks.override', { field: t('hooks.target') })} checked={local?.targetId !== undefined} disabled={saving}
            onChange={on => update(on ? { ...local, id: hook.id, targetKind: hook.targetKind, targetId: hook.targetId } : Object.fromEntries(Object.entries(local ?? { id: hook.id }).filter(([key]) => key !== 'targetKind' && key !== 'targetId')) as TaskHook)} />}
          <Select aria-label={t('hooks.target')} value={hook.targetId ? `${hook.targetKind}:${hook.targetId}` : ''} disabled={disabled('targetId')}
            options={[{ value: '', label: t('reportSettings.unset') },
              ...(hook.targetId && !(hook.targetKind === 'group' ? snapshot?.groups : snapshot?.agents)?.some(item => item.id === hook.targetId) ? [{ value: `${hook.targetKind}:${hook.targetId}`, label: t('hooks.unavailable', { id: hook.targetId }) }] : []), ...(snapshot?.groups ?? []).map(group => ({ value: `group:${group.id}`, label: group.name })),
              ...(snapshot?.agents ?? []).filter(agent => (agent.enabled && agent.source === 'user') || agent.id === hook.targetId).map(agent => ({ value: `agent:${agent.id}`, label: agent.name }))]}
            onChange={e => { const [kind, id] = e.target.value.split(':'); update({ ...local, id: hook.id, targetKind: kind === 'group' ? 'group' : 'agent', targetId: id ?? '' }) }} />
        </Field>
        <Field label={t('hooks.prompt')} width="full">
          {override('prompt', t('hooks.prompt'))}
          <TextArea key={`${hook.id}:prompt:${hook.prompt}`} aria-label={t('hooks.prompt')} rows={6} defaultValue={hook.prompt} disabled={disabled('prompt')} onBlur={e => { if (e.target.value !== hook.prompt) field('prompt', e.target.value) }} />
          <FieldHint>{t('hooks.literalHint')}</FieldHint>
        </Field>
      </> : <Field label={t('hooks.command')} width="full">
        {override('command', t('hooks.command'))}
        <TextArea key={`${hook.id}:command:${hook.command}`} aria-label={t('hooks.command')} rows={5} defaultValue={hook.command} disabled={disabled('command')} onBlur={e => { if (e.target.value !== hook.command) field('command', e.target.value) }} />
        <FieldHint>{t('hooks.commandHint')}</FieldHint>
      </Field>}
      <Field label={t('hooks.events')} width="full">
        {override('events', t('hooks.events'))}
        <Row gap="sm" wrap>{EVENTS.map(event => <Checkbox key={event} label={t(`hooks.eventsLabels.${event}`)} checked={hook.events.includes(event)} disabled={disabled('events')}
          onChange={checked => field('events', checked ? [...hook.events, event] : hook.events.filter(item => item !== event))} />)}</Row>
        <FieldHint>{t('hooks.eventHint')}</FieldHint>
      </Field>
      <Field label={t('hooks.timeout')}>
        {override('timeoutSeconds', t('hooks.timeout'))}
        <Row><NumberInput aria-label={t('hooks.timeout')} min={1} max={86400} value={hook.timeoutSeconds} disabled={disabled('timeoutSeconds')} onChange={value => field('timeoutSeconds', value)} /></Row>
      </Field>
      {hook.enabled && (hook.events.length === 0 || (hook.kind === 'agent' && (!hook.targetId || !hook.prompt.trim())) || (hook.kind === 'command' && !hook.command.trim())) && <FieldHint tone="danger">{t('hooks.incomplete')}</FieldHint>}
    </Column>}
  </Section>
}
