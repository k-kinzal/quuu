import { Badge, ItemBody, ItemGroupHeader, ItemList, ItemMeta, ItemRow, ItemSubline, SupportingText, Text } from '@design-system/react'
import { focusPane } from '../interaction/focus.js'
import { t } from '../model/i18n/index.js'
import { ruleScheduleLabel } from '../model/ruleSchedule.js'
import { useStore } from '../state/store.js'

/** Definitions stay below the working queue, regardless of its sort or status filter. */
export function RecurringTasks(): JSX.Element | null {
  const snapshot = useStore((s) => s.snapshot)
  const section = useStore((s) => s.section)
  const projectIds = useStore((s) => s.filters.projectIds)
  const editRule = useStore((s) => s.editRule)
  if (section.kind === 'review' || section.kind === 'settings') return null
  const projects = snapshot?.projects ?? []
  const rules = (snapshot?.rules ?? []).filter((rule) =>
    projects.some((project) => project.id === rule.projectId) &&
    (section.kind === 'project' ? rule.projectId === section.id : projectIds.length === 0 || projectIds.includes(rule.projectId))
  )
  if (rules.length === 0) return null
  return (
    <ItemList scroll={false} role="region" aria-label={t('taskRules.recurringSection')}>
      <ItemGroupHeader surface="transparent">
        {t('taskRules.recurringSection')}
        <SupportingText tabular>{rules.length}</SupportingText>
      </ItemGroupHeader>
      {rules.map((rule) => (
        <ItemRow key={rule.id} lines={2} title={rule.name} onClick={() => {
          editRule(rule.id)
          requestAnimationFrame(() => focusPane('settings'))
        }}>
          <ItemBody>
            <Text truncate tone="secondary">{rule.name}</Text>
            <ItemSubline>
              <Text truncate size="xs" tone="tertiary">
                {[section.kind === 'all' ? projects.find((p) => p.id === rule.projectId)?.name : null,
                  ruleScheduleLabel(rule), rule.whenIdle ? t('taskRules.whenIdle') : null].filter(Boolean).join(' · ')}
              </Text>
            </ItemSubline>
          </ItemBody>
          {!rule.enabled && <ItemMeta><Badge>{t('taskRules.disabledBadge')}</Badge></ItemMeta>}
        </ItemRow>
      ))}
    </ItemList>
  )
}
