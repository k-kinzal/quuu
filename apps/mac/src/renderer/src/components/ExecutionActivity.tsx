import { ActivityStatus, Badge, Text } from '@design-system/react'
import type { Run } from '../../../preload/api/execution.js'
import type { SessionMessage } from '../../../preload/api/session.js'
import { executionFeedback } from '../model/executionFeedback.js'
import { t } from '../model/i18n/index.js'
import { Turn, TurnBody, TurnHead, TurnRole, TurnRule, TurnText } from '../ui/session.js'

/** While waiting for the session to materialize, the handed-over instruction and the running execution never vanish from the chat. */
export function ExecutionActivity({ run, messages }: { run: Run; messages: SessionMessage[] }): JSX.Element | null {
  const progress = executionFeedback(run, messages)
  if (!progress.active) return null
  return <>
    {progress.preview && <Turn>
      <TurnHead><TurnRole user>{t('executionActivity.you')}</TurnRole><Badge tone="info">{t('executionActivity.sent')}</Badge><TurnRule /></TurnHead>
      <TurnBody><TurnText role="user"><Text preWrap>{progress.preview}</Text></TurnText></TurnBody>
    </Turn>}
    <ActivityStatus label={progress.label} />
  </>
}
