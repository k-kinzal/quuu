import {
  Alert, DocumentBody, Dot, EditorPane, EmptyState, ExplorerLayout, ExplorerPane, IconButton,
  ItemGroupHeader, ItemList, Markdown, Panel,
  PanelHeader, PanelHeading, ResourceItem, SearchInput, SourceBlock, Text, Toolbar, WindowDragArea
} from '@design-system/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../../../../api/schemas/projects.js'
import { DocumentWebsite } from '../../components/DocumentWebsite.js'
import { pane } from '../../interaction/focus.js'
import { t } from '../../model/i18n/index.js'
import { failureReason } from '../../model/operationFailure.js'
import { queryClient } from '../../state/queryClient.js'
import { useStore } from '../../state/store.js'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ICON, RefreshCw, iconProps } from '../../ui/icons.js'

// Selection belongs to this window; revisiting a project's documents keeps the last page.
const selections = new Map<string, string>()

export function ProjectDocuments({ project }: { project: Project }): JSX.Element {
  const [selection, setSelection] = useState(selections.get(project.id) ?? '')
  const [search, setSearch] = useState('')
  const [fragment, setFragment] = useState('')
  const [navigation, setNavigation] = useState(0)
  const [webError, setWebError] = useState('')
  const [webRevision, setWebRevision] = useState(0)
  const preview = useRef<HTMLDivElement>(null)
  const pushToast = useStore(s => s.pushToast)
  const documents = useQuery({
    queryKey: ['documents', project.id, project.path],
    queryFn: () => window.quuu.documents.list(project.id, { context: { feedback: 'inline' } }),
    retry: false, networkMode: 'always'
  }, queryClient)
  const data = documents.data
  const file = data?.files.find(file => `file:${file.path}` === selection) ??
    (!data?.websites.some(site => site.url === selection) ? data?.files[0] : undefined)
  const website = file ? undefined : data?.websites.find(site => site.url === selection) ?? data?.websites[0]
  const selected = file ? `file:${file.path}` : website?.url
  const content = useQuery({
    queryKey: ['document', project.id, data?.revision, file?.path],
    queryFn: () => window.quuu.documents.read({ projectId: project.id, revision: data!.revision, path: file!.path }, { context: { feedback: 'inline' } }),
    enabled: Boolean(file && data), retry: false, networkMode: 'always'
  }, queryClient)
  const choose = useCallback((value: string, hash = ''): void => {
    selections.set(project.id, value)
    setSelection(value)
    setFragment(hash)
    setNavigation(value => value + 1)
    setWebError('')
  }, [project.id])
  useEffect(() => {
    if (!content.data) return
    if (!fragment) { preview.current?.scrollTo?.({ top: 0 }); return }
    const target = document.getElementById(`document-${fragment}`) ?? document.getElementById(fragment)
    if (target && preview.current?.contains(target)) target.scrollIntoView({ block: 'start' })
  }, [content.data, fragment, navigation])
  const openLink = (href: string): void => {
    const url = new URL(href)
    if (url.origin === 'https://quuu.invalid') {
      let path: string
      let hash: string
      try { path = decodeURIComponent(url.pathname.slice(1)); hash = decodeURIComponent(url.hash.slice(1)) } catch { return }
      const candidates = [path, `${path.replace(/\/$/, '')}/README.md`, `${path.replace(/\/$/, '')}/index.md`]
      const target = data?.files.find(file => candidates.includes(file.path))
      if (target) choose(`file:${target.path}`, hash)
      else pushToast({ id: 'document-link', level: 'warn', message: t('projectDocuments.unavailable') })
    } else if (data?.websites.some(site => site.url === href)) choose(href)
    else void window.quuu.system.openExternal(href)
  }
  const query = search.trim().toLocaleLowerCase()
  const files = data?.files.filter(file => file.path.toLocaleLowerCase().includes(query)) ?? []
  const websites = data?.websites.filter(site => `${site.title} ${site.url}`.toLocaleLowerCase().includes(query)) ?? []
  const refresh = (): void => { void documents.refetch(); setWebError(''); setWebRevision(value => value + 1) }
  return <Panel surface="canvas" windowHeader grow {...pane('documents')} aria-label={t('projectDocuments.title')}>
    <PanelHeader>
      <Dot color={project.color} /><PanelHeading>{t('projectDocuments.title')}</PanelHeading>
      {data && <Text size="xs" tone="secondary" truncate title={data.revision}>{t('projectDocuments.branch', { branch: data.branch })}</Text>}
      <WindowDragArea />
      <IconButton title={t('projectDocuments.refresh')} disabled={documents.isFetching}
        icon={<RefreshCw size={ICON.md} {...iconProps} />} onClick={refresh} />
    </PanelHeader>
    {documents.error ? <EmptyState title={t('projectDocuments.failed')} action={{ label: t('projectDocuments.retry'), onClick: refresh }}>{failureReason(documents.error)}</EmptyState>
      : !data ? <EmptyState title={t('projectDocuments.loading')} />
        : data.files.length + data.websites.length === 0 ? <EmptyState title={t('projectDocuments.empty')} />
          : <ExplorerLayout>
            <ExplorerPane aria-label={t('projectDocuments.title')}>
              <Toolbar placement="panel"><SearchInput aria-label={t('projectDocuments.search')} placeholder={t('projectDocuments.search')}
                value={search} onChange={event => setSearch(event.target.value)} /></Toolbar>
              <ItemList>
                {websites.length > 0 && <ItemGroupHeader>{t('projectDocuments.websites')}</ItemGroupHeader>}
                {websites.map(site => <ResourceItem key={site.url} selected={selected === site.url}
                  aria-current={selected === site.url ? 'page' : undefined} title={site.url} onClick={() => choose(site.url)}
                  icon={<ExternalLink size={ICON.sm} {...iconProps} />} label={site.title} description={new URL(site.url).hostname} />)}
                {files.length > 0 && <ItemGroupHeader>{t('projectDocuments.files')}</ItemGroupHeader>}
                {files.map(file => <ResourceItem key={file.path} selected={selected === `file:${file.path}`}
                  aria-current={selected === `file:${file.path}` ? 'page' : undefined} aria-label={file.path}
                  title={file.path} onClick={() => choose(`file:${file.path}`)} icon={<FileText size={ICON.sm} {...iconProps} />}
                  label={file.path.split('/').at(-1)!} description={file.path.split('/').slice(0, -1).join('/')} />)}
                {files.length + websites.length === 0 && <EmptyState title={t('projectDocuments.noMatches')} />}
              </ItemList>
            </ExplorerPane>
            <EditorPane aria-label={file?.path ?? website?.title ?? t('projectDocuments.select')}>
              <PanelHeader>
                <PanelHeading title={file?.path ?? website?.url}>{file?.path ?? website?.title}</PanelHeading><WindowDragArea />
                {website && <>
                  <IconButton title={t('projectDocuments.back')} icon={<ChevronLeft size={ICON.sm} {...iconProps} />} onClick={() => void window.quuu.documents.navigate('back')} />
                  <IconButton title={t('projectDocuments.forward')} icon={<ChevronRight size={ICON.sm} {...iconProps} />} onClick={() => void window.quuu.documents.navigate('forward')} />
                  <IconButton title={t('projectDocuments.reload')} icon={<RefreshCw size={ICON.sm} {...iconProps} />} onClick={() => { setWebError(''); setWebRevision(value => value + 1) }} />
                  <IconButton title={t('projectDocuments.openBrowser')} icon={<ExternalLink size={ICON.sm} {...iconProps} />} onClick={() => void window.quuu.system.openExternal(website.url)} />
                </>}
              </PanelHeader>
              {file ? <DocumentBody ref={preview}>
                {content.error ? <Alert title={t('projectDocuments.failed')}>{failureReason(content.error)}</Alert>
                  : !content.data ? <EmptyState title={t('projectDocuments.loading')} />
                    : content.data.format === 'markdown' ? <Markdown baseUrl={content.data.baseUrl} headingPrefix="document-" onOpenLink={openLink}>{content.data.content}</Markdown>
                      : <SourceBlock code={content.data.content} language="text" />}
              </DocumentBody> : website && (webError ? <EmptyState title={t('projectDocuments.failed')}
                action={{ label: t('projectDocuments.retry'), onClick: () => { setWebError(''); setWebRevision(value => value + 1) } }}>{webError}</EmptyState>
                : <DocumentWebsite key={`${website.url}:${webRevision}`} projectId={project.id} url={website.url} onError={setWebError} reload={webRevision > 0} />)}
            </EditorPane>
          </ExplorerLayout>}
  </Panel>
}
