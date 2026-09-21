import {
  Badge,
  Button,
  Checkbox,
  DataCell,
  DataRow,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeadRow,
  Dot,
  Field,
  FieldHint,
  HeadCell,
  IconButton,
  ListFrame,
  ListFrameButton,
  Page,
  Panel,
  Row,
  Section,
  Select,
  Text,
  TextArea,
  TextInput,
  claimContextMenu,
  tableMetrics,
  useTheme,
  type MenuItemSpec
} from '@design-system/react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { TaskRule } from '../../../../preload/api/automation.js'
import type { Project } from '../../../../preload/api/projects.js'
import type { TaskStatus } from '../../../../preload/api/tasks.js'
import { userAgents } from '../../model/agents.js'
import { t } from '../../model/i18n/index.js'
import { DEFAULT_BLOCK_STATUSES } from '../../model/ruleDraft.js'
import { ruleScheduleLabel, scheduleOptions, type ScheduleChoice } from '../../model/ruleSchedule.js'
import { OPEN_STATUSES } from '../../model/taskStatus.js'

import { usePreview } from '../../interaction/usePreview.js'
import { useWindowLayout } from '../../interaction/useWindowLayout.js'
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '../../model/labels.js'

import { confirmDestructive } from '../../interaction/contextMenu.js'
import { isTyping, pane, rowActivation } from '../../interaction/focus.js'
import { contextMenu } from '../../interaction/menu.js'
import { absoluteTime, relativeTime } from '../../model/format.js'
import { useStore } from '../../state/store.js'
import { queryClient } from '../../state/queryClient.js'
import { failureReason } from '../../model/operationFailure.js'
import { ArrowLeft, ICON, Plus, iconProps } from '../../ui/icons.js'

/**
 * Automations — definitions that queue a task once the conditions are met (rule F: this is
 * a project's configuration, so it lives on the project's screen, not in the app settings).
 *
 * The three conditions are gates ANDed together, and any of them may be omitted. One with
 * none at all would queue on every tick, so it can't be saved (the check is unified in
 * `hasRuleCondition`).
 */

export function ruleConditionLabel(rule: TaskRule): string {
  const parts: string[] = []
  if (rule.whenIdle) parts.push(t('taskRules.whenIdle'))
  if (rule.blockStatuses.length > 0) parts.push(t('taskRules.noDuplicates'))
  return parts.length > 0 ? parts.join(' / ') : t('taskRules.always')
}

export function TaskRuleList({
  project,
  onEdit
}: {
  project: Project
  onEdit(id: string): void
}): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const theme = useTheme()
  const rules = (snapshot?.rules ?? []).filter((r) => r.projectId === project.id)

  /*
   * A new one starts **disabled**. The default condition (when the queue is empty) is
   * satisfied immediately, so creating it enabled runs one before you have written the
   * instructions.
   */
  const add = async (): Promise<void> => {
    const created = await window.quuu.rules.create({
      projectId: project.id,
      name: t('taskRules.newRuleName'),
      prompt: '',
      priority: 2,
      agentOverrideId: null,
      whenIdle: true,
      cron: '',
      frequency: 'daily',
      blockStatuses: DEFAULT_BLOCK_STATUSES,
      enabled: false,
      sortOrder: rules.length
    })
    onEdit(created.id)
  }

  /** Right-click on a row. Actions other than "open" belong on the row too (rule N-2) */
  const items = (rule: TaskRule): MenuItemSpec[] => [
    { label: t('taskRules.edit'), onSelect: () => onEdit(rule.id) },
    {
      label: rule.enabled ? t('taskRules.disable') : t('taskRules.enable'),
      separatorBefore: true,
      onSelect: () => void window.quuu.rules.update({ id: rule.id, patch: { enabled: !rule.enabled } })
    },
    { label: t('taskRules.enqueueNow'), onSelect: () => void window.quuu.rules.enqueue(rule.id) },
    {
      label: t('taskRules.delete'),
      separatorBefore: true,
      onSelect: () => {
        void confirmDestructive(
          t('taskRules.deleteConfirm', { name: rule.name }),
          t('taskRules.deleteDetail')
        ).then((ok) => ok && void window.quuu.rules.remove(rule.id))
      }
    }
  ]

  return (
    <Section title={t('taskRules.section')}>
      <ListFrame
        bar={
          <ListFrameButton
            title={t('taskRules.addRule')}
            icon={<Plus size={ICON.sm} {...iconProps} />}
            onClick={() => void add()}
          />
        }
      >
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              <HeadCell width={tableMetrics.cell.marker} edge="start" />
              <HeadCell>{t('taskRules.name')}</HeadCell>
              <HeadCell>{t('taskRules.conditions')}</HeadCell>
              <HeadCell width={tableMetrics.cell.expression}>{t('taskRules.frequency')}</HeadCell>
              <HeadCell width={tableMetrics.cell.time}>{t('taskRules.next')}</HeadCell>
              <HeadCell width={tableMetrics.cell.time}>{t('taskRules.last')}</HeadCell>
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {rules.map((rule) => (
              <DataRow
                key={rule.id}
                {...rowActivation(() => onEdit(rule.id))}
                onClick={() => onEdit(rule.id)}
                onContextMenu={(e) => {
                  if (claimContextMenu(e)) void contextMenu(items(rule))
                }}
              >
                <DataCell width={tableMetrics.cell.marker} edge="start">
                  <Row>
                    <Dot
                      muted={!rule.enabled}
                      color={
                        rule.enabled
                          ? theme.palette.quuu.status.queued
                          : theme.palette.text.tertiary
                      }
                    />
                  </Row>
                </DataCell>
                <DataCell>
                  <Row gap="md" min>
                    <Text truncate>{rule.name}</Text>
                    {/* Don't draw the default (enabled); show only what departs from it (rule I) */}
                    {!rule.enabled && <Badge>{t('taskRules.disabledBadge')}</Badge>}
                  </Row>
                </DataCell>
                <DataCell>{ruleConditionLabel(rule)}</DataCell>
                <DataCell width={tableMetrics.cell.expression}>
                  <Text truncate>
                    {ruleScheduleLabel(rule)}
                  </Text>
                </DataCell>
                <DataCell width={tableMetrics.cell.time}>
                  {rule.frequency !== 'none' ? t('taskRules.withinPeriod') : rule.dueAt ? absoluteTime(rule.dueAt) : '—'}
                </DataCell>
                <DataCell width={tableMetrics.cell.time}>
                  {relativeTime(rule.lastEnqueuedAt)}
                </DataCell>
              </DataRow>
            ))}
          </DataTableBody>
        </DataTable>
      </ListFrame>
    </Section>
  )
}

