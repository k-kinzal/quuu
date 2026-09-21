import { useState } from 'react'
import type { Project } from '../../../../preload/api/projects.js'
import { userAgents } from '../../model/agents.js'
import { COMMIT_IDENTITY_MODES } from '../../model/identityOptions.js'

import { COMMIT_IDENTITY_MODE_LABEL } from '../../model/labels.js'
import { PROJECT_COLORS } from '../../model/projectDefaults.js'

import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Page,
  Panel,
  Row,
  Section,
  Select,
  SwatchGroup,
  TextInput
} from '@design-system/react'
import { CommitIdentityPanel, CommitIdentityReadout } from '../../components/CommitIdentity.js'
import { pane } from '../../interaction/focus.js'
import { confirmDeleteProject } from '../../interaction/projectActions.js'
import { usePreview } from '../../interaction/usePreview.js'
import { useWindowLayout } from '../../interaction/useWindowLayout.js'
import { editorAppName } from '../../model/editorName.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'
import { ArrowLeft, FolderOpen, ICON, Terminal, iconProps } from '../../ui/icons.js'
import { TaskRuleEditor, TaskRuleList } from './TaskRules.js'

/**
 * A project's configuration (rule F).
 *
 * It only affects one project, so it lives on that project's screen rather than in the
 * app's Settings. Opened via rail → project → gear.
 */
