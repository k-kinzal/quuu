import {
  Alert, DiffView, Dot, EditorPane, EmptyState, ExplorerLayout, ExplorerPane, IconButton, OverlayViewport,
  Panel, PanelHeader, PanelHeading, Text, TreeView, WindowDragArea, type TreeNode
} from '@design-system/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Project } from '../../../../api/schemas/projects.js'
import type { ReviewTreeNode } from '../../../../api/schemas/review.js'
import { pane } from '../../interaction/focus.js'
import { useExplorerWidth } from '../../interaction/useExplorerWidth.js'
import { t } from '../../model/i18n/index.js'
import { failureReason } from '../../model/operationFailure.js'
import { projectReviewTree, treeChange } from '../../model/reviewTree.js'
import { queryClient } from '../../state/queryClient.js'
import { ChevronDown, ChevronRight, FileText, FolderGit2, ICON, RefreshCw, iconProps } from '../../ui/icons.js'
import { changeLabel, changeTone } from '../../ui/workbench.js'

interface FileTarget { path: string; previousPath?: string }

// Selection belongs to this window; coming back to a project's files keeps the last one open.
const selections = new Map<string, FileTarget>()

function convert(nodes: ReviewTreeNode[], files: Map<string, FileTarget>): TreeNode[] {
  return nodes.map((node) => {
    const change = treeChange(node)
    const description = change ? changeLabel[change] : undefined
    if (node.kind === 'file') files.set(node.id, { path: node.path, previousPath: node.previousPath })
    return {
      id: node.id,
      label: node.name,
      title: [node.previousPath ? `${node.previousPath} → ${node.path}` : node.path, description].filter(Boolean).join(' · '),
      description,
      tone: change ? changeTone[change] : undefined,
      icon: node.kind === 'directory' ? <FolderGit2 size={ICON.sm} {...iconProps} /> : <FileText size={ICON.sm} {...iconProps} />,
      children: node.children ? convert(node.children, files) : undefined
    }
  })
}

/**
 * The project directory as it stands now, the same listing a task's Project tab shows for its own
 * workplace. A task's tab answers "what did this task do"; this answers "what is in the project".
 */
export function ProjectFiles({ project }: { project: Project }): JSX.Element {
  const explorer = useExplorerWidth('projectFiles')
  const [selection, setSelection] = useState<FileTarget | null>(selections.get(project.id) ?? null)
  const listing = useQuery({
    queryKey: ['project-files', project.id, project.path],
    queryFn: () => window.quuu.review.projectFiles(project.id, { context: { feedback: 'inline' } }),
    retry: false, networkMode: 'always'
  }, queryClient)
  const data = listing.data
  const built = useMemo(() => {
    const files = new Map<string, FileTarget>()
    return { nodes: data ? convert(projectReviewTree(data.tree, data.changes), files) : [], files }
  }, [data])
  const selectedId = selection ? [...built.files].find(([, file]) => file.path === selection.path)?.[0] ?? null : null
  const content = useQuery({
    // A new listing is a new look at the directory, so the open file is read again with it.
    queryKey: ['project-file', project.id, selection?.path, selection?.previousPath, listing.dataUpdatedAt],
    queryFn: () => window.quuu.review.projectFile({ projectId: project.id, ...selection! }, { context: { feedback: 'inline' } }),
    enabled: Boolean(selection && data), retry: false, networkMode: 'always'
  }, queryClient)
  const choose = (file: FileTarget): void => {
    selections.set(project.id, file)
    setSelection(file)
  }
  const refresh = (): void => void listing.refetch()

  return <Panel surface="canvas" windowHeader grow {...pane('projectFiles')} aria-label={t('projectFiles.title')}>
    <PanelHeader>
      <Dot color={project.color} /><PanelHeading>{t('projectFiles.title')}</PanelHeading>
      {data?.branch && <Text size="xs" tone="tertiary" mono truncate title={data.cwd}>{data.branch}</Text>}
      {data && data.changes.length > 0 && <Text size="xs" tone="secondary">{t('projectFiles.changes', { count: data.changes.length })}</Text>}
      <WindowDragArea />
      <IconButton title={t('projectFiles.refresh')} disabled={listing.isFetching}
        icon={<RefreshCw size={ICON.md} {...iconProps} />} onClick={refresh} />
    </PanelHeader>
    {listing.error ? <EmptyState title={t('projectFiles.failed')} action={{ label: t('projectFiles.retry'), onClick: refresh }}>{failureReason(listing.error)}</EmptyState>
      : !data ? <EmptyState title={t('projectFiles.loading')} />
        : built.nodes.length === 0 ? <EmptyState title={t('projectFiles.empty')} />
          : <ExplorerLayout>
            <ExplorerPane {...explorer} aria-label={t('projectFiles.tree')}>
              {/* A cut listing must say so. A tree that silently stops reads as the directory itself */}
              {data.truncated && <Alert tone="warning">{t('projectFiles.truncated')}</Alert>}
              <TreeView
                label={t('projectFiles.tree')}
                nodes={built.nodes}
                expandIcon={<ChevronRight size={ICON.sm} {...iconProps} />}
                collapseIcon={<ChevronDown size={ICON.sm} {...iconProps} />}
                selectedId={selectedId}
                onActivate={(node) => {
                  const file = built.files.get(node.id)
                  if (file) choose(file)
                }}
              />
            </ExplorerPane>
            <EditorPane aria-label={selection?.path ?? t('projectFiles.select')}>
              <PanelHeader>
                <PanelHeading title={selection?.path}>{selection?.path ?? t('projectFiles.select')}</PanelHeading><WindowDragArea />
              </PanelHeader>
              {!selection ? <EmptyState title={t('projectFiles.select')} />
                : content.error ? <Alert title={t('projectFiles.fileFailed')}>{failureReason(content.error)}</Alert>
                  : !content.data ? <EmptyState title={t('projectFiles.fileLoading')} />
                    : content.data.binary ? <EmptyState title={t('projectFiles.binary')} />
                      : <OverlayViewport><DiffView lines={content.data.diff} language={content.data.language} /></OverlayViewport>}
            </EditorPane>
          </ExplorerLayout>}
  </Panel>
}
