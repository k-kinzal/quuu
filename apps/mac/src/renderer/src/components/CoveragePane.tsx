import {
  IconButton,
  ProgressBar,
  SearchInput,
  Spacer,
  Text,
  ToolPanel,
  ToolPanelFooter,
  ToolPanelMetric,
  ToolPanelMetricGrid,
  ToolPanelRow,
  ToolPanelRowBody,
  ToolPanelRowLabel,
  ToolPanelRowProgress,
  ToolPanelScroller,
  ToolPanelSummary,
  ToolPanelSummaryRow,
  ToolPanelToolbar,
  type ProgressTone
} from '@design-system/react'
import { useEffect, useMemo, useState } from 'react'
import type { CoverageFile, CoverageMetric, CoverageSummary } from '../../../preload/api/review.js'
import { t } from '../model/i18n/index.js'
import { FileSearch, FileText, ICON, ListFilter, Search, iconProps } from '../ui/icons.js'

type MetricKey = 'lines' | 'functions' | 'branches' | 'statements'

const METRICS: Array<{ id: MetricKey; label: string }> = [
  { id: 'lines', label: t('coveragePane.lines') },
  { id: 'functions', label: t('coveragePane.functions') },
  { id: 'branches', label: t('coveragePane.branches') },
  { id: 'statements', label: t('coveragePane.statements') }
]

interface CoveragePaneProps {
  coverage: CoverageSummary | null
  onReveal(path: string, line: number | null): void
}

function tone(metric: CoverageMetric): ProgressTone {
  if (metric.percent >= 80) return 'success'
  if (metric.percent >= 60) return 'warning'
  return 'danger'
}

function percent(metric: CoverageMetric | undefined): string {
  return metric ? `${metric.percent.toFixed(1)}%` : '—'
}

function coveredLabel(metric: CoverageMetric): string {
  return `${String(metric.covered)} / ${String(metric.total)}`
}

/** Not for checking totals — a working pane for picking uncovered files and lines and jumping to the code. */
export function CoveragePane({ coverage, onReveal }: CoveragePaneProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [metricKey, setMetricKey] = useState<MetricKey>('lines')
  const [gapsOnly, setGapsOnly] = useState(true)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [uncoveredCursor, setUncoveredCursor] = useState(0)

  useEffect(() => {
    if (!coverage?.[metricKey]) {
      const available = METRICS.find(({ id }) => coverage?.[id])
      if (available) setMetricKey(available.id)
    }
  }, [coverage, metricKey])

  const files = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return [...(coverage?.files ?? [])]
      .filter((file) => file.path.toLocaleLowerCase().includes(normalized))
      .filter((file) => !gapsOnly || !file[metricKey] || file[metricKey].percent < 100)
      .sort((a, b) => (a[metricKey]?.percent ?? 101) - (b[metricKey]?.percent ?? 101) || a.path.localeCompare(b.path))
  }, [coverage?.files, gapsOnly, metricKey, query])

  const selected = coverage?.files.find((file) => file.path === selectedPath) ?? null
  const summaryMetric = coverage?.[metricKey]

  const reveal = (file: CoverageFile, cursor = 0): void => {
    const lines = file.uncoveredLines
    const normalizedCursor = lines.length > 0 ? cursor % lines.length : 0
    setSelectedPath(file.path)
    setUncoveredCursor(normalizedCursor)
    onReveal(file.path, lines[normalizedCursor] ?? null)
  }

  return (
    <ToolPanel>
      <ToolPanelToolbar>
        <SearchInput
          fill
          value={query}
          aria-label={t('coveragePane.searchLabel')}
          placeholder={t('coveragePane.searchPlaceholder')}
          icon={<Search size={ICON.sm} {...iconProps} />}
          onChange={(event) => setQuery(event.target.value)}
        />
        <IconButton
          size="xs"
          title={gapsOnly ? t('coveragePane.showAll') : t('coveragePane.showGaps')}
          aria-pressed={gapsOnly}
          color={gapsOnly ? 'primary' : 'default'}
          icon={<ListFilter size={ICON.sm} {...iconProps} />}
          onClick={() => setGapsOnly((value) => !value)}
        />
      </ToolPanelToolbar>

      {coverage && summaryMetric && (
        <ToolPanelSummary title={coverage.source}>
          <ToolPanelSummaryRow>
            <Text size="xl" weight="bold" tabular>{percent(summaryMetric)}</Text>
            <Spacer />
            <Text size="xs" tone="tertiary" tabular>{coveredLabel(summaryMetric)}</Text>
          </ToolPanelSummaryRow>
          <ProgressBar value={summaryMetric.percent} tone={tone(summaryMetric)} label={t('coveragePane.metricCoverage', { metric: METRICS.find(({ id }) => id === metricKey)?.label ?? '' })} />
          <ToolPanelMetricGrid>
            {METRICS.map(({ id, label }) => {
              const value = coverage[id]
              if (!value) return null
              return (
                <ToolPanelMetric
                  key={id}
                  type="button"
                  selected={metricKey === id}
                  aria-pressed={metricKey === id}
                  onClick={() => setMetricKey(id)}
                >
                  <span>{label}</span>
                  <span>{percent(value)}</span>
                </ToolPanelMetric>
              )
            })}
          </ToolPanelMetricGrid>
        </ToolPanelSummary>
      )}

      <ToolPanelScroller role="list" aria-label={t('coveragePane.listLabel')}>
        {files.map((file) => {
          const value = file[metricKey]
          return (
            <ToolPanelRow
              key={file.path}
              type="button"
              role="listitem"
              lines={2}
              selected={selectedPath === file.path}
              title={file.path}
              onClick={() => reveal(file)}
            >
              <FileText size={ICON.sm} {...iconProps} />
              <ToolPanelRowBody>
                <ToolPanelRowLabel>{file.path}</ToolPanelRowLabel>
                {value && (
                  <ToolPanelRowProgress>
                    <ProgressBar value={value.percent} tone={tone(value)} label={`${file.path} ${percent(value)}`} />
                    <span>{percent(value)}</span>
                  </ToolPanelRowProgress>
                )}
              </ToolPanelRowBody>
            </ToolPanelRow>
          )
        })}
      </ToolPanelScroller>

      {selected && (
        <ToolPanelFooter>
          <Text size="xs" mono truncate title={selected.path}>{selected.path}</Text>
          <Spacer />
          {selected.uncoveredLines.length > 0 && (
            <Text size="xs" tone="tertiary" tabular>
              {String(uncoveredCursor + 1)} / {String(selected.uncoveredLines.length)}
            </Text>
          )}
          <IconButton
            size="xs"
            title={selected.uncoveredLines.length > 0 ? t('coveragePane.nextUncovered') : t('coveragePane.openFile')}
            icon={<FileSearch size={ICON.sm} {...iconProps} />}
            onClick={() => reveal(selected, uncoveredCursor + 1)}
          />
        </ToolPanelFooter>
      )}
    </ToolPanel>
  )
}
