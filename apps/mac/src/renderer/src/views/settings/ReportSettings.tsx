import { Checkbox, Field, FieldHint, Page, Section, Select, TextArea } from '@design-system/react'
import { userAgents } from '../../model/agents.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'

/**
 * Settings > Report.
 *
 * A report is one agent run per review, so the feature waits to be turned on and waits to be
 * told who writes it. **Who writes is a real choice**: the ones doing the work are busy, and
 * this is the job to hand to whichever is idle. A group is offered beside the single agents for
 * exactly that reason — it names the idle one at the moment a report is due, rather than making
 * someone pick again every time the busy one changes.
 *
 * The instructions field is the surface that matters. What belongs in a report is still being
 * found out, and the answer lives in the prompt — leaving it editable is what lets that be
 * worked on without a rebuild between attempts.
 */
export function ReportSettings(): JSX.Element {
  const settings = useSettings()
  const snapshot = useStore((s) => s.snapshot)
  const setSettings = useStore((s) => s.setSettings)
  const agents = userAgents(snapshot?.agents ?? []).filter((agent) => agent.enabled)
  const groups = snapshot?.groups ?? []
  const target = settings.reportTargetId
    ? `${settings.reportTargetKind}:${settings.reportTargetId}`
    : ''

  return (
    <Page title={t('reportSettings.title')}>
      <Section title={t('reportSettings.generationSection')}>
        <Checkbox
          label={t('reportSettings.enabled')}
          checked={settings.reportEnabled}
          onChange={(v: boolean) => void setSettings({ reportEnabled: v })}
        />
        <Field label={t('reportSettings.target')} width="md">
          <Select
            aria-label={t('reportSettings.target')}
            value={target}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':')
              void setSettings({
                reportTargetKind: kind === 'group' ? 'group' : 'agent',
                reportTargetId: id ?? ''
              })
            }}
            options={[
              { value: '', label: t('reportSettings.unset') },
              ...groups.map((group) => ({
                value: `group:${group.id}`,
                label: group.name,
                group: t('reportSettings.groupsGroup')
              })),
              ...agents.map((agent) => ({
                value: `agent:${agent.id}`,
                label: agent.name,
                group: t('reportSettings.agentsGroup')
              }))
            ]}
          />
        </Field>
        {settings.reportEnabled && settings.reportTargetId.length === 0 && (
          <FieldHint>{t('reportSettings.targetNeeded')}</FieldHint>
        )}
      </Section>

      <Section title={t('reportSettings.instructionsSection')}>
        <Field label={t('reportSettings.instructions')} width="full">
          <TextArea
            rows={8}
            placeholder={t('reportSettings.instructionsPlaceholder')}
            value={settings.reportInstructions}
            onChange={(e) => void setSettings({ reportInstructions: e.target.value })}
          />
        </Field>
      </Section>
    </Page>
  )
}
