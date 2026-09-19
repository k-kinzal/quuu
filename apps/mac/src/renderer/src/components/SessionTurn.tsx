import { Reveal, Text, TranscriptCode, claimContextMenu, conversationBlock, type MenuItemSpec } from '@design-system/react'
import { useId, useState } from 'react'
import type { ToolCall } from '../../../preload/api/session.js'
import { copyItem, copyText, pathItems, selectionItems } from '../interaction/contextMenu.js'
import { contextMenu } from '../interaction/menu.js'
import { clockTime } from '../model/format.js'
import { t } from '../model/i18n/index.js'
import { ROLE_LABEL, describeTool, formatToolInput, inputLanguage, resultLanguage } from '../model/session.js'
import type { Turn, TurnItem } from '../model/summarize.js'
import { toolKind, turnText } from '../model/summarize.js'
import type { ToolTone } from '../ui/session.js'
import { ThinkingBody, ThinkingToggle, ToolCluster as ToolClusterRoot, ToolDetail, ToolEntry, ToolError, ToolImages, ToolLine, ToolVerb, TurnBody, TurnHead, TurnRole, Turn as TurnRoot, TurnRule, TurnText } from '../ui/session.js'
import { MessageBody } from './MessageBody.js'
import { SessionImages } from './SessionImages.js'

/**
 * Collapse a run of the same tool onto one line.
 *
 * Three `Write`s in a row don't take three lines; folded onto one, the fact "wrote 3 files"
 * and what they were read together.
 */
function ToolCluster({
  name,
  tools,
  cwd
}: {
  name: string
  tools: ToolCall[]
  cwd: string | null
}): JSX.Element {
  const id = useId()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(tools.length <= 3)
  const kind = toolKind(name)
  const tone: ToolTone = kind === 'write' ? 'write' : kind === 'shell' ? 'shell' : 'other'
  const shown = expanded ? tools : tools.slice(0, 1)

  /**
   * What can be extracted from one tool call.
   *
   * The conversation is a surface for "checking it later on your own machine", so
   * **the files and commands it touched have to come out verbatim**. Making someone expand
   * it and select the whole text is too long a path.
   */
  const toolItems = (tool: ToolCall): MenuItemSpec[] => {
    const full = describeTool(tool, cwd).full
    return [
      ...selectionItems(),
      ...(kind === 'write' || kind === 'read'
        ? pathItems(full, t('toolCluster.filePath'))
        : copyItem(kind === 'shell' ? t('toolCluster.copyCommand') : t('toolCluster.copyTarget'), full)),
      {
        label: t('toolCluster.copyInput'),
        separatorBefore: true,
        onSelect: () => copyText(formatToolInput(tool.input))
      },
      ...copyItem(t('toolCluster.copyResult'), tool.result)
    ]
  }

  return (
    <ToolClusterRoot tone={tone}>
      {shown.map((tool, i) => {
        const d = describeTool(tool, cwd)
        const open = openIndex === i
        return (
          <ToolEntry key={tool.id || i} open={open}>
            <ToolLine
              type="button"
              outcome={d.outcome}
              aria-expanded={open}
              aria-controls={`${id}-${i}`}
              onClick={() => setOpenIndex(open ? null : i)}
              onContextMenu={(e) => {
                if (claimContextMenu(e)) void contextMenu(toolItems(tool))
              }}
              title={d.full}
            >
              <ToolVerb data-verb>{d.verb}</ToolVerb>
              <span data-target>{d.target}</span>
              {d.outcome === 'error' && <span data-flag>{t('toolCluster.failed')}</span>}
              {d.outcome === 'pending' && <span data-flag>{t('toolCluster.running')}</span>}
            </ToolLine>

            {d.errorLine && !open && <ToolError>{d.errorLine}</ToolError>}

            <Reveal open={open}>
              {() => (
                <ToolDetail id={`${id}-${i}`}>
                  <TranscriptCode
                    label={t('toolCluster.input')}
                    code={formatToolInput(tool.input)}
                    language={inputLanguage(tool.input)}
                  />
                  {/* Tools that return images (reading a screenshot) show their result */}
                  {tool.images.length > 0 && (
                    <ToolImages>
                      <SessionImages images={tool.images} />
                    </ToolImages>
                  )}
                  {tool.result !== null && tool.result.length > 0 && (
                    <TranscriptCode
                      label={t('toolCluster.result')}
                      code={
                        tool.result.length > 6000
                          ? `${tool.result.slice(0, 6000)}\n${t('toolCluster.truncated')}`
                          : tool.result
                      }
                      language={resultLanguage(tool)}
                      tone={tool.isError ? 'danger' : 'default'}
                    />
                  )}
                </ToolDetail>
              )}
            </Reveal>
          </ToolEntry>
        )
      })}

      {!expanded && tools.length > 1 && (
        <ToolLine type="button" outcome="more" onClick={() => setExpanded(true)}>
          <ToolVerb data-verb />
          <span data-target>{t('toolCluster.showMore', { count: tools.length - 1 })}</span>
        </ToolLine>
      )}
    </ToolClusterRoot>
  )
}