export function ProjectDetail({
  project,
  onBack
}: {
  project: Project
  onBack(): void
}): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const settings = useSettings()
  const identityPreview = usePreview(JSON.stringify([settings, project]), () => window.quuu.settings.previewIdentity({ identity: settings.commitIdentity, projectId: project.id })).value
  const editors = useStore((s) => s.editors)
  const layout = useStore((s) => s.layout)
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()
  // projectActions owns the cleanup after a delete (where to move the visible surface), so no setSection here
  const agents = userAgents(snapshot?.agents ?? [])
  const groups = snapshot?.groups ?? []
  /*
   * Editing an automation opens inside this surface (list → detail, same as Settings › Agents).
   * Which one is open affects no other screen, so it is held here rather than in the store.
   */
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const editingRule = (snapshot?.rules ?? []).find((r) => r.id === editingRuleId) ?? null

  const update = (patch: Partial<Project>): void => {
    void window.quuu.projects.update({ id: project.id, patch: patch })
  }

  const targetValue = project.targetId ? `${project.targetKind}:${project.targetId}` : ''

  if (editingRule) {
    return <TaskRuleEditor rule={editingRule} onBack={() => setEditingRuleId(null)} />
  }

  // The surface is as long as the project has settings, so it is the one scrolling region here
  return (
    <Panel surface="canvas" grow scroll {...pane('settings', { tab: true })} aria-label={t('projectDetail.paneLabel')}>
      <Page
        title={t('projectDetail.title', { name: project.name })}
        /* With the rail collapsed this surface takes the window's top-left, and the
           traffic lights land on the way back. Step aside by what they overhang */
        startInset={layout.railCollapsed ? WINDOW_BUTTONS_OVERHANG : undefined}
        lead={
          <IconButton
            title={t('projectDetail.back')}
            icon={<ArrowLeft size={ICON.md} {...iconProps} />}
            onClick={onBack}
          />
        }
        actions={
          <>
            <Button
              title={t('projectDetail.openTerminalTitle')}
              startIcon={<Terminal size={ICON.sm} {...iconProps} />}
              onClick={() =>
                void window.quuu.open.terminal({ kind: 'project', id: project.id })
              }
            >
              {t('projectDetail.openTerminal')}
            </Button>
            <Button
              title={t('projectDetail.revealTitle')}
              startIcon={<FolderOpen size={ICON.sm} {...iconProps} />}
              onClick={() => void window.quuu.system.reveal(project.path)}
            >
              {t('projectDetail.reveal')}
            </Button>
            <Button
              variant="ghost" color="error"
              onClick={() => confirmDeleteProject(project)}
            >
              {t('projectDetail.delete')}
            </Button>
          </>
        }
      >
        <Section title={t('projectDetail.basicsSection')}>
          <Field label={t('projectDetail.name')} width="md">
            {/*
              Uncontrolled and written only on blur, so nothing is written back mid-typing.
              The cost is that **the field keeps the old value when the project changes**,
              so it is rebuilt by id. Open a second project's settings right after the first
              and the name field still held the previous name — touching and leaving it fired
              a rename (that actually happened).
            */}
            <TextInput
              key={project.id}
              defaultValue={project.name}
              onBlur={(e) => update({ name: e.target.value.trim() || project.name })}
            />
          </Field>

          <Field label={t('projectDetail.directory')} width="full">
            <Row>
              <TextInput mono value={project.path} readOnly />
              <Button
                title={t('projectDetail.repickDirectory')}
                onClick={() =>
                  void window.quuu.system.pickDirectory().then((path) => {
                    if (path) update({ path })
                  })
                }
              >
                {t('projectDetail.change')}
              </Button>
            </Row>
          </Field>

          {/*
            The IDE differs per language (GoLand for Go, Xcode for iOS), so this is
            normally where the app to open in is decided. Empty follows the app settings
          */}
          <Field label={t('projectDetail.editor')} width="md">
            <Select
              aria-label={t('projectDetail.editor')}
              value={project.editorApp}
              onChange={(e) => update({ editorApp: e.target.value })}
              options={[
                {
                  value: '',
                  // While inheriting, show the **result** (same treatment as the commit identity)
                  label: settings.editorApp
                    ? t('projectDetail.inheritEditor', { name: editorAppName(settings.editorApp, editors) })
                    : t('projectDetail.inheritEditorUnset')
                },
                ...editors.map((editor) => ({ value: editor.path, label: editor.name })),
                ...(project.editorApp.length > 0 &&
                  !editors.some((e) => e.path === project.editorApp)
                  ? [
                    {
                      value: project.editorApp,
                      label: editorAppName(project.editorApp, editors)
                    }
                  ]
                  : [])
              ]}
            />
          </Field>

          <Field label={t('projectDetail.color')}>
            <SwatchGroup
              label={t('projectDetail.color')}
              colors={PROJECT_COLORS}
              value={project.color}
              onChange={(color) => update({ color })}
            />
          </Field>
        </Section>

        <Section title={t('projectDetail.runSection')}>
          <Field label={t('projectDetail.target')} width="md">
            <Select
              aria-label={t('projectDetail.target')}
              value={targetValue}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':')
                update({ targetKind: kind === 'group' ? 'group' : 'agent', targetId: id || null })
              }}
              options={[
                { value: '', label: t('projectDetail.unassigned') },
                ...groups.map((g) => ({
                  value: `group:${g.id}`,
                  label: g.name,
                  group: t('projectDetail.groupsGroup')
                })),
                ...agents.map((a) => ({
                  value: `agent:${a.id}`,
                  label: a.name,
                  group: t('projectDetail.agentsGroup')
                }))
              ]}
            />
          </Field>

          <Row align="start">
            {/* Lower goes first. Riding on ranking, an order everyone already knows (1st
                comes first), saves writing out "lower numbers are worked through first" */}
            <Field label={t('projectDetail.priority')} width="xs">
              <TextInput
                key={project.id}
                type="number"
                unit={t('projectDetail.priorityUnit')}
                inputProps={{ min: 0, max: 99 }}
                defaultValue={project.priority}
                onBlur={(e) => update({ priority: Math.max(0, Number(e.target.value)) })}
              />
            </Field>
            <Field label={t('projectDetail.maxConcurrent')} width="xs">
              <TextInput
                key={project.id}
                type="number"
                unit={t('projectDetail.maxConcurrentUnit')}
                inputProps={{ min: 1, max: 8 }}
                defaultValue={project.maxConcurrent}
                onBlur={(e) => update({ maxConcurrent: Math.max(1, Number(e.target.value)) })}
              />
            </Field>
          </Row>

          <Checkbox
            label={t('projectDetail.enabled')}
            checked={project.enabled}
            onChange={(v: boolean) => update({ enabled: v })}
          />
        </Section>

        {/*
          Only shown while reports are on app-wide. A switch for "not for this project" that
          appears before the feature exists reads as a way to turn the feature on, and pressing
          it would do nothing
        */}
        {settings.reportEnabled && (
          <Section title={t('projectDetail.reportSection')}>
            <Checkbox
              label={t('projectDetail.reportEnabled')}
              checked={project.reportEnabled}
              onChange={(v: boolean) => update({ reportEnabled: v })}
            />
          </Section>
        )}

        <Section title={t('projectDetail.identitySection')}>
          <Field label={t('projectDetail.identityMode')} width="md">
            <Select
              aria-label={t('projectDetail.identityMode')}
              value={project.commitIdentityMode}
              onChange={(e) => update({ commitIdentityMode: e.target.value })}
              options={COMMIT_IDENTITY_MODES.map((m) => ({
                value: m,
                label: COMMIT_IDENTITY_MODE_LABEL[m]
              }))}
            />
          </Field>

          {/*
            While inheriting, show the **result**. If it was never filled in on the app side
            this comes up empty, so "I thought I set it, but nothing is signing" is visible
          */}
          {project.commitIdentityMode === 'inherit' && (
            <CommitIdentityReadout identity={identityPreview?.resolved ?? null} />
          )}
          {project.commitIdentityMode === 'custom' && (
            <CommitIdentityPanel
              key={project.id}
              value={project.commitIdentity}
              onChange={(v) => update({ commitIdentity: v })}
            />
          )}
        </Section>

        <TaskRuleList project={project} onEdit={setEditingRuleId} />
      </Page>
    </Panel>
  )
}
