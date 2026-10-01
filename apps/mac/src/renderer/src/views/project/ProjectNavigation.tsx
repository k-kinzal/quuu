import { NavItem, NavSection, SideNav, SideNavTop } from '@design-system/react'
import { useEffect } from 'react'
import { pane } from '../../interaction/focus.js'
import type { Project } from '../../../../api/schemas/projects.js'
import { t } from '../../model/i18n/index.js'
import { useSettings, useStore } from '../../state/store.js'
import { BookOpen, Gauge, GitPullRequest, ICON, ListChecks, Settings, iconProps } from '../../ui/icons.js'

export function ProjectNavigation({ project }: { project: Project }): JSX.Element {
  const settings = useSettings()
  const documents = useStore((s) => s.projectDocumentsOpen)
  const openDocuments = useStore((s) => s.openProjectDocuments)
  const pullRequests = useStore((s) => s.projectPullRequestsOpen)
  const openPullRequests = useStore((s) => s.openProjectPullRequests)
  const dashboard = useStore((s) => s.projectDashboardOpen)
  const configuration = useStore((s) => s.projectSettingsOpen)
  const openDashboard = useStore((s) => s.openProjectDashboard)
  const openSettings = useStore((s) => s.openProjectSettings)
  const canReport = settings.reportEnabled && project.reportEnabled
  useEffect(() => {
    if (dashboard && !canReport) openDashboard(false)
  }, [canReport, dashboard, openDashboard])
  return (
    <SideNav collapsed surface="transparent" bordered={false} {...pane('projectNavigation')} aria-label={t('projectDashboard.navigation')}>
      <SideNavTop collapsed draggable />
      <NavSection>
        {canReport && <NavItem collapsed label={t('projectDashboard.title')}
          icon={<Gauge size={ICON.md} {...iconProps} />} active={dashboard}
          onClick={() => openDashboard(true)} />}
        <NavItem collapsed label={t('projectDashboard.tasks')}
          icon={<ListChecks size={ICON.md} {...iconProps} />} active={!documents && !pullRequests && !configuration && !(canReport && dashboard)}
          onClick={() => openDashboard(false)} />
        <NavItem collapsed label={t('projectPullRequests.title')}
          icon={<GitPullRequest size={ICON.md} {...iconProps} />} active={pullRequests}
          onClick={() => openPullRequests(true)} />
        <NavItem collapsed label={t('projectDocuments.title')}
          icon={<BookOpen size={ICON.md} {...iconProps} />} active={documents}
          onClick={() => openDocuments(true)} />
        <NavItem collapsed label={t('taskOverview.projectSettings')}
          icon={<Settings size={ICON.md} {...iconProps} />} active={configuration}
          onClick={() => openSettings(true)} />
      </NavSection>
    </SideNav>
  )
}