export function TaskRuleEditor({ rule, onBack }: { rule: TaskRule; onBack(): void }): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const layout = useStore((s) => s.layout)
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()
  const agents = userAgents(snapshot?.agents ?? [])
  const [draft, setDraft] = useState<TaskRule>(rule)
  const [dirty, setDirty] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleChoice>(rule.frequency !== 'none' ? rule.frequency : rule.cron ? 'cron' : 'none')
  const saving = useMutation({
    mutationKey: ['rules', 'update'],
    meta: { feedback: 'inline' },
    mutationFn: async (value: TaskRule) => {
      const { id, createdAt: _c, updatedAt: _u, dueAt: _d, lastEnqueuedAt: _l, ...input } = value
      return window.quuu.rules.update({ id, patch: input }, { context: { feedback: 'inline' } })
    },
    onSuccess: (_saved, submitted) => { if (draft === submitted) setDirty(false) }
  }, queryClient)

  useEffect(() => {
    setDraft(rule)
    setDirty(false)
    setSchedule(rule.frequency !== 'none' ? rule.frequency : rule.cron ? 'cron' : 'none')
    // A snapshot arriving mid-edit must not clobber the draft (same treatment as AgentEditor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.id])

  const patch = <K extends keyof TaskRule>(key: K, value: TaskRule[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }

  const toggleStatus = (status: TaskStatus, on: boolean): void => {
    const next = OPEN_STATUSES.filter((s) => (s === status ? on : draft.blockStatuses.includes(s)))
    patch('blockStatuses', next)
  }

  const previewInput = { cron: draft.cron, frequency: draft.frequency, whenIdle: draft.whenIdle, blockStatuses: draft.blockStatuses }
  const preview = usePreview(JSON.stringify(previewInput), () => window.quuu.rules.preview(previewInput))
  const cronPreview = preview.value?.nextAt ?? null
  const cronBroken = preview.value ? !preview.value.valid : false
  const noCondition = preview.value ? !preview.value.hasCondition : false
  const canSave = !saving.isPending && preview.value !== null && dirty && !cronBroken && !noCondition && (schedule !== 'cron' || draft.cron.trim().length > 0) && draft.name.trim().length > 0

  return (
    <Panel
      surface="canvas"
      grow
      /* It stands in for the project surface, so it scrolls the same way */
      scroll
      {...pane('settings', { tab: true })}
      aria-label={t('taskRules.paneLabel')}
      /*
       * Esc goes back one level. Without catching it here it closes the whole project
       * settings and there is no "back to the list" (Esc while typing belongs to the input,
       * so it isn't forwarded).
       */
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isTyping(e.target)) {
          e.preventDefault()
          onBack()
        }
      }}
    >
      <Page
        title={rule.name}
        /* Same top-left as the project surface it replaces: keep clear of the traffic lights */
        startInset={layout.railCollapsed ? WINDOW_BUTTONS_OVERHANG : undefined}
        lead={
          <IconButton
            title={t('taskRules.backToProject')}
            icon={<ArrowLeft size={ICON.md} {...iconProps} />}
            onClick={onBack}
          />
        }
        actions={
          <>
            <Button
              title={t('taskRules.enqueueNowTitle')}
              onClick={() => void window.quuu.rules.enqueue(rule.id)}
            >
              {t('taskRules.enqueueNow')}
            </Button>
            <Button
              color={canSave ? 'primary' : 'neutral'}
              disabled={!canSave}
              loading={saving.isPending}
              onClick={() => saving.mutate(draft)}
            >
              {dirty ? t('taskRules.save') : t('taskRules.saved')}
            </Button>
            <Button
              variant="ghost"
              color="error"
              onClick={() => {
                void confirmDestructive(
                  t('taskRules.deleteConfirm', { name: rule.name }),
                  t('taskRules.deleteDetail')
                ).then((ok) => {
                  if (!ok) return
                  void window.quuu.rules.remove(rule.id)
                  onBack()
                })
              }}
            >
              {t('taskRules.deleteAction')}
            </Button>
          </>
        }
      >
        <Section title={t('taskRules.whatSection')}>
          <Field label={t('taskRules.taskName')} width="md">
            <TextInput
              key={rule.id}
              value={draft.name}
              onChange={(e) => patch('name', e.target.value)}
            />
          </Field>
          {/* What gets sent when this is empty is shown by the placeholder (the task name itself) */}
          <Field label={t('taskRules.prompt')} width="full">
            <TextArea
              key={rule.id}
              rows={6}
              placeholder={draft.name}
              value={draft.prompt}
              onChange={(e) => patch('prompt', e.target.value)}
            />
          </Field>
          <Row align="start">
            <Field label={t('taskRules.priority')} width="xs">
              <Select
                aria-label={t('taskRules.priority')}
                value={String(draft.priority)}
                onChange={(e) => patch('priority', Number(e.target.value) as TaskRule['priority'])}
                options={[0, 1, 2, 3].map((p) => ({
                  value: String(p),
                  label: PRIORITY_LABEL[p as 0 | 1 | 2 | 3]
                }))}
              />
            </Field>
            <Field label={t('taskRules.agent')} width="md">
              <Select
                aria-label={t('taskRules.agent')}
                value={draft.agentOverrideId ?? ''}
                onChange={(e) => patch('agentOverrideId', e.target.value || null)}
                options={[
                  { value: '', label: t('taskRules.projectAssignment') },
                  ...agents.map((a) => ({ value: a.id, label: a.name }))
                ]}
              />
            </Field>
          </Row>
        </Section>

        <Section title={t('taskRules.whenSection')}>
          <Field label={t('taskRules.frequency')} width="md"
            hint={draft.frequency !== 'none' ? t(draft.frequency === 'weekly' ? 'taskRules.weeklyHint' : draft.frequency === 'weekdays' ? 'taskRules.weekdaysHint' : 'taskRules.dailyHint') : undefined}>
            <Select
              aria-label={t('taskRules.frequency')}
              value={schedule}
              options={scheduleOptions()}
              onChange={(e) => {
                const choice = e.target.value
                setSchedule(choice)
                setDraft((d) => ({ ...d, frequency: choice === 'cron' ? 'none' : choice, cron: choice === 'cron' ? d.cron : '' }))
                setDirty(true)
              }}
            />
          </Field>
          <Checkbox
            label={t('taskRules.onlyWhenIdle')}
            checked={draft.whenIdle}
            onChange={(v: boolean) => patch('whenIdle', v)}
          />

          {schedule === 'cron' && <Field
            label={t('taskRules.cron')}
            error={cronBroken ? t('taskRules.cronError') : undefined}
            hint={cronPreview ? t('taskRules.cronNext', { time: absoluteTime(cronPreview) }) : undefined}
            width="md"
          >
            <TextInput
              key={rule.id}
              aria-label={t('taskRules.cron')}
              mono
              placeholder="0 3 * * *"
              value={draft.cron}
              onChange={(e) => patch('cron', e.target.value)}
            />
          </Field>}

          <Field label={t('taskRules.blockStatuses')} width="full">
            <Row wrap gap="lg">
              {OPEN_STATUSES.map((status) => (
                <Checkbox
                  key={status}
                  label={TASK_STATUS_LABEL[status]}
                  checked={draft.blockStatuses.includes(status)}
                  onChange={(v: boolean) => toggleStatus(status, v)}
                />
              ))}
            </Row>
          </Field>

          {noCondition && <FieldHint tone="danger">{t('taskRules.noCondition')}</FieldHint>}

          <Checkbox
            label={t('taskRules.enabled')}
            checked={draft.enabled}
            onChange={(v: boolean) => patch('enabled', v)}
          />
          {saving.error && <FieldHint tone="danger">{failureReason(saving.error)}</FieldHint>}
        </Section>
      </Page>
    </Panel>
  )
}
