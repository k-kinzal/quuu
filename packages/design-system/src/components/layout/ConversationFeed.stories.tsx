import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConversationFeed, conversationBlock } from './ConversationFeed.js'
import { ConversationRoot } from './ConversationLayout.js'
import { Row } from './Stack.js'
import { Button } from '../inputs/Button.js'
import { Markdown } from '../data-display/Markdown.js'
import { TranscriptTurn, TranscriptTurnBody, TranscriptTurnText } from '../data-display/Transcript.js'

export default { title: 'Layout/Conversation Feed' } satisfies Meta

const paragraph = 'A complete block arrives together. The earlier content moves up as this text becomes readable, keeping the next thing to read close at hand.'

function Example(): JSX.Element {
  const [blocks, setBlocks] = useState(() => Array.from({ length: 8 }, (_, i) => ({ id: String(i), text: `**Block ${i + 1}**\n\n${paragraph}` })))
  const [follow, setFollow] = useState(true)
  const [live, setLive] = useState(false)
  const sequence = useRef(8)
  const append = (long = false): void => {
    const id = String(sequence.current++)
    setBlocks(current => [...current, { id, text: `**Block ${Number(id) + 1}**\n\n${Array.from({ length: long ? 16 : 1 }, () => paragraph).join('\n\n')}` }])
  }
  useEffect(() => {
    if (!live) return
    const timer = window.setInterval(() => {
      const id = String(sequence.current++)
      setBlocks(current => [...current.slice(-30), { id, text: `**Block ${Number(id) + 1}**\n\n${paragraph}` }])
    }, 120)
    return () => window.clearInterval(timer)
  }, [live])
  return <div style={{ height: 560, display: 'flex', flexDirection: 'column' }}>
    <Row gap="sm">
      <Button onClick={() => append()}>Add block</Button>
      <Button onClick={() => setBlocks(current => current.map((block, i) => i === current.length - 1 ? { ...block, text: `${block.text}\n\n${paragraph}` } : block))}>Extend block</Button>
      <Button onClick={() => append(true)}>Add long block</Button>
      <Button onClick={() => setLive(!live)}>{live ? 'Stop burst' : 'Start burst'}</Button>
      <Button onClick={() => { setBlocks([]); setFollow(true) }}>Clear</Button>
      {!follow && <Button onClick={() => setFollow(true)}>Latest</Button>}
    </Row>
    <ConversationRoot>
      <ConversationFeed revision={blocks} contextKey="example" follow={follow} aria-label="Conversation"
        onScroll={event => {
          const node = event.currentTarget
          setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 48)
        }}>
        <TranscriptTurn><TranscriptTurnBody>
          {blocks.map(block => <div key={block.id} {...conversationBlock(block.id)}>
            <TranscriptTurnText><Markdown>{block.text}</Markdown></TranscriptTurnText>
          </div>)}
        </TranscriptTurnBody></TranscriptTurn>
      </ConversationFeed>
    </ConversationRoot>
  </div>
}

export const Arrivals: StoryObj = { render: () => <Example /> }
