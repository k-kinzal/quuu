import {
  observeLayoutMotion,
  claimContextMenu,
  Alert,
  Button,
  ContentTabs,
  ContentTabPanel,
  FloatingEditorForm as CommentPanel,
  DiffView,
  EditorPane,
  OverlayViewport as EditorPosition,
  EditorTabBar,
  EmbeddedContentHost as EmbeddedBrowserHost,
  EmptyState,
  ExplorerLayout,
  ExplorerPane,
  IconButton,
  PaneToolbar,
  WorkSurface,
  Row,
  Spacer,
  Text,
  TextArea,
  TreeView,
  type ContentTabOption,
  type MenuItemSpec,
  type TreeNode
} from '@design-system/react'
import { useCallback, useId, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { Task } from '../../../preload/api/tasks.js'
import type { ReviewFile, ReviewFileRequest, ReviewLocation, ReviewPullRequest, ReviewSnapshot, ReviewTreeNode } from '../../../preload/api/review.js'
import type { PullRequestViewBounds } from '../../../preload/api/workbench.js'
import { t } from '../model/i18n/index.js'
import { copyText, selectionItems } from '../interaction/contextMenu.js'
import { contextMenu } from '../interaction/menu.js'
import { useTaskReport } from '../interaction/useTaskReport.js'
import { buildFileTree, projectReviewTree, treeChange } from '../model/reviewTree.js'
import { useStore } from '../state/store.js'
import { ChevronDown, ChevronRight, FileDiff, FileText, FolderGit2, FolderTree, GitCommitHorizontal, GitPullRequest, ICON, MessageSquareText, RefreshCw, ScrollText, Send, iconProps } from '../ui/icons.js'
import { changeLabel, changeTone, CheckMark } from '../ui/workbench.js'
import { Chat } from './Chat.js'
import { Composer } from './Composer.js'

type MainMode = 'chat' | 'tree' | 'changes' | 'commits' | 'pull-requests' | 'report'
/** The modes that browse files. Chat and the report are each read on their own. */
type ExplorerMode = Exclude<MainMode, 'chat' | 'report'>

export interface ReviewReveal {
  request: ReviewFileRequest
  line: number | null
  nonce: number
}

interface TaskMainPaneProps {
  task: Task
  project: Project | undefined
  snapshot: ReviewSnapshot | null
  loading: boolean
  error: string | null
  requestedLine: { line: number } | null
  reveal?: ReviewReveal | null
  onRefresh(): void
  onFile(file: ReviewFile | null): void
}

interface BuiltTree {
  nodes: TreeNode[]
  requests: Map<string, ReviewFileRequest>
  pullRequests: Map<string, ReviewPullRequest>
}

interface FileTab {
  kind: 'file'
  key: string
  request: ReviewFileRequest
  file: ReviewFile
}

interface PullRequestTab {
  kind: 'pull-request'
  key: string
  pullRequest: ReviewPullRequest
}

type ReviewTab = FileTab | PullRequestTab

function convertTree(
  roots: ReviewTreeNode[],
  location: ReviewLocation,
  prefix: string,
  requests: Map<string, ReviewFileRequest>,
  changedLocation?: ReviewLocation
): TreeNode[] {
  return roots.map((node) => {
    const id = `${prefix}:${node.path}`
    const change = treeChange(node)
    const description = change ? changeLabel[change] : undefined
    if (node.kind === 'file') {
      requests.set(id, {
        ...(node.change && changedLocation ? changedLocation : location),
        path: node.path,
        previousPath: node.previousPath
      })
    }
    return {
      id,
      label: node.name,
      title: [node.previousPath ? `${node.previousPath} → ${node.path}` : node.path, description].filter(Boolean).join(' · '),
      description,
      tone: change ? changeTone[change] : undefined,
      icon:
        node.kind === 'directory' ? (
          <FolderGit2 size={ICON.sm} {...iconProps} />
        ) : (
          <FileText size={ICON.sm} {...iconProps} />
        ),
      children: node.children
        ? convertTree(node.children, location, prefix, requests, changedLocation)
        : undefined
    }
  })
}

function buildTree(snapshot: ReviewSnapshot, mode: ExplorerMode): BuiltTree {
  const requests = new Map<string, ReviewFileRequest>()
  const pullRequests = new Map<string, ReviewPullRequest>()

  if (mode === 'tree') {
    return {
      nodes: convertTree(projectReviewTree(snapshot.tree, snapshot.changes), { source: 'working' }, 'working', requests,
        snapshot.revision ? { source: 'task', revision: snapshot.revision } : undefined),
      requests,
      pullRequests
    }
  }
  if (mode === 'changes') {
    const roots = buildFileTree(snapshot.changes, 'changes')
    return {
      nodes: snapshot.revision
        ? convertTree(roots, { source: 'task', revision: snapshot.revision }, 'changes', requests)
        : [],
      requests,
      pullRequests
    }
  }
  if (mode === 'commits') {
    const pending = [
      { id: 'local', label: t('reviewPane.localChanges'), changes: snapshot.localChanges, revision: snapshot.localRevision },
      { id: 'staged', label: t('reviewPane.staged'), changes: snapshot.stagedChanges, revision: snapshot.stagedRevision }
    ]
    const pendingNodes: TreeNode[] = []
    for (const group of pending) {
      if (group.changes.length === 0 || !group.revision) continue
      pendingNodes.push({
        id: `${group.id}-root`,
        label: group.label,
        icon: <FileDiff size={ICON.sm} {...iconProps} />,
        children: convertTree(
          buildFileTree(group.changes, group.id),
          { source: 'task', revision: group.revision },
          group.id,
          requests
        )
      })
    }
    const nodes: TreeNode[] = snapshot.commits.map((commit) => ({
      id: `commit-root:${commit.sha}`,
      label: commit.shortSha,
      title: `${commit.sha}\n${commit.subject}\n${commit.author} · ${commit.committedAt}`,
      icon: <GitCommitHorizontal size={ICON.sm} {...iconProps} />,
      children: convertTree(
        buildFileTree(commit.files, `commit:${commit.sha}`),
        { source: 'commit', ref: commit.sha },
        `commit:${commit.sha}`,
        requests
      )
    }))
    return { nodes: [...pendingNodes, ...nodes], requests, pullRequests }
  }

  const nodes = snapshot.pullRequests.map((pull) => {
    const rootId = `pull-root:${pull.url}`
    pullRequests.set(rootId, pull)
    return {
      id: rootId,
      label: `#${String(pull.number)} ${pull.title}`,
      title: `${pull.headRefName} → ${pull.baseRefName}`,
      icon: <GitPullRequest size={ICON.sm} {...iconProps} />,
      meta: <CheckMark status={pull.check} />,
      children: convertTree(
        buildFileTree(pull.files, `pull:${pull.url}`),
        { source: 'pull-request', ref: pull.url },
        `pull:${pull.url}`,
        requests
      )
    }
  })
  return { nodes, requests, pullRequests }
}

function tabKey(request: ReviewFileRequest): string {
  return `${request.source}:${request.ref ?? ''}:${request.revision?.base ?? ''}:${request.revision?.head ?? ''}:${request.path}`
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

function pullRequestTabKey(pullRequest: ReviewPullRequest): string {
  return `pull-request-page:${String(pullRequest.number)}:${pullRequest.url}`
}

function pullRequestItems(pullRequest: ReviewPullRequest): MenuItemSpec[] {
  return [
    ...selectionItems(),
    { label: t('reviewPane.openInBrowser'), onSelect: () => void window.quuu.system.openExternal(pullRequest.url) },
    { label: t('reviewPane.copyLink'), onSelect: () => copyText(pullRequest.url) }
  ]
}

function viewBounds(element: HTMLElement): PullRequestViewBounds | null {
  const rect = element.getBoundingClientRect()
  const bounds = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
  return bounds.width > 0 && bounds.height > 0 ? bounds : null
}

function PullRequestBrowser({
  tab,
  onError
}: {
  tab: PullRequestTab
  onError(reason: string): void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    let frame: number | null = null
    let active = true
    let reported = false
    const update = (): void => {
      frame = null
      const bounds = viewBounds(element)
      if (!bounds) return
      void window.quuu.review
        .openPullRequest({ id: tab.key, url: tab.pullRequest.url, bounds })
        .then((result) => {
          if (!active) return
          if (result.ok) {
            reported = false
          } else if (!reported) {
            reported = true
            onError(result.reason ?? t('reviewPane.viewRejected'))
          }
        })
        .catch((caught: unknown) => {
          if (!active || reported) return
          reported = true
          onError(caught instanceof Error ? caught.message : String(caught))
        })
    }
    const schedule = (): void => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    const stopFollowingMotion = observeLayoutMotion(element, schedule)
    observer?.observe(element)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      stopFollowingMotion()
      window.removeEventListener('resize', schedule)
      void window.quuu.review.hidePullRequest(tab.key)
    }
  }, [onError, tab])

  return <EmbeddedBrowserHost ref={host} aria-label={`Pull Request #${String(tab.pullRequest.number)}`} />
}

