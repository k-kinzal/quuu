import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ArrowLeft, Bot, ChevronDown, MessageSquareText, Send, ThumbsDown, ThumbsUp, User } from 'lucide-react'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { ConversationWorkspace } from '../layout/ConversationWorkspace.js'
import { ConversationFeed } from '../layout/ConversationFeed.js'
import { Panel, PanelHeader, PanelHeading } from '../layout/Panel.js'
import { Composer, ComposerActions, ComposerBox, ComposerInput, ComposerInputRow } from '../inputs/Composer.js'
import { Button, IconButton } from '../inputs/Button.js'
import { ReactionButton } from '../inputs/ReactionButton.js'
import { Message, MessageActions, MessageAttachment, MessageColumn, MessageExcerpt, MessageGroup } from './Message.js'
import { Markdown } from './Markdown.js'

export default { title: 'Data display/Messages' } satisfies Meta

export function MessageSpecimen({ width, threadInitiallyOpen = false }: { width?: number; threadInitiallyOpen?: boolean }): JSX.Element {
  const [thread, setThread] = useState(threadInitiallyOpen)
  const [reaction, setReaction] = useState<'positive' | 'negative' | null>(null)
  const [message, setMessage] = useState('')
  const icon = { size: iconSize.md, ...iconDefaults }
  const reason = '前の会話で挙がった変更をまとめました。まず通知から続きを開けるようにすると、作業を探し直す手間が減りそうです。'
  const input = (reply: boolean): JSX.Element => <Composer><MessageColumn><ComposerBox><ComposerInputRow>
    <ComposerInput rows={1} aria-label={reply ? 'Reply' : 'Message'} placeholder={reply ? 'スレッドに返信…' : 'メッセージ…'} value={message} onChange={e => setMessage(e.target.value)} />
    <ComposerActions><IconButton title="Send message" icon={<Send {...icon} />} disabled={!message.trim()} /></ComposerActions>
  </ComposerInputRow></ComposerBox></MessageColumn></Composer>
  const attachment = <MessageAttachment title="通知から会話の続きに戻れるようにする" meta="Desktop app" caret={<ChevronDown {...icon} />}>
    <Markdown>{'起動時に通知の参照先を復元し、会話の続きを開きます。\n\n- 再起動後の遷移を確認\n- すでに開いている会話の位置を保持'}</Markdown>
  </MessageAttachment>
  return <div data-message-workspace style={{ width: width ?? '100%', height: 620, display: 'flex' }}>
    <ConversationWorkspace threadOpen={thread}>
      <Panel surface="canvas" data-conversation-channel>
        <PanelHeader><PanelHeading>Assistant</PanelHeading></PanelHeader>
        <ConversationFeed follow={false} contextKey="messages" revision={1}>
          <MessageColumn>
            <MessageGroup><Message speaker="あなた" icon={<User {...icon} />} meta="10:12">
              <Markdown>今日の作業で優先すべきことを教えて。昨日の続きから進めたいです。</Markdown>
            </Message></MessageGroup>
            <MessageGroup selected={thread}><Message speaker="Assistant" icon={<Bot {...icon} />} meta="10:14">
              <Markdown>{reason}</Markdown>
              {attachment}
              <MessageActions>
                <ReactionButton title="Accept suggestion" icon={<ThumbsUp {...icon} />} selected={reaction === 'positive'} onClick={() => setReaction('positive')} />
                <ReactionButton title="Dismiss suggestion" icon={<ThumbsDown {...icon} />} selected={reaction === 'negative'} onClick={() => setReaction('negative')} />
                <Button variant="ghost" size="xs" startIcon={<MessageSquareText {...icon} />} onClick={() => setThread(true)}>2件の返信</Button>
              </MessageActions>
            </Message></MessageGroup>
            <MessageGroup><Message speaker="Assistant" icon={<Bot {...icon} />} meta="10:18">
              <MessageExcerpt>{'ほかの作業も順調に進んでいます。\n\nレビュー待ちの内容はスレッドで確認できます。'}</MessageExcerpt>
            </Message></MessageGroup>
          </MessageColumn>
        </ConversationFeed>
        {input(false)}
      </Panel>
      {thread && <Panel surface="canvas" bordered="left" data-conversation-thread>
        <PanelHeader><IconButton title="Close thread" icon={<ArrowLeft {...icon} />} onClick={() => setThread(false)} /><PanelHeading>通知から会話に戻る</PanelHeading></PanelHeader>
        <ConversationFeed follow={false} contextKey="thread" revision={1}>
          <MessageColumn>
            <MessageGroup><Message speaker="Assistant" icon={<Bot {...icon} />} meta="10:14"><Markdown>{reason}</Markdown>{attachment}</Message></MessageGroup>
            <MessageGroup><Message speaker="あなた" icon={<User {...icon} />} meta="10:15"><Markdown>開いていた位置も覚えておけますか？</Markdown></Message></MessageGroup>
            <MessageGroup><Message speaker="Assistant" icon={<Bot {...icon} />} meta="10:16"><Markdown>はい。会話のスクロール位置を保存し、同じ箇所から読めるようにできます。</Markdown></Message></MessageGroup>
          </MessageColumn>
        </ConversationFeed>
        {input(true)}
      </Panel>}
    </ConversationWorkspace>
  </div>
}

export const Dark: StoryObj = { render: () => <ThemeProvider colorScheme="dark"><MessageSpecimen /></ThemeProvider> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><MessageSpecimen /></ThemeProvider> }
export const Thread: StoryObj = { render: () => <MessageSpecimen threadInitiallyOpen /> }
export const Narrow: StoryObj = { render: () => <MessageSpecimen width={360} threadInitiallyOpen /> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><MessageSpecimen /></ThemeProvider> }
