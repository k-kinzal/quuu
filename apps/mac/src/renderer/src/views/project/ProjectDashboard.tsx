import { Dot, IconButton, Panel, PanelHeader, PanelHeading, WindowDragArea } from '@design-system/react'
import { useCallback } from 'react'
import type { Project } from '../../../../api/schemas/projects.js'
import { ReportPage } from '../../components/ReportPage.js'
import { useProjectReport } from '../../interaction/useProjectReport.js'
import { t } from '../../model/i18n/index.js'
import { useStore } from '../../state/store.js'
import { ICON, RefreshCw, iconProps } from '../../ui/icons.js'

export function ProjectDashboard({ project }: { project: Project }): JSX.Element {
  const { report, generating, generate } = useProjectReport(project.id, true)
  const pushToast = useStore((s) => s.pushToast)
  const failed = useCallback((detail: string) => {
    pushToast({ id: `project-report-${project.id}`, level: 'error', message: t('projectDashboard.failed'), detail })
  }, [project.id, pushToast])
  return (
    <Panel surface="canvas" windowHeader grow>
      <PanelHeader>
        <Dot color={project.color} />
        <PanelHeading>{project.name}</PanelHeading>
        <WindowDragArea />
        <IconButton title={generating ? t('projectDashboard.generating') : t('projectDashboard.regenerate')}
          loading={generating} loadingAnimation="rotate" icon={<RefreshCw size={ICON.md} {...iconProps} />}
          onClick={() => void generate().then((result) => { if (!result.ok) failed(result.reason ?? '') })} />
      </PanelHeader>
      {report?.path && <ReportPage projectId={project.id} path={report.path} onError={failed} />}
    </Panel>
  )
}
