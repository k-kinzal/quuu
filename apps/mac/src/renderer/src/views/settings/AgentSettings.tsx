import {
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
  HeadCell,
  IconButton,
  ListFrame,
  ListFrameButton,
  SearchPicker,
  NumberInput,
  Page,
  RepeatableList,
  RepeatableRow,
  Row,
  Section,
  Select,
  Text,
  TextInput,
  claimContextMenu,
  tableMetrics,
  useMenu,
  useTheme,
  type MenuItemSpec
} from '@design-system/react'
import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentGroup, GroupStrategy, LogAdapter } from '../../../../preload/api/agents.js'
import { usePreview } from '../../interaction/usePreview.js'
import { userAgents } from '../../model/agents.js'
import { t } from '../../model/i18n/index.js'
import { isManagedAgent } from '../../model/agentVisibility.js'
import { GROUP_STRATEGY_LABEL, LOG_ADAPTER_LABEL } from '../../model/labels.js'

import { EnvEditor, StringListEditor } from '../../components/StringListEditor.js'
import { confirmDestructive } from '../../interaction/contextMenu.js'
import { rowActivation } from '../../interaction/focus.js'
import { contextMenu } from '../../interaction/menu.js'
import { clockTime } from '../../model/format.js'
import { useStore } from '../../state/store.js'
import { ArrowLeft, ICON, Minus, Plus, iconProps } from '../../ui/icons.js'

const TEMPLATE_VARS = [
  '{{prompt}}',
  '{{title}}',
  '{{sessionId}}',
  '{{projectPath}}',
  '{{projectName}}',
  '{{taskId}}',
  '{{runId}}'
]

/**
 * Settings > Agents (rules F / G).
 * Show the whole picture first (the list), then open the editor once something is picked (rule A).
 *
 * **Show promises as shape, never as prose.** The default that applies when a field is
 * empty is the dimmed row itself, the usable variables live in the bar's menu, and what
 * 0 means is said by the empty field's placeholder.
 */
export function AgentSettings(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const editingAgentId = useStore((s) => s.editingAgentId)
  const editingGroupId = useStore((s) => s.editingGroupId)
  const editAgent = useStore((s) => s.editAgent)
  const editGroup = useStore((s) => s.editGroup)

  // A managed definition doesn't open an editor either. Merely hiding it from the list
  // would still let a stale selection walk into the editor when settings are reopened.
  const editing = snapshot?.agents.find((a) => a.id === editingAgentId) ?? null
  const agent = editing && !isManagedAgent(editing) ? editing : null
  const group = snapshot?.groups.find((g) => g.id === editingGroupId) ?? null

  if (agent) return <AgentEditor agent={agent} onBack={() => editAgent(null)} />
  if (group) return <GroupEditor group={group} onBack={() => editGroup(null)} />
  return <AgentList />
}

