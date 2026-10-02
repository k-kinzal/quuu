import {
  claimContextMenu, Button, Dot, EditorPane, EmptyState, ExplorerLayout, ExplorerPane, IconButton, ItemGroupHeader,
  FilterChip, ItemList, Menu, Panel, PanelHeader, PanelHeading, ResourceItem, SearchInput, Toolbar, WindowDragArea, useMenu, type MenuItemSpec
} from '@design-system/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../../../api/schemas/projects.js'
import type { ProjectPullRequest } from '../../../../api/schemas/review.js'
import { PullRequestBrowser } from '../../components/PullRequestBrowser.js'
import { copyText, selectionItems } from '../../interaction/contextMenu.js'
import { pane } from '../../interaction/focus.js'
import { useGitHubWebSignIn } from '../../interaction/useGitHubWebSignIn.js'
import { contextMenu } from '../../interaction/menu.js'
import { t } from '../../model/i18n/index.js'
import { failureReason } from '../../model/operationFailure.js'
import { countByState, DEFAULT_STATE_FILTER, groupProjectPullRequests, STATE_ORDER, type PullRequestStateFilter } from '../../model/projectPullRequests.js'
import { queryClient } from '../../state/queryClient.js'
import { useStore } from '../../state/store.js'
import { ExternalLink, ICON, ListChecks, RefreshCw, iconProps } from '../../ui/icons.js'
import { CheckDot, PullRequestStateMark } from '../../ui/workbench.js'

// Selection and filter belong to this window; coming back to a project's Pull Requests keeps both.
const selections = new Map<string, string>()
const filters = new Map<string, PullRequestStateFilter>()

const STATE_LABEL = {
  open: t('projectPullRequests.state.open'),
  merged: t('projectPullRequests.state.merged'),
  closed: t('projectPullRequests.state.closed')
}
const CONFLICTING = t('workbench.mergeState.conflicting')

/** Main keeps one native page per id; the project's list has its own, apart from any task's tabs. */
const viewId = (url: string): string => `project-pull-request:${url}`

