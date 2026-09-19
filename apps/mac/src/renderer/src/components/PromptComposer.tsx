import {
  Composer, ComposerActions, ComposerBox, ComposerInput, ComposerOptions, ComposerSubject, ComposerToolbar,
  ContextChip, Dot, PlainInput, SegmentedControl, Text, claimContextMenu, resizeInput, useTheme
} from '@design-system/react'
import { useLayoutEffect, type ComponentPropsWithRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { Priority } from '../../../preload/api/tasks.js'
import { pathItems } from '../interaction/contextMenu.js'
import { pane } from '../interaction/focus.js'
import { contextMenu } from '../interaction/menu.js'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL } from '../model/labels.js'
import { Bot, ICON, iconProps } from '../ui/icons.js'

/** Creation and follow-ups are the same input; their owners supply the values and allowed actions. */
export function PromptComposer({
  label, busy, subject, inputRef, input, project, onPickProject, projectPickerOpen,
  agent, priority, onPriorityChange, conditions, notice, errors, actions, children
}: {
  label: string
  busy: boolean
  subject?: ComponentPropsWithRef<'input'>
  inputRef: RefObject<HTMLTextAreaElement>
  input: ComponentPropsWithoutRef<'textarea'>
  project: Project | undefined
  onPickProject?(event: React.MouseEvent<HTMLElement>): void
  projectPickerOpen?: boolean
  agent: ReactNode
  priority: Priority
  onPriorityChange(value: Priority): void
  conditions?: ReactNode
  notice?: ReactNode
  errors?: ReactNode
  actions: ReactNode
  children?: ReactNode
}): JSX.Element {
  const theme = useTheme()
  // Restored drafts and live typing must grow identically on both surfaces.
  useLayoutEffect(() => resizeInput(inputRef.current, 'message'), [input.value, inputRef])
  return <Composer {...pane('composer')} aria-label={label}>
    <ComposerBox busy={busy}>
      {subject && <ComposerSubject>
        <Text size="xs" tone="tertiary">{t('taskComposer.titleLabel')}</Text>
        <PlainInput type="text" textSize="md" spellCheck={false}
          aria-label={t('taskComposer.titleLabel')} {...subject} />
      </ComposerSubject>}
      {notice}
      <ComposerInput rows={1} spellCheck={false} aria-label={t('composer.pane')}
        data-pane-focus="" {...input} ref={inputRef} />
      {errors}
      <ComposerToolbar>
        <ComposerOptions>
          <ContextChip icon={project && <Dot color={project.color} />} title={project?.path}
            onClick={onPickProject}
            aria-haspopup={onPickProject ? 'listbox' : undefined}
            aria-expanded={onPickProject ? projectPickerOpen : undefined}
            onContextMenu={project ? event => {
              if (claimContextMenu(event)) void contextMenu(pathItems(project.path, t('composer.workingDirectory')))
            } : undefined}
          >{project?.name ?? t('composer.unassigned')}</ContextChip>
          {agent}
          <SegmentedControl<Priority> label={t('taskComposer.priority')} value={priority}
            onChange={onPriorityChange}
            options={([0, 1, 2, 3] as Priority[]).map(value => ({
              value, label: PRIORITY_LABEL[value],
              title: t('taskComposer.priorityTitle', { level: PRIORITY_LABEL[value] }),
              accent: value <= 1 ? theme.palette.quuu.priority[value] : undefined
            }))} />
          {conditions}
        </ComposerOptions>
        <ComposerActions>{actions}</ComposerActions>
      </ComposerToolbar>
      {children}
    </ComposerBox>
  </Composer>
}

/** A decided target keeps its name and position, but offers no picker. */
export function PromptAgentChip({ label, onClick, open }: {
  label: string
  onClick?(event: React.MouseEvent<HTMLElement>): void
  open?: boolean
}): JSX.Element {
  return <ContextChip icon={<Bot size={ICON.sm} {...iconProps} />}
    title={t('taskComposer.agentTitle', { name: label })} onClick={onClick}
      aria-haspopup={onClick ? 'listbox' : undefined} aria-expanded={onClick ? open : undefined}
  >{label}</ContextChip>
}