/**
 * Where the report view sits.
 *
 * The renderer hands over an area, never a file: which page belongs to this task is main's answer.
 * `path` stays a dependency so a newer report replaces the one on screen.
 */
function ReportPage({
  taskId,
  path,
  onError
}: {
  taskId: string
  path: string
  onError(reason: string): void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    let frame: number | null = null
    let active = true
    const update = (): void => {
      frame = null
      const bounds = viewBounds(element)
      if (!bounds) return
      void window.quuu.report
        .show({ taskId, bounds })
        .then((result) => { if (active && !result.ok) onError(result.reason ?? '') })
        .catch((caught: unknown) => {
          if (active) onError(caught instanceof Error ? caught.message : String(caught))
        })
    }
    const schedule = (): void => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    const stopFollowingMotion = observeLayoutMotion(element, schedule)
    observer?.observe(element)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      stopFollowingMotion()
      window.removeEventListener('resize', schedule)
      void window.quuu.report.hide()
    }
  }, [onError, path, taskId])

  return <EmbeddedBrowserHost ref={host} aria-label={t('reviewPane.modeReport')} />
}

function expandedBranches(nodes: TreeNode[], limit = 240): string[] {
  const result: string[] = []
  const visit = (items: TreeNode[]): void => {
    for (const node of items) {
      if (!node.children || result.length >= limit) continue
      result.push(node.id)
      visit(node.children)
    }
  }
  visit(nodes)
  return result
}