export function ProjectPullRequests({ project }: { project: Project }): JSX.Element {
  const [selection, setSelection] = useState(selections.get(project.id) ?? '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PullRequestStateFilter>(filters.get(project.id) ?? DEFAULT_STATE_FILTER)
  const stateMenu = useMenu()
  const opened = useRef(new Set<string>())
  const pushToast = useStore(s => s.pushToast)
  const openTask = useStore(s => s.openTask)
  const github = useGitHubWebSignIn()
  const list = useQuery({
    queryKey: ['project-pull-requests', project.id],
    queryFn: () => window.quuu.review.projectPullRequests(project.id, { context: { feedback: 'inline' } }),
    // Only the saved reviews are read; the tasks' own refreshes keep them current.
    refetchInterval: state => state.state.status === 'error' ? false : 3000,
    retry: false, networkMode: 'always'
  }, queryClient)
  const refresh = useMutation({
    mutationFn: () => window.quuu.review.refreshProjectPullRequests(project.id),
    onSuccess: value => queryClient.setQueryData(['project-pull-requests', project.id], value),
    onError: error => pushToast({ id: 'project-pull-requests', level: 'warn', message: t('projectPullRequests.refreshFailed'), detail: failureReason(error) })
  }, queryClient)
  const { mutate: refreshNow } = refresh
  // CI on an open one may have moved since its task was last looked at.
  useEffect(() => refreshNow(), [refreshNow])
  useEffect(() => () => {
    for (const id of opened.current) void window.quuu.review.closePullRequest(id)
    opened.current.clear()
  }, [])

  const pullRequests = useMemo(() => list.data ?? [], [list.data])
  const groups = useMemo(() => groupProjectPullRequests(pullRequests, search, filter), [pullRequests, search, filter])
  const counts = useMemo(() => countByState(pullRequests), [pullRequests])
  const pickFilter = (next: PullRequestStateFilter): void => {
    filters.set(project.id, next)
    setFilter(next)
  }
  const byUrl = useMemo(() => new Map(pullRequests.map(pr => [pr.url, pr])), [pullRequests])
  const selected = byUrl.get(selection) ?? null
  const choose = useCallback((url: string): void => {
    selections.set(project.id, url)
    setSelection(url)
  }, [project.id])
  useEffect(() => { if (selected) opened.current.add(viewId(selected.url)) }, [selected])

  const items = (pr: ProjectPullRequest): MenuItemSpec[] => [
    ...selectionItems(),
    ...pr.tasks.map(task => ({ label: t('projectPullRequests.openTask', { title: task.title }), onSelect: () => void openTask(task.id) })),
    { label: t('reviewPane.openInBrowser'), onSelect: () => void window.quuu.system.openExternal(pr.url), separatorBefore: true },
    { label: t('reviewPane.copyLink'), onSelect: () => copyText(pr.url) }
  ]
  const reportError = useCallback((reason: string): void => {
    pushToast({ id: `project-pull-${Date.now()}`, level: 'warn', message: t('reviewPane.pullRejected'), detail: reason })
  }, [pushToast])

  return <Panel surface="canvas" windowHeader grow {...pane('pullRequests')} aria-label={t('projectPullRequests.title')}>
    <PanelHeader>
      <Dot color={project.color} /><PanelHeading count={pullRequests.length}>{t('projectPullRequests.title')}</PanelHeading>
      <WindowDragArea />
      {github.signedIn === false && <Button size="xs" disabled={github.busy} onClick={github.signIn}>{t('githubWeb.signIn')}</Button>}
      <IconButton title={t('projectPullRequests.refresh')} disabled={refresh.isPending}
        icon={<RefreshCw size={ICON.md} {...iconProps} />} onClick={() => refresh.mutate()} />
    </PanelHeader>
    {list.error ? <EmptyState title={t('projectPullRequests.failed')} action={{ label: t('projectPullRequests.retry'), onClick: () => void list.refetch() }}>{failureReason(list.error)}</EmptyState>
      : !list.data ? <EmptyState title={t('projectPullRequests.loading')} />
        : pullRequests.length === 0 ? <EmptyState title={refresh.isPending ? t('projectPullRequests.loading') : t('projectPullRequests.empty')} />
          : <ExplorerLayout>
            <ExplorerPane aria-label={t('projectPullRequests.title')}>
              {/*
                * The state chip on a row of its own above the search: the search box keeps its width, and four
                * segments or a chip beside it both ran past the edge of a narrow list pane.
                */}
              <Toolbar placement="panel">
                <FilterChip label={t('projectPullRequests.filter')} value={filter === 'all' ? undefined : STATE_LABEL[filter]}
                  title={t('projectPullRequests.filterTitle')} aria-haspopup="menu" aria-expanded={stateMenu.isOpen}
                  onClick={stateMenu.open} />
              </Toolbar>
              <Toolbar placement="panel"><SearchInput aria-label={t('projectPullRequests.search')} placeholder={t('projectPullRequests.search')}
                value={search} onChange={event => setSearch(event.target.value)} /></Toolbar>
              <Menu open={stateMenu.isOpen} anchorEl={stateMenu.anchorEl} onClose={stateMenu.close} label={t('projectPullRequests.filterTitle')}
                items={() => [...STATE_ORDER, 'all' as const].map((state, index) => ({
                  label: `${state === 'all' ? t('projectPullRequests.all') : STATE_LABEL[state]} ${String(counts[state])}`,
                  checked: filter === state, separatorBefore: state === 'all' && index > 0,
                  onSelect: () => pickFilter(state)
                }))} />
              <ItemList aria-label={t('projectPullRequests.title')}>
                {groups.map(group => <Fragment key={group.state}>
                  {/* A single state needs no heading: the filter above already names it */}
                  {filter === 'all' && <ItemGroupHeader>{STATE_LABEL[group.state]}</ItemGroupHeader>}
                  {group.pullRequests.map(pr => <ResourceItem key={pr.url} selected={selected?.url === pr.url}
                    aria-current={selected?.url === pr.url ? 'page' : undefined} title={`${pr.headRefName} → ${pr.baseRefName}`}
                    onClick={() => choose(pr.url)}
                    onContextMenu={event => { if (claimContextMenu(event)) void contextMenu(items(pr)) }}
                    icon={<PullRequestStateMark state={pr.state} />}
                    // CI as one circle at the end; nothing while no check reports.
                    meta={pr.check === 'neutral' ? undefined : <CheckDot status={pr.check} />}
                    label={`#${String(pr.number)} ${pr.title}`}
                    description={[...(pr.state === 'open' && pr.mergeState === 'conflicting' ? [CONFLICTING] : []), ...pr.tasks.map(task => task.title)].join(' · ')} />)}
                </Fragment>)}
                {groups.length === 0 && <EmptyState title={t('projectPullRequests.noMatches')} />}
              </ItemList>
            </ExplorerPane>
            <EditorPane aria-label={selected ? `#${String(selected.number)} ${selected.title}` : t('projectPullRequests.select')}>
              {selected ? <>
                <PanelHeader>
                  <PanelHeading title={selected.url}>{`#${String(selected.number)} ${selected.title}`}</PanelHeading><WindowDragArea />
                  {selected.tasks.map(task => <IconButton key={task.id} title={t('projectPullRequests.openTask', { title: task.title })}
                    icon={<ListChecks size={ICON.sm} {...iconProps} />} onClick={() => void openTask(task.id)} />)}
                  <IconButton title={t('reviewPane.openInBrowser')} icon={<ExternalLink size={ICON.sm} {...iconProps} />}
                    onClick={() => void window.quuu.system.openExternal(selected.url)} />
                </PanelHeader>
                <PullRequestBrowser key={selected.url} id={viewId(selected.url)} pullRequest={selected} onError={reportError} />
              </> : <EmptyState title={t('projectPullRequests.select')} />}
            </EditorPane>
          </ExplorerLayout>}
  </Panel>
}
