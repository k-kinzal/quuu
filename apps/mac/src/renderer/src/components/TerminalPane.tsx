import {
  EditorTabActions,
  EditorTabBar,
  ContentTabs,
  ContentTabPanel,
  IconButton,
  PlainInput,
  FindBar as TerminalFindBar,
  TerminalSurface,
  TerminalView,
  OverlayViewport as TerminalViewportStack,
  type TerminalViewHandle,
  type TerminalViewSize
} from '@design-system/react'
import { useCallback, useId, useEffect, useRef, useState } from 'react'
import type { TerminalEvent, TerminalSession } from '../../../preload/api/workbench.js'
import { pane } from '../interaction/focus.js'
import { t } from '../model/i18n/index.js'
import { ChevronDown, ChevronUp, ICON, Plus, RefreshCw, Search, Square, Terminal, Trash2, X, iconProps } from '../ui/icons.js'

interface TerminalTabState {
  key: string
  sessionId: string | null
  shell: string
  cwd: string
  title: string
  exited: boolean
}

export interface TerminalRunRequest {
  id: string
  nonce: number
}

export interface TerminalPaneProps {
  taskId: string
  cwd: string
  runRequest?: TerminalRunRequest | null
  onRunHandled?(nonce: number): void
  onError(error: unknown): void
}

function displayName(tab: TerminalTabState): string {
  const pathName = tab.cwd.split('/').filter(Boolean).at(-1)
  return pathName ? `${tab.shell} · ${pathName}` : tab.shell || tab.title.trim() || 'shell'
}

function terminalCancelled(): Error {
  const error = new Error('Terminal launch was cancelled')
  error.name = 'AbortError'
  return error
}

function isTerminalCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function TerminalPane({
  taskId,
  cwd,
  runRequest,
  onRunHandled,
  onError
}: TerminalPaneProps): JSX.Element {
  const tabsId = useId()
  const sequence = useRef(0)
  const makeTab = useCallback(
    (): TerminalTabState => ({
      key: `terminal-${String(++sequence.current)}`,
      sessionId: null,
      shell: 'shell',
      cwd,
      title: '',
      exited: false
    }),
    [cwd]
  )
  const [tabs, setTabs] = useState<TerminalTabState[]>(() => [makeTab()])
  const [activeKey, setActiveKey] = useState(() => tabs[0].key)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const views = useRef(new Map<string, TerminalViewHandle>())
  const sizes = useRef(new Map<string, TerminalViewSize>())
  const sessions = useRef(new Map<string, TerminalSession>())
  const sessionKeys = useRef(new Map<string, string>())
  const pendingOutput = useRef(new Map<string, string>())
  const opening = useRef(new Map<string, Promise<TerminalSession>>())
  const tabKeys = useRef(new Set(tabs.map((tab) => tab.key)))
  const alive = useRef(true)

  useEffect(() => {
    tabKeys.current = new Set(tabs.map((tab) => tab.key))
  }, [tabs])

  const ensureSession = useCallback(
    async (key: string): Promise<TerminalSession> => {
      const current = sessions.current.get(key)
      if (current) return current
      const pending = opening.current.get(key)
      if (pending) return pending
      const size = sizes.current.get(key) ?? views.current.get(key)?.size() ?? {
        columns: 80,
        rows: 24
      }
      const request = window.quuu.terminal.open({ taskId: taskId, columns: size.columns, rows: size.rows })
      opening.current.set(key, request)
      try {
        const session = await request
        if (!alive.current || !tabKeys.current.has(key)) {
          void window.quuu.terminal.close(session.id)
          throw terminalCancelled()
        }
        sessions.current.set(key, session)
        sessionKeys.current.set(session.id, key)
        setTabs((currentTabs) =>
          currentTabs.map((tab) =>
            tab.key === key
              ? {
                ...tab,
                sessionId: session.id,
                shell: session.shell,
                cwd: session.cwd,
                exited: false
              }
              : tab
          )
        )
        return session
      } finally {
        opening.current.delete(key)
      }
    },
    [taskId]
  )

  useEffect(() => {
    void ensureSession(activeKey).catch((error: unknown) => {
      if (!isTerminalCancelled(error)) onError(error)
    })
  }, [activeKey, ensureSession, onError])

  useEffect(
    () =>
      window.quuuEvents.terminal((event: TerminalEvent) => {
        const key = sessionKeys.current.get(event.sessionId)
        if (!key) return
        if (event.type === 'output') {
          const view = views.current.get(key)
          if (view) view.write(event.data)
          else pendingOutput.current.set(key, `${pendingOutput.current.get(key) ?? ''}${event.data}`)
          return
        }
        sessions.current.delete(key)
        sessionKeys.current.delete(event.sessionId)
        setTabs((currentTabs) =>
          currentTabs.map((tab) => (tab.key === key ? { ...tab, exited: true } : tab))
        )
      }),
    []
  )

  useEffect(() => {
    const currentSessions = sessions.current
    const currentSessionKeys = sessionKeys.current
    alive.current = true
    return () => {
      alive.current = false
      for (const session of currentSessions.values()) void window.quuu.terminal.close(session.id)
      currentSessions.clear()
      currentSessionKeys.clear()
    }
  }, [])

  useEffect(() => {
    if (!runRequest) return
    let cancelled = false
    void ensureSession(activeKey)
      .then(async (session) => {
        if (cancelled) return
        const result = await window.quuu.terminal.runProjectTask({ taskId: taskId, sessionId: session.id, projectTaskId: runRequest.id })
        if (!result.ok) throw new Error(result.reason)
        views.current.get(activeKey)?.focus()
        onRunHandled?.(runRequest.nonce)
      })
      .catch((error: unknown) => {
        if (!isTerminalCancelled(error)) onError(error)
      })
    return () => {
      cancelled = true
    }
  }, [activeKey, ensureSession, onError, onRunHandled, runRequest, taskId])

  const addTerminal = (): void => {
    const tab = makeTab()
    setTabs((current) => [...current, tab])
    setActiveKey(tab.key)
  }

  const closeTerminal = (key: string): void => {
    const index = tabs.findIndex((tab) => tab.key === key)
    const session = sessions.current.get(key)
    if (session) void window.quuu.terminal.close(session.id)
    sessions.current.delete(key)
    if (session) sessionKeys.current.delete(session.id)
    pendingOutput.current.delete(key)

    if (tabs.length === 1) {
      const replacement = makeTab()
      setTabs([replacement])
      setActiveKey(replacement.key)
      return
    }
    const remaining = tabs.filter((tab) => tab.key !== key)
    setTabs(remaining)
    if (activeKey === key) setActiveKey(remaining[Math.min(index, remaining.length - 1)].key)
  }

  const restartTerminal = (key: string): void => {
    const session = sessions.current.get(key)
    if (session) void window.quuu.terminal.close(session.id)
    sessions.current.delete(key)
    if (session) sessionKeys.current.delete(session.id)
    views.current.get(key)?.reset()
    setTabs((current) =>
      current.map((tab) =>
        tab.key === key
          ? { ...tab, sessionId: null, shell: 'shell', cwd, title: '', exited: false }
          : tab
      )
    )
    void ensureSession(key).catch((error: unknown) => {
      if (!isTerminalCancelled(error)) onError(error)
    })
  }

  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0]
  const activeView = views.current.get(activeKey)

  return (
    <TerminalSurface
      {...pane('terminal', { tab: true })}
      aria-label={t('terminalPane.paneLabel')}
      onKeyDownCapture={(event) => {
        if (event.metaKey && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          setFinding(true)
        }
        if (event.metaKey && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          views.current.get(activeKey)?.clear()
        }
      }}
    >
      <EditorTabBar>
        <ContentTabs
          idBase={tabsId}
          label={t('terminalPane.sessionsLabel')}
          appearance="document"
          value={activeKey}
          options={tabs.map((tab) => ({ value: tab.key, label: displayName(tab), title: tab.cwd, muted: tab.exited, icon: <Terminal size={ICON.sm} {...iconProps} /> }))}
          onChange={setActiveKey}
        />
        <EditorTabActions>
          <IconButton size="xs" title={t('terminalPane.newTerminal')} icon={<Plus size={ICON.sm} {...iconProps} />} onClick={addTerminal} />
          <IconButton size="xs" title={t('terminalPane.find')} icon={<Search size={ICON.sm} {...iconProps} />} onClick={() => setFinding((value) => !value)} />
          <IconButton size="xs" title={t('terminalPane.clear')} icon={<Trash2 size={ICON.sm} {...iconProps} />} onClick={() => activeView?.clear()} />
          {active?.exited ? (
            <IconButton size="xs" title={t('terminalPane.restart')} icon={<RefreshCw size={ICON.sm} {...iconProps} />} onClick={() => restartTerminal(activeKey)} />
          ) : (
            <IconButton
              size="xs"
              title={t('terminalPane.stop')}
              icon={<Square size={ICON.sm} {...iconProps} />}
              onClick={() => {
                const session = sessions.current.get(activeKey)
                if (session) void window.quuu.terminal.close(session.id)
              }}
            />
          )}
          <IconButton size="xs" title={t('terminalPane.close')} icon={<X size={ICON.sm} {...iconProps} />} onClick={() => closeTerminal(activeKey)} />
        </EditorTabActions>
      </EditorTabBar>

      <TerminalViewportStack>
        {finding && (
          <TerminalFindBar
            onSubmit={(event) => {
              event.preventDefault()
              views.current.get(activeKey)?.findNext(query)
            }}
          >
            <Search size={ICON.sm} {...iconProps} />
            <PlainInput
              autoFocus
              type="search"
              aria-label={t('terminalPane.findLabel')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                views.current.get(activeKey)?.findNext(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setFinding(false)
                  views.current.get(activeKey)?.focus()
                }
              }}
            />
            <IconButton size="xs" title={t('terminalPane.findPrevious')} icon={<ChevronUp size={ICON.sm} {...iconProps} />} onClick={() => views.current.get(activeKey)?.findPrevious(query)} />
            <IconButton size="xs" title={t('terminalPane.findNext')} icon={<ChevronDown size={ICON.sm} {...iconProps} />} onClick={() => views.current.get(activeKey)?.findNext(query)} />
            <IconButton
              size="xs"
              title={t('terminalPane.closeFind')}
              icon={<X size={ICON.sm} {...iconProps} />}
              onClick={() => {
                setFinding(false)
                views.current.get(activeKey)?.focus()
              }}
            />
          </TerminalFindBar>
        )}
        {tabs.map((tab) => (
          <ContentTabPanel key={tab.key} idBase={tabsId} value={tab.key} activeValue={activeKey}>
            <TerminalView
              ref={(view) => {
                if (!view) {
                  views.current.delete(tab.key)
                  return
                }
                views.current.set(tab.key, view)
                const buffered = pendingOutput.current.get(tab.key)
                if (buffered) {
                  view.write(buffered)
                  pendingOutput.current.delete(tab.key)
                }
              }}
              active={tab.key === activeKey}
              ariaLabel={t('terminalPane.viewLabel', { name: displayName(tab) })}
              onData={(data) => {
                const session = sessions.current.get(tab.key)
                if (session) void window.quuu.terminal.input({ sessionId: session.id, input: data })
              }}
              onResize={(size) => {
                sizes.current.set(tab.key, size)
                const session = sessions.current.get(tab.key)
                if (session) void window.quuu.terminal.resize({ sessionId: session.id, columns: size.columns, rows: size.rows })
              }}
              onTitleChange={(title) =>
                setTabs((current) =>
                  current.map((value) => (value.key === tab.key ? { ...value, title } : value))
                )
              }
              onCwdChange={(nextCwd) =>
                setTabs((current) =>
                  current.map((value) => value.key === tab.key ? { ...value, cwd: nextCwd } : value)
                )
              }
            />
          </ContentTabPanel>
        ))}
      </TerminalViewportStack>
    </TerminalSurface>
  )
}
