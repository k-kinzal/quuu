import {
  Button,
  DataList,
  DisclosureCaret,
  Reveal,
  Row,
  Text,
  claimContextMenu,
  useTheme,
  type MenuItemSpec
} from '@design-system/react'
import { useState } from 'react'
import type { Run } from '../../../preload/api/execution.js'
import { copyItem, group, selectionItems } from '../interaction/contextMenu.js'
import { moveWithinList, rowActivation } from '../interaction/focus.js'
import { contextMenu } from '../interaction/menu.js'
import { openWithItems } from '../interaction/openWith.js'
import { clockTime, duration, formatArgs, shortSession } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { RUN_ERROR_KIND_LABEL, RUN_STATUS_LABEL } from '../model/labels.js'
import { fallbackAgentChain } from '../model/runHistory.js'
import { RunChain, RunDuration, RunResult, RunRow, RunTable, RunTarget, RunTime } from '../ui/runs.js'
import { runStatusColor } from '../ui/StatusDot.js'

interface Props {
  runs: Run[]
  agentNames: Map<string, string>
  selectedRunId: string | null
  now: number
  onSelect(runId: string): void
  onCancel(runId: string): void
}

/**
 * A table for cross-checking (28px). Time, agent, result, and duration line up
 * in columns, so "when it ran with what, where it fell over, where it switched to"
 * reads vertically.
 */
export function RunHistory({
  runs,
  agentNames,
  selectedRunId,
  now,
  onSelect,
  onCancel
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null)
  const theme = useTheme()
  const runsById = new Map(runs.map((run) => [run.id, run]))

  /**
   * What can be taken away from a single run.
   *
   * These used to require opening the row (command, log, working directory).
   * Chasing a failure wants exactly those 3, so offer them right on the row.
   */
  const runItems = (run: Run): MenuItemSpec[] => [
    ...selectionItems(),
    ...copyItem(t('runHistory.copyCommand'), `${run.command} ${formatArgs(run.args)}`.trim()),
    ...copyItem(t('runHistory.copySessionId'), run.sessionId),
    ...copyItem(t('runHistory.copyError'), run.errorMessage),
    ...copyItem(t('runHistory.copyCwd'), run.cwd),
    { label: t('runHistory.showLog'), separatorBefore: true, onSelect: () => void window.quuu.system.reveal(run.stdoutLogPath) },
    // Open where that run lived. A past run may be somewhere different from now (worktree)
    ...group(openWithItems({ kind: 'run', id: run.id })),
    ...(run.status === 'running' || run.status === 'starting'
      ? [{ label: t('runHistory.cancel'), separatorBefore: true, onSelect: () => onCancel(run.id) }]
      : [])
  ]

  if (runs.length === 0) {
    return (
      <Text size="sm" tone="tertiary">
        {t('runHistory.empty')}
      </Text>
    )
  }

  return (
    /* Vertically stacked rows are walked with ↑↓ (same hand movement as the list and rail) */
    <RunTable onKeyDown={(e) => moveWithinList(e, '[role="button"]')}>
      {runs.map((run) => {
        const isOpen = expanded === run.id
        const chain = fallbackAgentChain(run, runsById)

        return (
          <div key={run.id}>
            <RunRow
              selected={run.id === selectedRunId}
              {...rowActivation(() => {
                onSelect(run.id)
                setExpanded(isOpen ? null : run.id)
              })}
              onClick={() => {
                onSelect(run.id)
                setExpanded(isOpen ? null : run.id)
              }}
              onContextMenu={(e) => {
                if (claimContextMenu(e)) void contextMenu(runItems(run))
              }}
            >
              <DisclosureCaret open={isOpen} />
              <RunTime>{clockTime(run.startedAt)}</RunTime>
              <RunTarget>
                {agentNames.get(run.agentId) ?? run.agentId}
                {run.kind === 'followup' && t('runHistory.followup')}
              </RunTarget>
              <RunResult color={runStatusColor(theme, run.status)}>
                {RUN_STATUS_LABEL[run.status]}
              </RunResult>
              <RunDuration>{duration(run.startedAt, run.endedAt, now)}</RunDuration>
            </RunRow>

            {chain.length > 1 && <RunChain>{t('runHistory.chain', {
              agents: chain.map((id) => agentNames.get(id) ?? id).join(' → '),
              status: RUN_STATUS_LABEL[run.status]
            })}</RunChain>}

            <Reveal open={isOpen}>
              {() => (
                <DataList placement="history">
                  <dt>{t('runHistory.command')}</dt>
                  <dd>
                    {run.command} {formatArgs(run.args)}
                  </dd>

                  <dt>{t('runHistory.cwd')}</dt>
                  <dd title={run.cwd}>
                    <Text truncate mono>
                      {run.cwd}
                    </Text>
                  </dd>

                  <dt>{t('runHistory.session')}</dt>
                  <dd>{shortSession(run.sessionId)}…</dd>

                  {run.promptPreview && (
                    <>
                      <dt>{t('runHistory.sent')}</dt>
                      <dd>
                        <Text preWrap selectable mono={false}>
                          {run.promptPreview}
                        </Text>
                      </dd>
                    </>
                  )}

                  {run.errorKind && (
                    <>
                      <dt>{t('runHistory.error')}</dt>
                      <dd>
                        <Text tone="danger" mono={false}>
                          {RUN_ERROR_KIND_LABEL[run.errorKind]}
                          {run.errorMessage && ` — ${run.errorMessage}`}
                        </Text>
                      </dd>
                    </>
                  )}

                  <dt>{t('runHistory.exitCode')}</dt>
                  <dd>{run.exitCode ?? '—'}</dd>

                  <dt />
                  <dd>
                    <Row>
                      <Button
                        size="xs"
                        onClick={() =>
                          void window.quuu.system.copy(`${run.command} ${formatArgs(run.args)}`)
                        }
                      >
                        {t('runHistory.copyCommand')}
                      </Button>
                      <Button
                        size="xs"
                        onClick={() => void window.quuu.system.reveal(run.stdoutLogPath)}
                      >
                        {t('runHistory.runLog')}
                      </Button>
                      {(run.status === 'running' || run.status === 'starting') && (
                        <Button size="xs" variant="ghost" color="error" onClick={() => onCancel(run.id)}>
                          {t('runHistory.cancel')}
                        </Button>
                      )}
                    </Row>
                  </dd>
                </DataList>
              )}
            </Reveal>
          </div>
        )
      })}
    </RunTable>
  )
}
