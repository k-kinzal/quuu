import {
  Button,
  Checkbox,
  Field,
  FieldHint,
  NumberInput,
  Page,
  Row,
  Section,
  Select
} from '@design-system/react'
import { useEffect, useState } from 'react'
import { CommitIdentityPanel } from '../../components/CommitIdentity.js'
import { usePreview } from '../../interaction/usePreview.js'
import { editorAppName } from '../../model/editorName.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > General.
 *
 * **A settings surface is not a manual.** It only lays out what can be changed.
 * The conditions for picking up work (queued? past its scheduled time? prerequisites
 * finished?) and the safety of importing live in docs/03-architecture.md and the README;
 * copying them here adds no settings. Copying them is exactly how this surface ended up
 * with more text to read than controls to touch.
 *
 * **State promises through shape, not prose.** "0 means all time" isn't a footnote —
 * the empty field's placeholder ("all time") says it. Never add prose explaining a
 * magic number.
 */
export function GeneralSettings(): JSX.Element {
  const settings = useSettings()
  const identityPreview = usePreview(JSON.stringify(settings.commitIdentity), () => window.quuu.settings.previewIdentity({ identity: settings.commitIdentity })).value
  const setSettings = useStore((s) => s.setSettings)

  return (
    <Page title={t('generalSettings.title')}>
      <Section title={t('generalSettings.schedulerSection')}>
        <Checkbox
          label={t('generalSettings.autoStart')}
          checked={settings.autoStartScheduler}
          onChange={(v: boolean) => void setSettings({ autoStartScheduler: v })}
        />
        <Checkbox
          label={t('generalSettings.keepRunning')}
          checked={settings.keepRunningInBackground}
          onChange={(v: boolean) => void setSettings({ keepRunningInBackground: v })}
        />
        <Field label={t('generalSettings.tickInterval')} width="xs">
          <NumberInput
            min={500}
            step={500}
            unit="ms"
            value={settings.tickIntervalMs}
            onChange={(v) => void setSettings({ tickIntervalMs: v })}
          />
        </Field>
      </Section>

      <Section title={t('generalSettings.importSection')}>
        <Checkbox
          label={t('generalSettings.importExternal')}
          checked={settings.importExternalSessions}
          onChange={(v: boolean) => void setSettings({ importExternalSessions: v })}
        />
        <Checkbox
          label={t('generalSettings.importCreateProjects')}
          checked={settings.importCreateProjects}
          onChange={(v: boolean) => void setSettings({ importCreateProjects: v })}
        />
        <Field label={t('generalSettings.historyDays')} width="xs">
          <NumberInput
            min={0}
            max={3650}
            unit={t('generalSettings.days')}
            zeroLabel={t('generalSettings.allTime')}
            value={settings.importHistoryDays}
            onChange={(v) => void setSettings({ importHistoryDays: v })}
          />
        </Field>
        <ImportNow />
      </Section>

      {/*
        Where a task's working directory opens. Each project can name a different one
        (the IDE differs per language, so that is normally decided over there)
      */}
      <Section title={t('generalSettings.editorSection')}>
        <EditorPicker />
      </Section>

      {/*
        Leave the agent's commits and GitHub actions under the GitHub App's bot identity.
        A project can opt out or use a different App (project settings)
      */}
      <Section title={t('generalSettings.identitySection')}>
        {/* Until an identity exists, don't show a toggle that would do nothing when switched on */}
        {identityPreview?.complete && (
          <Checkbox
            label={t('generalSettings.identityEnabled')}
            checked={settings.commitIdentityEnabled}
            onChange={(v: boolean) => void setSettings({ commitIdentityEnabled: v })}
          />
        )}
        <CommitIdentityPanel
          value={settings.commitIdentity}
          onChange={(v) => {
            void window.quuu.settings.setIdentity(v).then((settings) => useStore.setState({ settings }))
          }}
        />
      </Section>
    </Page>
  )
}

/**
 * The default app to open in.
 *
 * The options list **only what is installed** (found by scanning `/Applications`).
 * Making people type a name leaves them pointing at an app that isn't there, and
 * "pressing it doesn't open anything". Anything missing from the list is reached with
 * "Choose another app…", which points at the `.app` directly.
 */
function EditorPicker(): JSX.Element {
  const editors = useStore((s) => s.editors)
  const settings = useSettings()
  const setSettings = useStore((s) => s.setSettings)
  const refreshEditors = useStore((s) => s.refreshEditors)

  // Recount when settings open. This is also the surface you reach right after reinstalling an IDE
  useEffect(() => {
    void refreshEditors()
  }, [refreshEditors])

  const current = settings.editorApp
  const pick = async (): Promise<void> => {
    const path = await window.quuu.system.pickApplication()
    if (path) await setSettings({ editorApp: path })
  }

  return (
    <Field label={t('generalSettings.defaultApp')} width="lg">
      <Row>
        <Select
          aria-label={t('generalSettings.defaultApp')}
          value={current}
          onChange={(e) => void setSettings({ editorApp: e.target.value })}
          options={[
            { value: '', label: t('generalSettings.noApp') },
            ...editors.map((editor) => ({ value: editor.path, label: editor.name })),
            // While something outside the list is selected, keep that value itself as an option
            ...(current.length > 0 && !known(editors, current)
              ? [{ value: current, label: editorAppName(current, editors) }]
              : [])
          ]}
        />
        <Button title={t('generalSettings.pickAppTitle')} onClick={() => void pick()}>
          {t('generalSettings.pickApp')}
        </Button>
      </Row>
    </Field>
  )
}

function known(editors: { path: string }[], path: string): boolean {
  return editors.some((e) => e.path === path)
}

function ImportNow(): JSX.Element {
  // 'idle' and 'running' are states; anything else is a result message shown as-is
  const [state, setState] = useState<string>('idle')

  const run = async (): Promise<void> => {
    setState('running')
    try {
      const r = await window.quuu.importer.sync()
      // The result says numbers only. As prose, every press adds more text to read
      setState(t('generalSettings.importResult', { scanned: r.scanned, created: r.createdTasks, updated: r.updated }))
    } catch {
      setState(t('generalSettings.importFailed'))
    }
  }

  return (
    <Row>
      <Button disabled={state === 'running'} onClick={() => void run()}>
        {t('generalSettings.importNow')}
      </Button>
      {state !== 'idle' && state !== 'running' && <FieldHint>{state}</FieldHint>}
    </Row>
  )
}
