import {
  IconButton,
  SearchInput,
  Spacer,
  Text,
  ToolPanel,
  ToolPanelRow,
  ToolPanelRowBody,
  ToolPanelRowIcon,
  ToolPanelRowLabel,
  ToolPanelRowMeta,
  ToolPanelScroller,
  ToolPanelSummary,
  ToolPanelSummaryRow,
  ToolPanelToolbar
} from '@design-system/react'
import { useMemo, useState } from 'react'
import type { CodeSymbol, ReviewFile } from '../../../preload/api/review.js'
import { t } from '../model/i18n/index.js'
import { ArrowDownAZ, Braces, CircleDot, Code2, FileText, Hash, ICON, Rows3, Search, iconProps } from '../ui/icons.js'

interface CodeStructurePaneProps {
  file: ReviewFile | null
  requestedLine: number | null
  onLine(line: number): void
}

function symbolIcon(symbol: CodeSymbol): JSX.Element {
  if (symbol.kind === 'class' || symbol.kind === 'interface' || symbol.kind === 'type') {
    return <Braces size={ICON.sm} {...iconProps} />
  }
  if (symbol.kind === 'heading') return <Hash size={ICON.sm} {...iconProps} />
  if (symbol.kind === 'variable') return <CircleDot size={ICON.sm} {...iconProps} />
  return <Code2 size={ICON.sm} {...iconProps} />
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

/** The Outline: search within the current file and jump to the matching line of code. */
export function CodeStructurePane({ file, requestedLine, onLine }: CodeStructurePaneProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [alphabetical, setAlphabetical] = useState(false)
  const symbols = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const values = file?.symbols.filter((symbol) =>
      !normalized || `${symbol.name} ${symbol.kind}`.toLocaleLowerCase().includes(normalized)
    ) ?? []
    return alphabetical
      ? [...values].sort((a, b) => a.name.localeCompare(b.name))
      : values
  }, [alphabetical, file, query])

  return (
    <ToolPanel>
      <ToolPanelToolbar>
        <SearchInput
          fill
          value={query}
          aria-label={t('codeStructurePane.searchLabel')}
          placeholder={t('codeStructurePane.searchPlaceholder')}
          icon={<Search size={ICON.sm} {...iconProps} />}
          onChange={(event) => setQuery(event.target.value)}
        />
        <IconButton
          size="xs"
          title={alphabetical ? t('codeStructurePane.sourceOrder') : t('codeStructurePane.nameOrder')}
          aria-pressed={alphabetical}
          icon={alphabetical
            ? <Rows3 size={ICON.sm} {...iconProps} />
            : <ArrowDownAZ size={ICON.sm} {...iconProps} />}
          onClick={() => setAlphabetical((value) => !value)}
        />
      </ToolPanelToolbar>

      {file && (
        <ToolPanelSummary>
          <ToolPanelSummaryRow>
            <FileText size={ICON.md} {...iconProps} />
            <Text size="sm" weight="medium" truncate title={file.path}>{fileName(file.path)}</Text>
            <Spacer />
            <Text size="xs" tone="tertiary" tabular>{file.symbols.length}</Text>
          </ToolPanelSummaryRow>
          <Text size="xs" tone="tertiary" mono truncate="start" title={file.path}>{file.path}</Text>
        </ToolPanelSummary>
      )}

      <ToolPanelScroller role="list" aria-label={t('codeStructurePane.listLabel')}>
        {symbols.map((symbol) => (
          <ToolPanelRow
            key={`${symbol.kind}:${String(symbol.line)}:${symbol.name}`}
            type="button"
            role="listitem"
            depth={symbol.depth}
            selected={requestedLine === symbol.line}
            title={t('codeStructurePane.symbolTitle', { name: symbol.name, line: symbol.line })}
            onClick={() => onLine(symbol.line)}
          >
            <ToolPanelRowIcon>{symbolIcon(symbol)}</ToolPanelRowIcon>
            <ToolPanelRowBody>
              <ToolPanelRowLabel>{symbol.name}</ToolPanelRowLabel>
            </ToolPanelRowBody>
            <ToolPanelRowMeta>{symbol.line}</ToolPanelRowMeta>
          </ToolPanelRow>
        ))}
      </ToolPanelScroller>
    </ToolPanel>
  )
}
