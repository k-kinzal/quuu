import { Button, Column, FieldHint, Reveal, Row, Text, TranscriptCode, TranscriptDetailSection, TranscriptInterlude, TranscriptToolDetail, TranscriptToolEntry, TranscriptToolLine, TranscriptToolVerb, TranscriptTurnHead, TranscriptTurnRole, conversationBlock } from '@design-system/react'
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import type { HookRun } from '../../../api/schemas/hooks.js'
import type { TaskReport } from '../../../api/schemas/report.js'
import { useHookHistory } from '../interaction/useHookHistory.js'
import { clockOrDate, duration } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { queryClient } from '../state/queryClient.js'
import { HookStatus } from '../ui/HookStatus.js'
import { HookConversation } from './HookConversation.js'

export function HookHistory(): JSX.Element | null {
  const history = useHookHistory({})
  return <HookTranscript history={history} showTask />
}

export function HookTranscript({ history, active = true, showTask = false }: {
  history: ReturnType<typeof useHookHistory>; active?: boolean; showTask?: boolean
}): JSX.Element | null {
  const id = useId()
  const entries = [
    ...(history.runs ?? []).map(run => ({ id: run.id, at: run.createdAt, body: <HookEntry run={run} active={active} showTask={showTask} /> })),
    ...(history.report ? [{ id: `report:${history.report.startedAt}`, at: history.report.startedAt, body: <ReportEntry report={history.report} active={active} /> }] : [])
  ].sort((a, b) => showTask ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at))
  if (!entries.length && !history.error) return null
  return <TranscriptInterlude aria-labelledby={id}>
    <TranscriptTurnHead><TranscriptTurnRole id={id}>{t('hooks.activity')}</TranscriptTurnRole></TranscriptTurnHead>
    {history.error && <FieldHint tone="danger">{history.error.message}</FieldHint>}
    {entries.map(entry => <div key={entry.id} {...conversationBlock(`hook:${entry.id}`)}>{entry.body}</div>)}
  </TranscriptInterlude>
}

function ExecutionEntry({ name, kind, status, open, onToggle, children }: {
  name: string; kind: string; status: HookRun['status']; open: boolean; onToggle(): void; children: () => ReactNode
}): JSX.Element {
  const id = useId()
  return <TranscriptToolEntry open={open}>
    <TranscriptToolLine type="button" targetKind="text" outcome={status === 'failed' ? 'error' : 'ok'}
      aria-expanded={open} aria-controls={id} onClick={onToggle} title={name}>
      <TranscriptToolVerb>{kind}</TranscriptToolVerb>
      <span data-target>{name}</span>
      <HookStatus status={status} />
    </TranscriptToolLine>
    <Reveal open={open}>{() => <TranscriptToolDetail id={id}>{children()}</TranscriptToolDetail>}</Reveal>
  </TranscriptToolEntry>
}

function ExecutionTime({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }): JSX.Element {
  return <Text size="xs" tone="tertiary" tabular title={new Date(startedAt).toLocaleString()}>
    {clockOrDate(startedAt)}{endedAt && ` · ${duration(startedAt, endedAt)}`}
  </Text>
}

function HookEntry({ run, active, showTask }: { run: HookRun; active: boolean; showTask: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const running = ['queued', 'starting', 'running'].includes(run.status)
  const action = useMutation({ mutationKey: ['hooks', running ? 'cancel' : 'retry'], meta: { feedback: 'inline' }, mutationFn: async () => { if (running) await window.quuu.hooks.cancel(run.id); else await window.quuu.hooks.retry(run.id) },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['hooks.list'] }); await queryClient.invalidateQueries({ queryKey: ['hooks', 'conversation', run.id] }) }, networkMode: 'always' }, queryClient)
  return <ExecutionEntry name={run.name} kind={t(run.kind === 'agent' ? 'hooks.agentShort' : 'hooks.commandShort')} status={run.status} open={open} onToggle={() => setOpen(!open)}>
    {() => <>
      <TranscriptDetailSection><Column gap="sm">
        <Row gap="sm" wrap>
          <Text size="xs" tone="secondary">{t(`hooks.eventsLabels.${run.event}`)}</Text>
          <ExecutionTime startedAt={run.startedAt ?? run.createdAt} endedAt={run.endedAt} />
        </Row>
        {showTask && <Text size="sm" tone="secondary" selectable>{run.taskTitle}</Text>}
        <Text size="xs" tone="tertiary" mono truncate="start" title={run.cwd} selectable>{run.cwd}</Text>
        {run.error && <FieldHint tone="danger">{run.error}</FieldHint>}
      </Column></TranscriptDetailSection>
      {run.kind === 'command' && <TranscriptCode label={t('hooks.command')} code={run.input} language="sh" />}
      <HookConversation kind="hooks" id={run.id} revision={run.status} running={running} active={active && open} name={run.name} />
      <TranscriptDetailSection><Column gap="sm">
        {action.error && <FieldHint tone="danger">{action.error.message}</FieldHint>}
        <Row gap="sm" wrap>
          <Button size="xs" disabled={action.isPending} onClick={() => action.mutate()}>{t(running ? 'hooks.cancel' : 'hooks.retry')}</Button>
        </Row>
      </Column></TranscriptDetailSection>
    </>}
  </ExecutionEntry>
}

function ReportEntry({ report, active }: { report: TaskReport; active: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const status = report.status === 'generating' ? 'running' : report.status === 'ready' ? 'succeeded' : 'failed'
  return <ExecutionEntry name={t('hooks.reportName')} kind={t('hooks.builtinShort')} status={status} open={open} onToggle={() => setOpen(!open)}>
    {() => <><TranscriptDetailSection><Column gap="sm">
      <Row gap="sm" wrap>
        <Text size="xs" tone="secondary">{t('hooks.builtinReport')}</Text>
        <ExecutionTime startedAt={report.startedAt} endedAt={report.endedAt} />
      </Row>
      <Text size="sm" tone="secondary">{t(`hooks.reportSummary.${report.status}`)}</Text>
      {report.error && <FieldHint tone="danger">{report.error}</FieldHint>}
    </Column></TranscriptDetailSection>
      <HookConversation kind="report" id={report.taskId} revision={`${report.startedAt}:${report.status}`} running={report.status === 'generating'} active={active && open} name={t('hooks.reportName')} />
    </>}
  </ExecutionEntry>
}
