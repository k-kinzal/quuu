import { Dot, SearchPicker, type SearchPickerProps } from '@design-system/react'
import { useMemo } from 'react'
import type { Project } from '../../../api/schemas/projects.js'
import { t } from '../model/i18n/index.js'
import { projectOptions } from '../model/projectOptions.js'

export function ProjectSelect({ projects, recentRunCounts, ...props }: Omit<SearchPickerProps, 'label' | 'emptyLabel' | 'options'> & {
  projects: Project[]
  recentRunCounts?: Readonly<Record<string, number>>
}): JSX.Element {
  const options = useMemo(() => projectOptions(projects, recentRunCounts).map((project) => ({
    value: project.id, label: project.name, description: project.path, icon: <Dot color={project.color} />
  })), [projects, recentRunCounts])
  return <SearchPicker {...props} options={options} label={t('projectSelect.label')} placeholder={t('projectSelect.placeholder')} emptyLabel={t('projectSelect.empty')} />
}
