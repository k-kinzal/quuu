import { ProjectRunnerSettings } from './ProjectRunnerSettings.js'
import { HookEditor } from '../../components/HookEditor.js'
import type { Project } from '../../../../api/schemas/projects.js'
import { ProjectTargetSelect } from '../../components/ProjectTargetSelect.js'
import { COMMIT_IDENTITY_MODES } from '../../model/identityOptions.js'

import { COMMIT_IDENTITY_MODE_LABEL, PULL_REQUEST_PROMPT_MODE_LABEL } from '../../model/labels.js'
import { PULL_REQUEST_PROMPT_MODES } from '../../model/pullRequestPrompts.js'
import { PROJECT_COLORS } from '../../model/projectDefaults.js'

import {
  Button,
  SettingToggle,
  SettingsBlock,
  InputAction,
  SettingRow,
  IconButton,
  Page,
  Panel,
  SettingsGroup,
  Select,
  SwatchGroup,
  TextInput
} from '@design-system/react'
import { CommitIdentityPanel, CommitIdentityReadout } from '../../components/CommitIdentity.js'
import { PullRequestPromptFields } from '../../components/PullRequestPromptFields.js'
import { pane } from '../../interaction/focus.js'
import { confirmDeleteProject } from '../../interaction/projectActions.js'
import { usePreview } from '../../interaction/usePreview.js'
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
  // projectActions owns the cleanup after a delete (where to move the visible surface), so no setSection here
  const editingRuleId = useStore((s) => s.editingRuleId)
  const editRule = useStore((s) => s.editRule)
  const editingRule = (snapshot?.rules ?? []).find((r) => r.id === editingRuleId && r.projectId === project.id) ?? null

  const update = (patch: Partial<Project>): void => {
    void window.quuu.projects.update({ id: project.id, patch: patch })
  }

  if (editingRule) {
    return <TaskRuleEditor key={editingRule.id} rule={editingRule} onBack={() => editRule(null)} />
  }

  // The surface is as long as the project has settings, so it is the one scrolling region here
  return (
    <Panel surface="canvas" grow scroll {...pane('settings', { tab: true })} aria-label={t('projectDetail.paneLabel')}>
      <Page
        title={t('projectDetail.title', { name: project.name })}
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
            {/* Built in: the operation refuses it too, so the button would only lead to an error */}
            {!project.builtIn && (
              <Button
                variant="ghost" color="error"
                onClick={() => confirmDeleteProject(project)}
              >
                {t('projectDetail.delete')}
              </Button>
            )}
          </>
        }
      >
        <SettingsGroup title={t('projectDetail.basicsSection')}>
          <SettingRow label={t('projectDetail.name')} width="md">
            {/*
              Uncontrolled and written only on blur, so nothing is written back mid-typing.
              The cost is that **the field keeps the old value when the project changes**,
              so it is rebuilt by id. Open a second project's settings right after the first
              and the name field still held the previous name — touching and leaving it fired
              a rename (that actually happened).
            */}
            <TextInput
              key={project.id}
              aria-label={t('projectDetail.name')}
              defaultValue={project.name}
              onBlur={(e) => update({ name: e.target.value.trim() || project.name })}
            />
          </SettingRow>

          <SettingRow label={t('projectDetail.directory')} width="full" layout="stacked" hint={project.builtIn ? t('projectDetail.builtInDirectory') : undefined}>
            <InputAction>
              <TextInput mono value={project.path} readOnly />
              {!project.builtIn && <Button
                title={t('projectDetail.repickDirectory')}
                onClick={() =>
                  void window.quuu.system.pickDirectory().then((path) => {
                    if (path) update({ path })
                  })
                }
              >
                {t('projectDetail.change')}
              </Button>}
            </InputAction>
          </SettingRow>

          {/*
            The IDE differs per language (GoLand for Go, Xcode for iOS), so this is
            normally where the app to open in is decided. Empty follows the app settings
          */}
          <SettingRow label={t('projectDetail.editor')} width="md">
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
          </SettingRow>

          <SettingRow label={t('projectDetail.color')} width="auto">
            <SwatchGroup
              label={t('projectDetail.color')}
              colors={PROJECT_COLORS}
              value={project.color}
              onChange={(color) => update({ color })}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t('projectDetail.runSection')}>
          <SettingRow label={t('projectDetail.target')} width="md">
            <ProjectTargetSelect project={project} onChange={update} />
          </SettingRow>

          <>
            {/* Lower goes first. Riding on ranking, an order everyone already knows (1st
                comes first), saves writing out "lower numbers are worked through first" */}
            <SettingRow label={t('projectDetail.priority')} width="xs">
              <TextInput
                key={project.id}
                type="number"
                unit={t('projectDetail.priorityUnit')}
                aria-label={t('projectDetail.priority')}
                inputProps={{ min: 0, max: 99 }}
                defaultValue={project.priority}
                onBlur={(e) => update({ priority: Math.max(0, Number(e.target.value)) })}
              />
            </SettingRow>
            <SettingRow label={t('projectDetail.maxConcurrent')} width="xs">
              <TextInput
                key={project.id}
                type="number"
                unit={t('projectDetail.maxConcurrentUnit')}
                aria-label={t('projectDetail.maxConcurrent')}
                inputProps={{ min: 1, max: 8 }}
                defaultValue={project.maxConcurrent}
                onBlur={(e) => update({ maxConcurrent: Math.max(1, Number(e.target.value)) })}
              />
            </SettingRow>
          </>

          <SettingToggle
            label={t('projectDetail.enabled')}
            checked={project.enabled}
            onChange={(v: boolean) => update({ enabled: v })}
          />
        </SettingsGroup>

        <ProjectRunnerSettings key={`runner:${project.id}`} project={project} />
        <HookEditor key={`hooks:${project.id}`} project={project} />

        {/*
          Only shown while reports are on app-wide. A switch for "not for this project" that
          appears before the feature exists reads as a way to turn the feature on, and pressing
          it would do nothing
        */}
        {settings.reportEnabled && (
          <SettingsGroup title={t('projectDetail.reportSection')}>
            <SettingToggle
              label={t('projectDetail.reportEnabled')}
              checked={project.reportEnabled}
              onChange={(v: boolean) => update({ reportEnabled: v })}
            />
          </SettingsGroup>
        )}

        {/* The built-in workspace is not a repository; its worktrees stay off */}
        {!project.builtIn && (
          <SettingsGroup title={t('worktreeSettings.title')}>
            <SettingRow label={t('worktreeSettings.mode')} hint={project.worktreeMode === 'inherit' ? t(settings.worktreeEnabled ? 'worktreeSettings.on' : 'worktreeSettings.off') : undefined} width="md">
              <Select aria-label={t('worktreeSettings.mode')} value={project.worktreeMode}
                onChange={(event) => update({ worktreeMode: event.target.value })}
                options={(['inherit', 'on', 'off'] as const).map(value => ({ value, label: t(`worktreeSettings.${value}`) }))} />
            </SettingRow>
          </SettingsGroup>
        )}

        <SettingsGroup contained={false} title={t('projectDetail.pullRequestSection')}>
          <SettingsGroup><SettingRow label={t('projectDetail.pullRequestMode')} width="md">
            <Select
              aria-label={t('projectDetail.pullRequestMode')}
              value={project.pullRequestPromptMode}
              onChange={(e) => update({ pullRequestPromptMode: e.target.value })}
              options={PULL_REQUEST_PROMPT_MODES.map((m) => ({
                value: m,
                label: PULL_REQUEST_PROMPT_MODE_LABEL[m]
              }))}
            />
          </SettingRow>
          </SettingsGroup>
          {project.pullRequestPromptMode === 'custom' && (
            <PullRequestPromptFields id={project.id} values={project} controlled={false} onChange={update} />
          )}
        </SettingsGroup>

        <SettingsGroup title={t('projectDetail.identitySection')}>
          <SettingRow label={t('projectDetail.identityMode')} width="md">
            <Select
              aria-label={t('projectDetail.identityMode')}
              value={project.commitIdentityMode}
              onChange={(e) => update({ commitIdentityMode: e.target.value })}
              options={COMMIT_IDENTITY_MODES.map((m) => ({
                value: m,
                label: COMMIT_IDENTITY_MODE_LABEL[m]
              }))}
            />
          </SettingRow>

          {/*
            While inheriting, show the **result**. If it was never filled in on the app side
            this comes up empty, so "I thought I set it, but nothing is signing" is visible
          */}
          {project.commitIdentityMode === 'inherit' && (
            <SettingsBlock><CommitIdentityReadout identity={identityPreview?.resolved ?? null} /></SettingsBlock>
          )}
          {project.commitIdentityMode === 'custom' && (
            <SettingsBlock><CommitIdentityPanel
              key={project.id}
              value={project.commitIdentity}
              onChange={(v) => update({ commitIdentity: v })}
            /></SettingsBlock>
          )}
        </SettingsGroup>

        <TaskRuleList project={project} onEdit={editRule} />
      </Page>
    </Panel>
  )
}
