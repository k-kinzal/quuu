import { Dot, SearchPicker, type SearchPickerProps } from '@design-system/react'
import { useMemo } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import { t } from '../model/i18n/index.js'
import { projectOptions } from '../model/projectOptions.js'

export function ProjectSelect({ projects, ...props }: Omit<SearchPickerProps, 'label' | 'emptyLabel' | 'options'> & { projects: Project[] }): JSX.Element {
  const options = useMemo(() => projectOptions(projects).map((project) => ({
    value: project.id, label: project.name, description: project.path, icon: <Dot color={project.color} />
  })), [projects])
  return <SearchPicker {...props} options={options} label={t('projectSelect.label')} placeholder={t('projectSelect.placeholder')} emptyLabel={t('projectSelect.empty')} />
}