function AgentList(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const editAgent = useStore((s) => s.editAgent)
  const editGroup = useStore((s) => s.editGroup)
  const theme = useTheme()

  const agents = userAgents(snapshot?.agents ?? [])
  const groups = snapshot?.groups ?? []
  const slots = useMemo(
    () => new Map((snapshot?.scheduler.agents ?? []).map((a) => [a.agentId, a])),
    [snapshot?.scheduler.agents]
  )
  const agentName = (id: string | null): string =>
    id ? (agents.find((a) => a.id === id)?.name ?? t('agentSettings.deletedAgent')) : '—'

  const addAgent = async (): Promise<void> => {
    const created = await window.quuu.agents.create({
      name: t('agentSettings.newAgentName'),
      description: '',
      command: 'claude',
      // `--` last, so a prompt opening with an option is still read as the prompt
      argsTemplate: ['-p', '--session-id', '{{sessionId}}', '--', '{{prompt}}'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--', '{{prompt}}'],
      env: {},
      concurrency: 1,
      fallbackAgentId: null,
      limitPatterns: [],
      cooldownSeconds: 900,
      timeoutSeconds: 7200,
      logAdapter: 'claude',
      enabled: false,
      sortOrder: agents.length
    })
    editAgent(created.id)
  }

  const addGroup = async (): Promise<void> => {
    const created = await window.quuu.groups.create({
      name: t('agentSettings.newGroupName'),
      description: '',
      strategy: 'priority',
      memberIds: [],
      isDefault: false,
      sortOrder: groups.length
    })
    editGroup(created.id)
  }

  /**
   * Right-click on a row.
   *
   * All a list row could do directly was "open" — duplicating, disabling and deleting
   * were all out of reach until you descended into the editor. Actions on a table row
   * belong on the row.
   */
  const agentItems = (agent: Agent): MenuItemSpec[] => [
    { label: t('agentSettings.edit'), onSelect: () => editAgent(agent.id) },
    {
      label: agent.enabled ? t('agentSettings.disable') : t('agentSettings.enable'),
      separatorBefore: true,
      onSelect: () => void window.quuu.agents.update({ id: agent.id, patch: { enabled: !agent.enabled } })
    },
    ...(slots.get(agent.id)?.cooldownUntil
      ? [{
          label: t('agentSettings.resetLimit'),
          onSelect: () => void window.quuu.agents.resetLimit(agent.id)
        }]
      : []),
    {
      label: t('agentSettings.duplicate'),
      onSelect: () => void window.quuu.agents.duplicate(agent.id).then((copy) => editAgent(copy.id))
    },
    {
      label: t('agentSettings.delete'),
      separatorBefore: true,
      onSelect: () => {
        void confirmDestructive(
          t('agentSettings.deleteAgentConfirm', { name: agent.name }),
          t('agentSettings.deleteAgentDetail')
        ).then((ok) => ok && void window.quuu.agents.remove(agent.id))
      }
    }
  ]

  const groupItems = (group: AgentGroup): MenuItemSpec[] => [
    { label: t('agentSettings.edit'), onSelect: () => editGroup(group.id) },
    {
      label: t('agentSettings.delete'),
      separatorBefore: true,
      onSelect: () => {
        void confirmDestructive(
          t('agentSettings.deleteGroupConfirm', { name: group.name }),
          t('agentSettings.deleteGroupDetail')
        ).then((ok) => ok && void window.quuu.groups.remove(group.id))
      }
    }
  ]

  return (
    <Page title={t('agentSettings.title')}>
      <Section title={t('agentSettings.title')}>
        <ListFrame
          bar={
            <ListFrameButton
              title={t('agentSettings.addAgent')}
              icon={<Plus size={ICON.sm} {...iconProps} />}
              onClick={() => void addAgent()}
            />
          }
        >
          <DataTable>
            <DataTableHead>
              <DataTableHeadRow>
                <HeadCell width={tableMetrics.cell.marker} edge="start" />
                <HeadCell>{t('agentSettings.name')}</HeadCell>
                <HeadCell>{t('agentSettings.command')}</HeadCell>
                <HeadCell width={tableMetrics.cell.count}>{t('agentSettings.slots')}</HeadCell>
                <HeadCell>{t('agentSettings.fallback')}</HeadCell>
                <HeadCell>{t('agentSettings.status')}</HeadCell>
              </DataTableHeadRow>
            </DataTableHead>
            <DataTableBody>
              {agents.map((a) => {
                const slot = slots.get(a.id)
                return (
                  <DataRow
                    key={a.id}
                    /* A row isn't a button, so without declaring it pressable it can't be opened by key */
                    {...rowActivation(() => editAgent(a.id))}
                    onClick={() => editAgent(a.id)}
                    onContextMenu={(e) => {
                      if (claimContextMenu(e)) void contextMenu(agentItems(a))
                    }}
                  >
                    <DataCell width={tableMetrics.cell.marker} edge="start">
                      <Row>
                        <Dot
                          muted={!a.enabled}
                          color={
                            slot?.cooldownUntil
                              ? theme.palette.quuu.status.review
                              : (slot?.active ?? 0) > 0
                                ? theme.palette.quuu.status.running
                                : theme.palette.quuu.status.done
                          }
                        />
                      </Row>
                    </DataCell>
                    <DataCell>{a.name}</DataCell>
                    <DataCell>
                      <Text mono truncate>
                        {a.command}
                      </Text>
                    </DataCell>
                    <DataCell width={tableMetrics.cell.count}>
                      <Text tabular>
                        {slot?.active ?? 0}/{a.concurrency}
                      </Text>
                    </DataCell>
                    <DataCell>{agentName(a.fallbackAgentId)}</DataCell>
                    <DataCell tone={slot?.cooldownUntil ? 'warning' : 'default'}>
                      {!a.enabled
                        ? t('agentSettings.statusDisabled')
                        : slot?.cooldownUntil
                          ? t('agentSettings.statusCooldown', { time: clockTime(slot.cooldownUntil) })
                          : t('agentSettings.statusIdle')}
                    </DataCell>
                  </DataRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        </ListFrame>
      </Section>

      <Section title={t('agentSettings.groupsSection')}>
        <ListFrame
          bar={
            <ListFrameButton
              title={t('agentSettings.addGroup')}
              icon={<Plus size={ICON.sm} {...iconProps} />}
              onClick={() => void addGroup()}
            />
          }
        >
          <DataTable>
            <DataTableHead>
              <DataTableHeadRow>
                <HeadCell width={tableMetrics.cell.marker} edge="start" />
                <HeadCell>{t('agentSettings.name')}</HeadCell>
                <HeadCell width={tableMetrics.cell.count}>{t('agentSettings.members')}</HeadCell>
                <HeadCell>{t('agentSettings.strategy')}</HeadCell>
              </DataTableHeadRow>
            </DataTableHead>
            <DataTableBody>
              {groups.map((g) => (
                <DataRow
                  key={g.id}
                  {...rowActivation(() => editGroup(g.id))}
                  onClick={() => editGroup(g.id)}
                  onContextMenu={(e) => {
                    if (claimContextMenu(e)) void contextMenu(groupItems(g))
                  }}
                >
                  <DataCell width={tableMetrics.cell.marker} edge="start">
                    <Row>
                      <Dot color={theme.palette.primaryText} />
                    </Row>
                  </DataCell>
                  <DataCell>
                    <Text truncate>
                      {g.name}
                      {g.isDefault && <Text tone="tertiary">{t('agentSettings.defaultMark')}</Text>}
                    </Text>
                  </DataCell>
                  <DataCell width={tableMetrics.cell.count}>
                    <Text tabular>{g.memberIds.length}</Text>
                  </DataCell>
                  <DataCell>{GROUP_STRATEGY_LABEL[g.strategy]}</DataCell>
                </DataRow>
              ))}
            </DataTableBody>
          </DataTable>
        </ListFrame>
      </Section>
    </Page>
  )
}

/** The save state is said by the label. Enabled-ness alone can't say "already saved". */
function EditorActions({
  dirty,
  onSave,
  onDuplicate,
  onDelete
}: {
  dirty: boolean
  onSave(): void
  /** Absent where a copy makes no sense (a group's meaning is its members, not its settings) */
  onDuplicate?(): void
  onDelete(): void
}): JSX.Element {
  return (
    <>
      <Button color={dirty ? 'primary' : 'neutral'} disabled={!dirty} onClick={onSave}>
        {dirty ? t('agentSettings.save') : t('agentSettings.saved')}
      </Button>
      {onDuplicate && (
        <Button variant="ghost" color="neutral" onClick={onDuplicate}>
          {t('agentSettings.duplicate')}
        </Button>
      )}
      <Button variant="ghost" color="error" onClick={onDelete}>
        {t('agentSettings.deleteAction')}
      </Button>
    </>
  )
}

function AgentEditor({ agent, onBack }: { agent: Agent; onBack(): void }): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const editAgent = useStore((s) => s.editAgent)
  const defaults = usePreview('agent-defaults', () => window.quuu.agents.defaults()).value
  const [draft, setDraft] = useState<Agent>(agent)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(agent)
    setDirty(false)
    // A snapshot arriving mid-edit must not clobber the draft. Reload only when a different
    // agent is picked (id) or it was saved elsewhere (updatedAt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id, agent.updatedAt])

  const patch = <K extends keyof Agent>(key: K, value: Agent[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = draft
    await window.quuu.agents.update({ id: agent.id, patch: input })
    setDirty(false)
  }

  /**
   * The copy is of what is on screen. Unsaved edits are saved first rather than dropped:
   * the editor moves on to the copy, and edits left behind in an editor nobody is looking
   * at would be lost without a word.
   */
  const duplicate = async (): Promise<void> => {
    if (dirty) await save()
    const copy = await window.quuu.agents.duplicate(agent.id)
    editAgent(copy.id)
  }

  return (
    <Page
      title={agent.name}
      lead={
        <IconButton
          title={t('agentSettings.backToList')}
          icon={<ArrowLeft size={ICON.md} {...iconProps} />}
          onClick={onBack}
        />
      }
      actions={
        <EditorActions
          dirty={dirty}
          onSave={() => void save()}
          onDuplicate={() => void duplicate()}
          onDelete={() => {
            void confirmDestructive(
              t('agentSettings.deleteAgentConfirm', { name: agent.name }),
              t('agentSettings.deleteAgentDetail')
            ).then((ok) => {
              if (!ok) return
              void window.quuu.agents.remove(agent.id)
              onBack()
            })
          }}
        />
      }
    >
      <Section title={t('agentSettings.basicsSection')}>
        <Field label={t('agentSettings.name')}>
          <TextInput value={draft.name} onChange={(e) => patch('name', e.target.value)} />
        </Field>
        <Field label={t('agentSettings.description')}>
          <TextInput
            value={draft.description}
            onChange={(e) => patch('description', e.target.value)}
          />
        </Field>
        <Checkbox
          label={t('agentSettings.enabled')}
          checked={draft.enabled}
          onChange={(v: boolean) => patch('enabled', v)}
        />
      </Section>

      <Section title={t('agentSettings.launchSection')}>
        <Field label={t('agentSettings.command')}>
          <TextInput
            mono
            value={draft.command}
            placeholder="claude"
            onChange={(e) => patch('command', e.target.value)}
          />
        </Field>

        <Field label={t('agentSettings.argsFirst')} width="lg">
          <StringListEditor
            noun={t('agentSettings.argNoun')}
            value={draft.argsTemplate}
            placeholder="-p"
            variables={TEMPLATE_VARS}
            onChange={(v) => patch('argsTemplate', v)}
          />
        </Field>

        {/* Emptying this makes resuming impossible. Don't write "can't resume" here —
            main says it the moment you try to follow up (RESUME_UNAVAILABLE) */}
        <Field label={t('agentSettings.argsResume')} width="lg">
          <StringListEditor
            noun={t('agentSettings.argNoun')}
            value={draft.resumeArgsTemplate}
            placeholder="--resume"
            variables={TEMPLATE_VARS}
            onChange={(v) => patch('resumeArgsTemplate', v)}
          />
        </Field>

        <Field label={t('agentSettings.env')} width="lg">
          <EnvEditor value={draft.env} onChange={(v) => patch('env', v)} />
        </Field>
      </Section>

      <Section title={t('agentSettings.slotsSection')}>
        <Row align="start">
          <Field label={t('agentSettings.concurrency')} width="xs">
            <NumberInput
              min={1}
              max={16}
              value={draft.concurrency}
              onChange={(v) => patch('concurrency', v)}
            />
          </Field>
          <Field label={t('agentSettings.timeout')} width="xs">
            <NumberInput
              min={0}
              unit={t('agentSettings.seconds')}
              zeroLabel={t('agentSettings.unlimited')}
              value={draft.timeoutSeconds}
              onChange={(v) => patch('timeoutSeconds', v)}
            />
          </Field>
        </Row>
      </Section>

      <Section title={t('agentSettings.limitSection')}>
        <Field label={t('agentSettings.fallbackAgent')} hint={t('agentSettings.fallbackHint')}>
          <Select
            aria-label={t('agentSettings.fallbackAgent')}
            value={draft.fallbackAgentId ?? ''}
            onChange={(e) => patch('fallbackAgentId', e.target.value || null)}
            options={[
              { value: '', label: t('agentSettings.none') },
              ...userAgents(snapshot?.agents ?? [])
                .filter((a) => a.id !== agent.id)
                .map((a) => ({ value: a.id, label: a.name }))
            ]}
          />
        </Field>

        <Field label={t('agentSettings.limitPatterns')} width="lg">
          <StringListEditor
            noun={t('agentSettings.patternNoun')}
            value={draft.limitPatterns}
            placeholder="usage limit"
            defaults={defaults?.limitPatterns ?? []}
            onChange={(v) => patch('limitPatterns', v)}
          />
        </Field>

        <Field label={t('agentSettings.cooldown')} width="xs">
          <NumberInput
            min={0}
            unit={t('agentSettings.seconds')}
            value={draft.cooldownSeconds}
            onChange={(v) => patch('cooldownSeconds', v)}
          />
        </Field>
      </Section>

      <Section title={t('agentSettings.logSection')}>
        <Field label={t('agentSettings.logAdapter')} width="md">
          <Select<LogAdapter>
            aria-label={t('agentSettings.logAdapter')}
            value={draft.logAdapter}
            onChange={(e) => patch('logAdapter', e.target.value)}
            options={(Object.keys(LOG_ADAPTER_LABEL) as LogAdapter[]).map((k) => ({
              value: k,
              label: LOG_ADAPTER_LABEL[k]
            }))}
          />
        </Field>
      </Section>
    </Page>
  )
}

function GroupEditor({ group, onBack }: { group: AgentGroup; onBack(): void }): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const [draft, setDraft] = useState<AgentGroup>(group)
  const [dirty, setDirty] = useState(false)
  /** The target of the bar's "remove". Remembers the row that was pressed */
  const [current, setCurrent] = useState<number | null>(null)
  /* Candidate members. A surface anchored to the button pressed (not the right-click container) */
  const addMember = useMenu()

  useEffect(() => {
    setDraft(group)
    setDirty(false)
    setCurrent(null)
    // Same reason as AgentEditor (don't let a snapshot clobber the draft being edited)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, group.updatedAt])

  const patch = <K extends keyof AgentGroup>(key: K, value: AgentGroup[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }

  const agents = userAgents(snapshot?.agents ?? [])
  const members = draft.memberIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is Agent => Boolean(a))
  const available = agents.filter((a) => !draft.memberIds.includes(a.id))

  const move = (from: number, to: number): void => {
    const copy = [...draft.memberIds]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    patch('memberIds', copy)
    setCurrent(to)
  }

  const save = async (): Promise<void> => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...input } = draft
    await window.quuu.groups.update({ id: group.id, patch: input })
    setDirty(false)
  }

  return (
    <Page
      title={group.name}
      lead={
        <IconButton
          title={t('agentSettings.backToList')}
          icon={<ArrowLeft size={ICON.md} {...iconProps} />}
          onClick={onBack}
        />
      }
      actions={
        <EditorActions
          dirty={dirty}
          onSave={() => void save()}
          onDelete={() => {
            void confirmDestructive(
              t('agentSettings.deleteGroupConfirm', { name: group.name }),
              t('agentSettings.deleteGroupDetail')
            ).then((ok) => {
              if (!ok) return
              void window.quuu.groups.remove(group.id)
              onBack()
            })
          }}
        />
      }
    >
      <Section title={t('agentSettings.basicsSection')}>
        <Field label={t('agentSettings.name')}>
          <TextInput value={draft.name} onChange={(e) => patch('name', e.target.value)} />
        </Field>
        <Field label={t('agentSettings.description')}>
          <TextInput
            value={draft.description}
            onChange={(e) => patch('description', e.target.value)}
          />
        </Field>
        <Field label={t('agentSettings.strategy')} width="md">
          <Select<GroupStrategy>
            aria-label={t('agentSettings.strategy')}
            value={draft.strategy}
            onChange={(e) => patch('strategy', e.target.value)}
            options={(Object.keys(GROUP_STRATEGY_LABEL) as GroupStrategy[]).map((k) => ({
              value: k,
              label: GROUP_STRATEGY_LABEL[k]
            }))}
          />
        </Field>
        <Checkbox
          label={t('agentSettings.defaultGroup')}
          checked={draft.isDefault}
          onChange={(v: boolean) => patch('isDefault', v)}
        />
      </Section>

      {/* The order is the priority. Drag to move (the numbers exist to read the result of moving) */}
      <Section title={t('agentSettings.members')}>
        <Field label={t('agentSettings.memberOrder')} width="md">
          <RepeatableList
            onReorder={move}
            bar={
              <>
                <ListFrameButton
                  title={t('agentSettings.addMember')}
                  aria-haspopup="listbox"
                  aria-expanded={addMember.isOpen}
                  icon={<Plus size={ICON.sm} {...iconProps} />}
                  disabled={available.length === 0}
                  /* A surface anchored to the button pressed (not the right-click container) */
                  onClick={addMember.open}
                />
                <ListFrameButton
                  title={t('agentSettings.removeMember')}
                  icon={<Minus size={ICON.sm} {...iconProps} />}
                  disabled={current === null || current >= members.length}
                  onClick={() => {
                    if (current === null) return
                    patch(
                      'memberIds',
                      draft.memberIds.filter((_, i) => i !== current)
                    )
                    setCurrent(members.length > 1 ? Math.max(0, current - 1) : null)
                  }}
                />
              </>
            }
          >
            {members.map((member, i) => (
              <RepeatableRow
                key={member.id}
                index={i}
                ordinal
                selected={current === i}
                onSelect={() => setCurrent(i)}
              >
                <Text truncate grow>
                  {member.name}
                  {!member.enabled && <Text tone="tertiary">{t('agentSettings.memberDisabled')}</Text>}
                </Text>
              </RepeatableRow>
            ))}
          </RepeatableList>
        </Field>
      </Section>

      <SearchPicker
        open={addMember.isOpen}
        anchorEl={addMember.anchorEl}
        onClose={addMember.close}
        options={available.map(a => ({ value: a.id, label: a.name }))}
        value={null}
        onChange={id => patch('memberIds', [...draft.memberIds, id])}
        label={t('agentSettings.addMember')}
      />
    </Page>
  )
}