function Thinking({ text }: { text: string }): JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div>
      <ThinkingToggle type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? t('thinking.hide') : t('thinking.show', { chars: text.length.toLocaleString() })}
      </ThinkingToggle>
      <Reveal open={open}>
        {() => (
          <ThinkingBody id={id}>
            {/* Thinking is written in Markdown too, but it isn't the body, so it stays at a lower rank */}
            <MessageBody text={text} subdued />
          </ThinkingBody>
        )}
      </Reveal>
    </div>
  )
}

function Item({
  item,
  role,
  cwd
}: {
  item: TurnItem
  role: Turn['role']
  cwd: string | null
}): JSX.Element {
  switch (item.kind) {
    case 'text':
      // A log (system) is output, not formatting. Show it as-is, uninterpreted
      return (
        <TurnText role={role}>
          {role === 'system' ? item.text : <MessageBody text={item.text} />}
        </TurnText>
      )
    case 'thinking':
      return <Thinking text={item.text} />
    case 'images':
      return <SessionImages images={item.images} />
    case 'tools':
      return <ToolCluster name={item.name} tools={item.tools} cwd={cwd} />
  }
}

/**
 * One turn = consecutive utterances by the same speaker.
 * The heading appears once per turn (it used to appear per message, and most of the screen
 * went to contentless labels like "Agent" and "15:13").
 */
export function SessionTurn({
  turn,
  cwd,
  headless
}: {
  turn: Turn
  cwd: string | null
  /** The section heading (`PromptSection`) is already carrying it. Don't draw the same line twice */
  headless?: boolean
}): JSX.Element {
  const prose = turnText(turn)
  const thinking = turn.items
    .filter((item): item is Extract<TurnItem, { kind: 'thinking' }> => item.kind === 'thinking')
    .map((item) => item.text)
    .join('\n\n')

  return (
    <TurnRoot
      sidechain={turn.isSidechain}
      /*
       * The conversation is a reading surface, so a menu of our own must never block the
       * OS's copy. With a selection, put it first; without one, make the whole utterance extractable
       */
      onContextMenu={(e) => {
        // A turn with nothing to extract (tools only) isn't intercepted. Leave it to the OS's copy
        if (!prose && !thinking) return
        if (!claimContextMenu(e)) return
        void contextMenu([
          ...selectionItems(),
          ...copyItem(t('sessionTurn.copyMessage'), prose),
          ...copyItem(t('sessionTurn.copyThinking'), thinking)
        ])
      }}
    >
      {!headless && (
        <TurnHead>
          <TurnRole user={turn.role === 'user'}>{ROLE_LABEL[turn.role] ?? turn.role}</TurnRole>
          {turn.isSidechain && <span>{t('sessionTurn.subagent')}</span>}
          <TurnRule />
          {turn.startedAt && (
            <Text tabular>
              {clockTime(turn.startedAt)}
              {turn.endedAt && turn.endedAt !== turn.startedAt && `–${clockTime(turn.endedAt)}`}
            </Text>
          )}
        </TurnHead>
      )}
      <TurnBody>
        {turn.items.map((item) => (
          <div key={item.id} data-chat-item={item.id} {...conversationBlock(item.id)}><Item item={item} role={turn.role} cwd={cwd} /></div>
        ))}
      </TurnBody>
    </TurnRoot>
  )
}
