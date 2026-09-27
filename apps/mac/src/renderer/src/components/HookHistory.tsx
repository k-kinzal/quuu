import { buildTurns } from '../model/summarize.js'
import { SessionTurn } from './SessionTurn.js'
import { Button, CodeBlock, Column, Disclosure, DisclosureCaret, DisclosureDetail, DisclosureSummary, FieldHint, Row, Text } from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { HookRun } from '../../../api/schemas/hooks.js'
import { t } from '../model/i18n/index.js'
import { queryClient } from '../state/queryClient.js'

export function HookHistory({ taskId, projectId, active = true }: { taskId?: string; projectId?: string; active?: boolean }): JSX.Element {
  const runs = useQuery({ queryKey: ['hooks.list', taskId, projectId], queryFn: () => window.quuu.hooks.list({ taskId, projectId, limit: 100 }),
    enabled: active, refetchInterval: active ? 2000 : false, retry: false, networkMode: 'always' }, queryClient)
  const report = useQuery({ queryKey: ['hooks.report', taskId], queryFn: () => window.quuu.report.get(taskId!),
    enabled: active && Boolean(taskId), refetchInterval: active && taskId ? 2000 : false, retry: false, networkMode: 'always' }, queryClient)
  return <Column gap="sm">
    {runs.error && <FieldHint tone="danger">{runs.error.message}</FieldHint>}
    {(runs.data ?? []).map(run => <HookEntry key={run.id} run={run} active={active} />)}
    {report.data && <Row gap="sm">
      <Text>{t('hooks.builtinReport')} · {t(report.data.status === 'generating' ? 'hooks.status.running' : report.data.status === 'ready' ? 'hooks.status.succeeded' : 'hooks.status.failed')}</Text>
      <Button size="xs" onClick={() => void window.quuu.system.reveal(report.data!.logPath)}>{t('hooks.openLog')}</Button>
    </Row>}
  </Column>
}
function HookEntry({ run, active }: { run: HookRun; active: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const running = ['queued', 'starting', 'running'].includes(run.status)
  const log = useQuery({ queryKey: ['hooks.log', run.id], queryFn: () => window.quuu.hooks.log(run.id), enabled: open && active,
    refetchInterval: open && active && running ? 1000 : false, retry: false, networkMode: 'always' }, queryClient)
  const action = useMutation({ mutationKey: ['hooks', running ? 'cancel' : 'retry'], meta: { feedback: 'inline' }, mutationFn: async () => { if (running) await window.quuu.hooks.cancel(run.id); else await window.quuu.hooks.retry(run.id) },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['hooks.list'] }); await queryClient.invalidateQueries({ queryKey: ['hooks.log', run.id] }) }, networkMode: 'always' }, queryClient)
  return <Disclosure>
    <DisclosureSummary type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      <DisclosureCaret open={open} /><Text>{t('hooks.execution', { name: run.name })} · {t(`hooks.status.${run.status}`)}</Text>
    </DisclosureSummary>
    {open && <DisclosureDetail><Column gap="sm">
      <Text tone="secondary">{run.taskTitle} · {t(`hooks.eventsLabels.${run.event}`)} · {new Date(run.createdAt).toLocaleString()}</Text>
      <Text selectable>{run.cwd}</Text>
      <Text>{t(run.kind === 'agent' ? 'hooks.prompt' : 'hooks.command')}</Text><CodeBlock>{run.input}</CodeBlock>
      {run.error && <FieldHint tone="danger">{run.error}</FieldHint>}
      <Text>{t('hooks.output')}</Text>
      {log.data?.messages.length ? buildTurns(log.data.messages).map(turn => <SessionTurn key={turn.id} turn={turn} cwd={run.cwd} />) : <CodeBlock>{log.data?.output || t('hooks.waitingOutput')}</CodeBlock>}
      {(log.error || action.error) && <FieldHint tone="danger">{log.error?.message || action.error?.message}</FieldHint>}
      <Row gap="sm">
        <Button size="xs" disabled={action.isPending} onClick={() => action.mutate()}>{t(running ? 'hooks.cancel' : 'hooks.retry')}</Button>
        <Button size="xs" onClick={() => void window.quuu.system.reveal(run.logPath)}>{t('hooks.openLog')}</Button>
      </Row>
    </Column></DisclosureDetail>}
  </Disclosure>
}