export function TaskMainPane({
  task,
  project,
  snapshot,
  loading,
  error,
  requestedLine,
  reveal,
  onRefresh,
  onFile
}: TaskMainPaneProps): JSX.Element {
  const taskId = task.id
  const pushToast = useStore((state) => state.pushToast)
  const modeTabsId = useId()
  const fileTabsId = useId()
  const [mode, setMode] = useState<MainMode>('chat')
  const lastReviewMode = useRef<ExplorerMode>('changes')

  const [tabs, setTabs] = useState<ReviewTab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const automaticOpen = useRef<{
    taskId: string
    mode: MainMode
    snapshot: ReviewSnapshot
    file: string
  } | null>(null)
  const fileRequest = useRef(0)
  const handledReveal = useRef<number | null>(null)
  const pullRequestTabs = useRef(new Set<string>())

  useEffect(() => {
    if (mode !== 'chat' && mode !== 'report') lastReviewMode.current = mode
  }, [mode])

  useEffect(() => {
    fileRequest.current += 1
    setFileLoading(false)
    setMode('chat')
    setTabs([])
    setActive(null)
    setSelectedLine(null)
    setCommentLine(null)
    onFile(null)
  }, [taskId, onFile])

  useEffect(
    () => () => {
      fileRequest.current += 1
      for (const id of pullRequestTabs.current) void window.quuu.review.closePullRequest(id)
      pullRequestTabs.current.clear()
    },
    []
  )

  const built = useMemo(() => (snapshot && mode !== 'chat' && mode !== 'report' ? buildTree(snapshot, mode) : null), [snapshot, mode])
  const current = tabs.find((tab) => tab.key === active) ?? null

  // The tab's current value is the source of truth. Writing the right-pane notification
  // separately for each path (open, close, tab switch) lets one path miss it, leaving
  // the code structure stale.
  useEffect(
    () => onFile(current?.kind === 'file' ? current.file : null),
    [current, onFile]
  )

  useEffect(() => {
    if (requestedLine !== null) {
      setSelectedLine(requestedLine.line)
      setMode((value) => value === 'chat' || value === 'report' ? lastReviewMode.current : value)
    }
  }, [requestedLine])

  const openFile = useCallback(async (request: ReviewFileRequest, line: number | null = null): Promise<void> => {
    const requestId = ++fileRequest.current
    const key = tabKey(request)
    const found = tabs.find((tab) => tab.key === key)
    if (found) {
      setFileLoading(false)
      setActive(key)
      setSelectedLine(line)
      return
    }
    setFileLoading(true)
    try {
      const file = await window.quuu.review.file({ taskId: taskId, request: request })
      if (fileRequest.current !== requestId) return
      setTabs((values) => [...values, { kind: 'file', key, request, file }])
      setActive(key)
      setSelectedLine(line)
    } catch (caught) {
      if (fileRequest.current !== requestId) return
      pushToast({
        id: `review-file-${Date.now()}`,
        level: 'warn',
        message: t('reviewPane.fileRejected'),
        detail: caught instanceof Error ? caught.message : String(caught)
      })
    } finally {
      if (fileRequest.current === requestId) setFileLoading(false)
    }
  }, [pushToast, tabs, taskId])

  const openPullRequest = useCallback((pullRequest: ReviewPullRequest): void => {
    fileRequest.current += 1
    setFileLoading(false)
    const key = pullRequestTabKey(pullRequest)
    pullRequestTabs.current.add(key)
    setTabs((values) =>
      values.some((tab) => tab.key === key)
        ? values
        : [...values, { kind: 'pull-request', key, pullRequest }]
    )
    setActive(key)
    setSelectedLine(null)
    setCommentLine(null)
  }, [])

  const reportPullRequestError = useCallback(
    (reason: string): void => {
      pushToast({
        id: `review-pull-${Date.now()}`,
        level: 'warn',
        message: t('reviewPane.pullRejected'),
        detail: reason
      })
    },
    [pushToast]
  )

  /*
   * The report the task carries. Only its page is read here — asking for one belongs with the
   * task's other settings, so this surface never offers to write.
   */
  const { report } = useTaskReport(taskId, true)
  const reportPage = report?.path ?? ''

  const reportViewError = useCallback(
    (reason: string): void => {
      pushToast({
        id: `review-report-${Date.now()}`,
        level: 'warn',
        message: t('reviewPane.reportViewRejected'),
        detail: reason
      })
    },
    [pushToast]
  )

  useEffect(() => {
    if (!reveal || handledReveal.current === reveal.nonce) return
    handledReveal.current = reveal.nonce
    setMode(reveal.request.source === 'working' ? 'tree' : reveal.request.source === 'commit' ? 'commits' : reveal.request.source === 'pull-request' ? 'pull-requests' : 'changes')
    void openFile(reveal.request, reveal.line)
  }, [openFile, reveal])

  useEffect(() => {
    if (!built || !snapshot || active || fileLoading || tabs.length > 0) return
    const first = built.requests.values().next().value
    if (!first) return
    const file = tabKey(first)
    // After a failed fetch the tabs stay empty, so without remembering the attempt the
    // effect re-issues the same IPC without bound and saturates the renderer. No automatic
    // retry until a refresh or a view-mode change.
    const tried = automaticOpen.current
    if (
      tried?.taskId === taskId &&
      tried.mode === mode &&
      tried.snapshot === snapshot &&
      tried.file === file
    ) return
    automaticOpen.current = { taskId, mode, snapshot, file }
    void openFile(first)
  }, [active, built, fileLoading, mode, openFile, snapshot, tabs.length, taskId])

  const closeTab = (key: string): void => {
    const closing = tabs.find((tab) => tab.key === key)
    if (!closing) return
    const index = tabs.findIndex((tab) => tab.key === key)
    const nextTabs = tabs.filter((tab) => tab.key !== key)
    const next = nextTabs[Math.min(index, nextTabs.length - 1)] ?? null
    setTabs(nextTabs)
    if (key === active) setActive(next?.key ?? null)
    if (closing.kind === 'pull-request') {
      pullRequestTabs.current.delete(key)
      void window.quuu.review.closePullRequest(key)
    }
  }

  const submitComment = async (): Promise<void> => {
    if (current?.kind !== 'file' || !current.file.pullRequest || !commentLine) return
    setCommentSending(true)
    try {
      const result = await window.quuu.review.comment({
        taskId: taskId, input: {
          pullRequest: current.file.pullRequest.number,
          pullRequestUrl: current.file.pullRequest.url,
          headSha: current.file.pullRequest.headSha,
          path: current.file.path,
          line: commentLine,
          body: comment
        }
      })
      if (!result.ok) throw new Error(result.reason)
      setComment('')
      setCommentLine(null)
      pushToast({ id: `review-comment-${Date.now()}`, level: 'info', message: t('reviewPane.commentSent') })
    } catch (caught) {
      pushToast({
        id: `review-comment-${Date.now()}`,
        level: 'warn',
        message: t('reviewPane.commentRejected'),
        detail: caught instanceof Error ? caught.message : String(caught)
      })
    } finally {
      setCommentSending(false)
    }
  }

  const modeOptions = [
    { value: 'chat', label: t('reviewPane.modeChat'), icon: <MessageSquareText size={ICON.sm} {...iconProps} /> },
    { value: 'tree', label: t('reviewPane.modeTree'), icon: <FolderTree size={ICON.sm} {...iconProps} /> },
    { value: 'changes', label: t('reviewPane.modeChanges'), icon: <FileDiff size={ICON.sm} {...iconProps} />, count: snapshot?.changes.length ?? 0 },
    { value: 'commits', label: t('reviewPane.modeCommits'), icon: <GitCommitHorizontal size={ICON.sm} {...iconProps} />, count: (snapshot?.commits.length ?? 0) + ((snapshot?.localChanges.length ?? 0) > 0 ? 1 : 0) + ((snapshot?.stagedChanges.length ?? 0) > 0 ? 1 : 0) },
    { value: 'pull-requests', label: t('reviewPane.modePullRequests'), icon: <GitPullRequest size={ICON.sm} {...iconProps} />, count: snapshot?.pullRequests.length ?? 0 },
    /*
     * Closed until something was written. A tab that opens onto "nothing yet" spends a click to
     * say what the disabled state already says, and asking for one belongs with the task's other
     * settings, not here.
     */
    { value: 'report', label: t('reviewPane.modeReport'), icon: <ScrollText size={ICON.sm} {...iconProps} />, disabled: !reportPage, title: reportPage ? undefined : t('reviewPane.reportMissing') }
  ] satisfies ContentTabOption<MainMode>[]

  return (
    <WorkSurface>
      <PaneToolbar role="toolbar" aria-label={t('reviewPane.toolbarLabel')}>
        <ContentTabs<MainMode>
          idBase={modeTabsId}
          label={t('reviewPane.modeTabsLabel')}
          value={mode}
          onChange={setMode}
          options={modeOptions}
        />
        <Spacer />
        {snapshot?.branch && (
          <Text size="xs" tone="tertiary" mono truncate title={snapshot.branch}>
            {snapshot.branch}
          </Text>
        )}
        <IconButton
          size="xs"
          title={t('reviewPane.refresh')}
          icon={<RefreshCw size={ICON.sm} {...iconProps} />}
          onClick={onRefresh}
        />
      </PaneToolbar>

      {modeOptions.map((option) => (
        <ContentTabPanel key={option.value} idBase={modeTabsId} value={option.value} activeValue={mode}>
          {option.value === 'chat' ? (
            <Chat task={task} project={project} active={mode === 'chat'} />
          ) : option.value === 'report' ? (
            mode === 'report' && reportPage && <ReportPage taskId={taskId} path={reportPage} onError={reportViewError} />
          ) : option.value === mode && (
            <ExplorerLayout>
              <ExplorerPane>
                {loading && <EmptyState title={t('reviewPane.loading')} />}
                {!loading && error && <Alert title={t('reviewPane.loadRejected')}>{error}</Alert>}
                {!loading && !error && mode === 'pull-requests' && snapshot?.pullRequestNotice && (
                  <Alert title={t('reviewPane.pullFetchRejected')}>{snapshot.pullRequestNotice}</Alert>
                )}
                {!loading && built && (
                  <TreeView
                    label={t('reviewPane.treeLabel')}
                    nodes={built.nodes}
                    expandIcon={<ChevronRight size={ICON.sm} {...iconProps} />}
                    collapseIcon={<ChevronDown size={ICON.sm} {...iconProps} />}
                    defaultExpandedIds={mode === 'tree' ? undefined : expandedBranches(built.nodes)}
                    selectedId={
                      current?.kind === 'file'
                        ? [...built.requests].find(([, request]) => tabKey(request) === current.key)?.[0]
                        : current?.kind === 'pull-request'
                          ? [...built.pullRequests].find(
                            ([, pullRequest]) => pullRequestTabKey(pullRequest) === current.key
                          )?.[0]
                          : null
                    }
                    onActivate={(node) => {
                      const request = built.requests.get(node.id)
                      if (request) void openFile(request)
                      const pullRequest = built.pullRequests.get(node.id)
                      if (pullRequest) openPullRequest(pullRequest)
                    }}
                    onContextMenu={(event, node) => {
                      const pullRequest = built.pullRequests.get(node.id)
                      if (pullRequest && claimContextMenu(event)) void contextMenu(pullRequestItems(pullRequest))
                    }}
                  />
                )}
              </ExplorerPane>
              <EditorPane>
                {tabs.length > 0 && (
                  <EditorTabBar>
                    <ContentTabs
                      idBase={fileTabsId}
                      label={t('reviewPane.openTabsLabel')}
                      appearance="document"
                      value={active}
                      options={tabs.map((tab) => ({
                        value: tab.key,
                        label: tab.kind === 'file' ? fileName(tab.file.path) : `#${String(tab.pullRequest.number)} ${tab.pullRequest.title}`,
                        title: tab.kind === 'file' ? tab.file.path : tab.pullRequest.title,
                        icon: tab.kind === 'file' ? <FileText size={ICON.sm} {...iconProps} /> : <GitPullRequest size={ICON.sm} {...iconProps} />
                      }))}
                      onChange={(value) => { setActive(value); setSelectedLine(null) }}
                      onClose={closeTab}
                      onContextMenu={(event, value) => {
                        const tab = tabs.find((item) => item.key === value)
                        if (tab?.kind === 'pull-request' && claimContextMenu(event)) void contextMenu(pullRequestItems(tab.pullRequest))
                      }}
                    />
                  </EditorTabBar>
                )}

                {tabs.length === 0 && <EmptyState title={fileLoading ? t('reviewPane.fileLoading') : t('reviewPane.selectFile')} />}
                {tabs.map((tab) => (
                  <ContentTabPanel key={tab.key} idBase={fileTabsId} value={tab.key} activeValue={active}>
                    {tab.key === active && (
                      <EditorPosition>
                        {fileLoading && <EmptyState title={t('reviewPane.fileLoading')} />}
                        {!fileLoading && current?.kind === 'file' && current.file.binary && (
                          <EmptyState title={t('reviewPane.binaryFile')} />
                        )}
                        {!fileLoading && current?.kind === 'file' && !current.file.binary && (
                          <DiffView
                            lines={current.file.diff}
                            language={current.file.language}
                            selectedLine={selectedLine}
                            onSelectedLineChange={current.file.pullRequest ? setSelectedLine : undefined}
                            onLineClick={
                              current.file.pullRequest
                                ? (line) => {
                                  setSelectedLine(line)
                                  setCommentLine(line)
                                }
                                : undefined
                            }
                          />
                        )}
                        {!fileLoading && current?.kind === 'pull-request' && (
                          <PullRequestBrowser tab={current} onError={reportPullRequestError} />
                        )}

                        {current?.kind === 'file' && current.file.pullRequest && commentLine && (
                          <CommentPanel
                            onSubmit={(event) => {
                              event.preventDefault()
                              void submitComment()
                            }}
                          >
                            <Text size="sm" weight="bold">
                              {current.file.path}:{commentLine}
                            </Text>
                            <TextArea
                              rows={3}
                              value={comment}
                              placeholder={t('reviewPane.commentPlaceholder')}
                              autoFocus
                              onChange={(event) => setComment(event.target.value)}
                            />
                            <Row justify="end">
                              <Button size="xs" disabled={commentSending} onClick={() => setCommentLine(null)}>
                                {t('reviewPane.cancel')}
                              </Button>
                              <Button
                                size="xs"
                                type="submit"
                                variant="contained"
                                disabled={commentSending || comment.trim().length === 0}
                                startIcon={<Send size={ICON.sm} {...iconProps} />}
                              >
                                {t('reviewPane.comment')}
                              </Button>
                            </Row>
                          </CommentPanel>
                        )}
                      </EditorPosition>
                    )}
                  </ContentTabPanel>
                ))}
              </EditorPane>
            </ExplorerLayout>
          )}
        </ContentTabPanel>
      ))}
      <Composer task={task} project={project} />
    </WorkSurface>
  )
}
