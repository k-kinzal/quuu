import { Button, Column, FieldHint, Row, Spacer, Text, TranscriptDetailSection, TranscriptNestedFeed } from '@design-system/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { AuxiliaryPageInput } from '../../../api/schemas/auxiliary.js'
import type { SessionMessage } from '../../../api/schemas/session.js'
import { t } from '../model/i18n/index.js'
import { buildTurns } from '../model/summarize.js'
import { queryClient } from '../state/queryClient.js'
import { SessionImageReader } from './SessionImages.js'
import { SessionTurn } from './SessionTurn.js'

/** A read-only conversation inside an execution, independent of the task's selected session. */
export function HookConversation({ kind, id, revision, running, active, name }: {
  kind: 'hooks' | 'report'; id: string; revision: string; running: boolean; active: boolean; name: string
}): JSX.Element {
  const [cursor, setCursor] = useState<Omit<AuxiliaryPageInput, 'id'>>({})
  const [follow, setFollow] = useState(true)
  const log = useQuery({
    queryKey: [kind, 'conversation', id, revision, cursor],
    queryFn: () => window.quuu[kind].conversation({ id, ...cursor }),
    enabled: active, refetchInterval: active && running ? 1000 : false,
    placeholderData: keepPreviousData, retry: false, networkMode: 'always'
  }, queryClient)
  const readImage = useCallback((imageId: string) => window.quuu[kind].image({ id, imageId }), [kind, id])
  const page = log.data
  let messages: SessionMessage[] = page?.messages ?? []
  // Structured sessions normally carry their instruction. Fallback output needs the recorded input.
  if (page?.input && (page.first ?? 0) === 0 && messages[0]?.role !== 'user') {
    messages = [{ id: 'instruction', role: 'user', blocks: [{ kind: 'text', text: page.input }],
      timestamp: null, isSidechain: false, model: null }, ...messages]
  }
  const move = (direction: 'older' | 'newer' | 'latest'): void => {
    setFollow(direction === 'latest')
    setCursor(direction === 'latest' ? {} : { generation: page?.generation,
      ...(direction === 'older' ? { before: page?.first } : { after: page?.last }) })
  }
  return <SessionImageReader.Provider value={readImage}>
    <TranscriptDetailSection><Row gap="sm" wrap>
      <Text size="xs" tone="secondary">{t('hooks.conversation')}</Text>
      {!!page?.totalMessages && <Text size="xs" tone="tertiary" tabular>{t('hooks.messageRange', {
        first: (page.first ?? 0) + 1, last: page.last ?? page.totalMessages, total: page.totalMessages
      })}</Text>}
      <Spacer />
      {page?.hasMore && <Button size="xs" variant="ghost" disabled={log.isFetching} onClick={() => move('older')}>{t('hooks.olderMessages')}</Button>}
      {page?.hasNewer && <Button size="xs" variant="ghost" disabled={log.isFetching} onClick={() => move('newer')}>{t('hooks.newerMessages')}</Button>}
      {(page?.hasNewer || !follow) && <Button size="xs" variant="ghost" onClick={() => move('latest')}>{t('hooks.latestMessages')}</Button>}
    </Row></TranscriptDetailSection>
    <TranscriptNestedFeed key={`${page?.generation ?? 'loading'}:${cursor.before ?? cursor.after ?? 'latest'}`}
      role="region" aria-label={t('hooks.conversationLabel', { name })} tabIndex={0}
      revision={page} contextKey={`${kind}:${id}`} active={active} follow={follow && !page?.hasNewer}
      aria-busy={log.isFetching}
      onScroll={event => {
        const node = event.currentTarget
        setFollow(node.scrollHeight - node.scrollTop <= node.clientHeight + 1)
      }}>
      {buildTurns(messages).map(turn => <SessionTurn key={turn.id} turn={turn} cwd={page?.cwd ?? null} embedded roleLabel={turn.role === 'user' ? t('hooks.instruction') : undefined} />)}
      {!page?.messages.length && !log.error && <Text size="xs" tone="tertiary">
        {t(log.isLoading ? 'hooks.loadingOutput' : running ? 'hooks.waitingOutput' : page?.exists === false ? 'hooks.logUnavailable' : 'hooks.noOutput')}
      </Text>}
      {log.error && <Column gap="sm"><FieldHint tone="danger">{log.error.message}</FieldHint>
        <Row><Button size="xs" disabled={log.isFetching} onClick={() => void log.refetch()}>{t('hooks.reloadConversation')}</Button></Row>
      </Column>}
    </TranscriptNestedFeed>
  </SessionImageReader.Provider>
}
