import {
  CellButton, DataCell, DataRow, Dot, FillerCell, ItemBody,
  ItemMarker, ItemRow, ItemSubline, Row, Spacer, StatusIndicator, Text, tableMetrics
} from '@design-system/react'
import type { KeyboardEvent } from 'react'
import type { TaskRule } from '../../../preload/api/automation.js'
import type { Project } from '../../../preload/api/projects.js'
import { focusPane } from '../interaction/focus.js'
import { targetLabel } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL } from '../model/labels.js'
import { ruleSummaryDetail, ruleSummaryLabel } from '../model/ruleSchedule.js'
import type { TaskColumnId } from '../model/table.js'
import { useStore } from '../state/store.js'
import { Priority } from '../ui/panes.js'

interface RuleRowProps {
  rule: TaskRule
  project: Project | undefined
  showProject: boolean
}

function openRule(id: string): void {
  useStore.getState().editRule(id)
  requestAnimationFrame(() => focusPane('settings'))
}

/** These buttons open definitions; their keys must never open the last selected task. */
function ruleKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') event.stopPropagation()
}

function RuleMarker(): JSX.Element {
  return (
    <StatusIndicator shape="half" tone="neutral" label={t('taskRules.recurringSection')} />
  )
}

/** A definition uses the task table's columns and row height, at its very end. */
export function RecurringTaskTableRow({ rule, project, showProject, widths }: RuleRowProps & {
  widths: Record<TaskColumnId, number>
}): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const agent = snapshot ? (rule.agentOverrideId
    ? snapshot.agents.find((a) => a.id === rule.agentOverrideId)?.name ?? t('derive.deleted')
    : targetLabel(snapshot, project)) : '—'
  return (
    <DataRow role="option" aria-selected={false}
      onClick={() => openRule(rule.id)} onKeyDown={ruleKey} title={ruleSummaryDetail(rule)}>
      <DataCell width={widths.mark} edge="start" clip><RuleMarker /></DataCell>
      <DataCell clip>
        <CellButton type="button" title={rule.name} onClick={(e) => {
          e.stopPropagation()
          openRule(rule.id)
        }}>{rule.name}</CellButton>
      </DataCell>
      {showProject && (
        <DataCell width={widths.project} tone="muted">
          <Row gap="icon" min><Dot color={project?.color} muted={!project} /><Text truncate>{project?.name ?? '—'}</Text></Row>
        </DataCell>
      )}
      <DataCell width={widths.priority}><Priority level={rule.priority}>{rule.priority === 2 ? '' : PRIORITY_LABEL[rule.priority]}</Priority></DataCell>
      <DataCell width={widths.agent} tone="muted">{agent}</DataCell>
      <DataCell width={widths.state} tone="muted" title={ruleSummaryDetail(rule)}>{rule.enabled ? ruleSummaryLabel(rule) : t('taskRules.disabledBadge')}</DataCell>
      <DataCell width={widths.lastRun} tone="muted">—</DataCell>
      <FillerCell />
      <DataCell width={tableMetrics.actionsWidth} edge="end" />
    </DataRow>
  )
}

/** The compact list keeps the same one/two-line shape as its ordinary tasks. */
export function RecurringTaskListRow({ rule, project, showProject }: RuleRowProps): JSX.Element {
  const schedule = <Text size="xs" tone="tertiary" truncate title={ruleSummaryDetail(rule)}>{rule.enabled ? ruleSummaryLabel(rule) : t('taskRules.disabledBadge')}</Text>
  return (
    <ItemRow role="option" aria-selected={false} type="button" lines={showProject ? 2 : 1}
      title={`${rule.name} · ${ruleSummaryDetail(rule)}`} onClick={() => openRule(rule.id)} onKeyDown={ruleKey}>
      {showProject ? (
        <>
          <ItemMarker><RuleMarker /></ItemMarker>
          <ItemBody>
            <Text size="sm" truncate tone="secondary">{rule.name}</Text>
            <ItemSubline>
              <Dot color={project?.color} muted={!project} />
              <Text tone="secondary" truncate>{project?.name ?? '—'}</Text>
              <Spacer />
              {schedule}
            </ItemSubline>
          </ItemBody>
        </>
      ) : (
        <>
          <RuleMarker />
          <Text size="sm" truncate grow tone="secondary">{rule.name}</Text>
          {schedule}
        </>
      )}
    </ItemRow>
  )
}
