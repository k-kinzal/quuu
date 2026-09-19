import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef
} from 'react'
import { styled, useTheme } from '@mui/material/styles'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { blockProps } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'

export interface TerminalViewSize {
  columns: number
  rows: number
}

export interface TerminalViewHandle {
  write(data: string | Uint8Array): void
  clear(): void
  reset(): void
  focus(): void
  findNext(query: string): boolean
  findPrevious(query: string): boolean
  selection(): string
  paste(data: string): void
  size(): TerminalViewSize
}

export interface TerminalViewProps {
  active?: boolean
  ariaLabel?: string
  onData?(data: string): void
  onResize?(size: TerminalViewSize): void
  onTitleChange?(title: string): void
  onCwdChange?(cwd: string): void
}

const Root = styled('div', { shouldForwardProp: blockProps('active') })<{ active?: boolean }>(
  ({ theme, active = true }) => ({
    display: active ? 'block' : 'none',
    position: 'relative',
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    background: theme.palette.surface.default,
    '& .xterm': {
      height: '100%',
      padding: `${theme.spacing(2)} ${theme.spacing(3)}`
    },
    '& .xterm-viewport': {
      backgroundColor: theme.palette.surface.default,
      scrollbarColor: `${theme.palette.border.strong} transparent`
    }
  })
)

function useCurrentRef<T>(value: T): { current: T } {
  const reference = useRef(value)
  reference.current = value
  return reference
}

function TerminalViewInner(
  {
    active = true,
    ariaLabel,
    onData,
    onResize,
    onTitleChange,
    onCwdChange
  }: TerminalViewProps,
  forwardedRef: ForwardedRef<TerminalViewHandle>
): JSX.Element {
  const strings = useStrings()
  const terminalLabel = ariaLabel ?? strings.terminalView.label
  const theme = useTheme()
  const root = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const search = useRef<SearchAddon | null>(null)
  const dataCallback = useCurrentRef(onData)
  const resizeCallback = useCurrentRef(onResize)
  const titleCallback = useCurrentRef(onTitleChange)
  const cwdCallback = useCurrentRef(onCwdChange)

  useImperativeHandle(
    forwardedRef,
    () => ({
      write: (data) => terminal.current?.write(data),
      clear: () => terminal.current?.clear(),
      reset: () => terminal.current?.reset(),
      focus: () => terminal.current?.focus(),
      findNext: (query) => search.current?.findNext(query) ?? false,
      findPrevious: (query) => search.current?.findPrevious(query) ?? false,
      selection: () => terminal.current?.getSelection() ?? '',
      paste: (data) => terminal.current?.paste(data),
      size: () => ({
        columns: terminal.current?.cols ?? 80,
        rows: terminal.current?.rows ?? 24
      })
    }),
    []
  )

  useEffect(() => {
    const element = root.current
    if (!element) return
    const nextTerminal = new Terminal({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      drawBoldTextInBrightColors: true,
      fontFamily: theme.typography.fontFamilyMono,
      fontSize: 12,
      fontWeight: '400',
      fontWeightBold: '600',
      letterSpacing: 0,
      lineHeight: 1.25,
      macOptionIsMeta: true,
      minimumContrastRatio: 4.5,
      scrollback: 10_000,
      theme: {
        background: theme.palette.surface.default,
        foreground: theme.palette.text.primary,
        cursor: theme.palette.text.primary,
        cursorAccent: theme.palette.surface.default,
        selectionBackground: theme.palette.surface.selected,
        selectionInactiveBackground: theme.palette.surface.hover,
        // ANSI is pulled to the same color source as code rendering. Mix pure black in and the terminal alone sinks like a hole.
        black: theme.palette.surface.canvas,
        red: theme.palette.syntax.removed,
        green: theme.palette.syntax.added,
        yellow: theme.palette.syntax.number,
        blue: theme.palette.syntax.function,
        magenta: theme.palette.syntax.keyword,
        cyan: theme.palette.syntax.attribute,
        white: theme.palette.text.secondary,
        brightBlack: theme.palette.text.tertiary,
        brightRed: theme.palette.syntax.removed,
        brightGreen: theme.palette.syntax.added,
        brightYellow: theme.palette.syntax.number,
        brightBlue: theme.palette.syntax.function,
        brightMagenta: theme.palette.syntax.keyword,
        brightCyan: theme.palette.syntax.attribute,
        brightWhite: theme.palette.text.primary
      }
    })
    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    nextTerminal.loadAddon(fitAddon)
    nextTerminal.loadAddon(searchAddon)
    nextTerminal.open(element)
    terminal.current = nextTerminal
    fit.current = fitAddon
    search.current = searchAddon

    const subscriptions = [
      nextTerminal.onData((data) => dataCallback.current?.(data)),
      nextTerminal.onResize(({ cols, rows }) =>
        resizeCallback.current?.({ columns: cols, rows })
      ),
      nextTerminal.onTitleChange((title) => titleCallback.current?.(title)),
      nextTerminal.parser.registerOscHandler(7, (value) => {
        try {
          const location = new URL(value)
          if (location.protocol === 'file:') cwdCallback.current?.(decodeURIComponent(location.pathname))
        } catch {
          // Even if the shell emits an OSC 7 that is not a URL, the terminal output itself does not stop.
        }
        return false
      })
    ]
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth > 0 && element.offsetHeight > 0) fitAddon.fit()
    })
    observer.observe(element)
    const frame = requestAnimationFrame(() => fitAddon.fit())

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      subscriptions.forEach((subscription) => subscription.dispose())
      nextTerminal.dispose()
      terminal.current = null
      fit.current = null
      search.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      fit.current?.fit()
      // While walking the tabs with arrows, do not steal focus into the contents and block the next arrow.
      if (!root.current?.ownerDocument.activeElement?.closest('[role="tablist"]')) {
        terminal.current?.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  return <Root ref={root} active={active} role="application" aria-label={terminalLabel} />
}

export const TerminalView = forwardRef(TerminalViewInner)
