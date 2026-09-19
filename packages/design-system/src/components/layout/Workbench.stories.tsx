import { Fragment, useId, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Braces,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Files,
  ListChecks,
  MessageSquareText,
  Terminal,
  X
} from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { DiffView } from '../data-display/DiffView.js'
import { Text } from '../data-display/Text.js'
import { TreeView } from '../data-display/TreeView.js'
import { IconButton } from '../inputs/Button.js'
import { ContentTabPanel, ContentTabs } from '../navigation/ContentTabs.js'
import { ActivityBar } from '../navigation/ActivityBar.js'
import { Spacer } from './Stack.js'
import { StackResizer } from './Resizer.js'
import {
  EditorTabBar,
  PaneStack,
  Workbench,
  WorkbenchPane,
  WorkbenchPaneBody,
  WorkbenchPaneHeader
} from './Workbench.js'

const meta: Meta = { title: 'Layout/Workbench', parameters: { layout: 'fullscreen' } }
export default meta

const WORK = [
  { id: 'conversation', label: 'Conversation', icon: <MessageSquareText size={iconSize.md} {...iconDefaults} /> },
  { id: 'changes', label: 'Changes', icon: <Files size={iconSize.md} {...iconDefaults} />, badge: 4 },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={iconSize.md} {...iconDefaults} /> }
]

const INFO = [
  { id: 'outline', label: 'Outline', icon: <Braces size={iconSize.md} {...iconDefaults} /> },
  { id: 'checks', label: 'Checks', icon: <ListChecks size={iconSize.md} {...iconDefaults} /> }
]

function resizePair(
  current: Record<string, number>,
  before: string,
  after: string,
  share: number
): Record<string, number> {
  const total = current[before] + current[after]
  return { ...current, [before]: total * share, [after]: total * (1 - share) }
}

/** The glyphs open and close panes. Several panes can be stacked at once. */
export const MultiplePanes: StoryObj = {
  render: function Render() {
    const tabsId = useId()
    const [order, setOrder] = useState(WORK.map((item) => item.id))
    const [visible, setVisible] = useState(['conversation', 'changes'])
    const [active, setActive] = useState('changes')
    const [info, setInfo] = useState(['outline', 'checks'])
    const [workSizes, setWorkSizes] = useState<Record<string, number>>({
      conversation: 1,
      changes: 2,
      terminal: 1
    })
    const [infoSizes, setInfoSizes] = useState<Record<string, number>>({ outline: 1, checks: 1 })
    const items = order.map((id) => WORK.find((item) => item.id === id)!)
    const shown = order.filter((id) => visible.includes(id))

    return (
      <Workbench style={{ height: '100vh' }}>
        <ActivityBar
          label="Work panes"
          items={items}
          visibleIds={visible}
          activeId={active}
          onToggle={(id) => {
            setActive(id)
            setVisible((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
          }}
          onReorder={setOrder}
        />

        <PaneStack>
          {shown.map((id, index) => {
            const previous = shown[index - 1]
            return (
              <Fragment key={id}>
                {previous && (
                  <StackResizer
                    value={workSizes[previous] / (workSizes[previous] + workSizes[id])}
                    label={`Height of ${previous} and ${id}`}
                    onChange={(share) =>
                      setWorkSizes((current) => resizePair(current, previous, id, share))
                    }
                  />
                )}
                <WorkbenchPane grow={workSizes[id]}>
                  <WorkbenchPaneHeader>
                    {WORK.find((item) => item.id === id)?.icon}
                    <span>{WORK.find((item) => item.id === id)?.label}</span>
                    <Spacer />
                    <IconButton
                      size="xs"
                      title="Close"
                      icon={<X size={iconSize.sm} {...iconDefaults} />}
                      onClick={() => setVisible((current) => current.filter((value) => value !== id))}
                    />
                  </WorkbenchPaneHeader>
                  <WorkbenchPaneBody>
                    {id === 'changes' ? (
                      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                        <div style={{ width: 220, display: 'flex', borderRight: '1px solid currentColor' }}>
                          <TreeView
                            label="Files"
                            expandIcon={<ChevronRight size={iconSize.sm} {...iconDefaults} />}
                            collapseIcon={<ChevronDown size={iconSize.sm} {...iconDefaults} />}
                            nodes={[
                              {
                                id: 'src',
                                label: 'src',
                                children: [
                                  { id: 'src/index.ts', label: 'index.ts', icon: <FileCode2 size={iconSize.sm} {...iconDefaults} /> }
                                ]
                              },
                              { id: 'README.md', label: 'README.md' }
                            ]}
                          />
                        </div>
                        <PaneStack>
                          <EditorTabBar>
                            <ContentTabs idBase={tabsId} label="Documents" appearance="document" value="index.ts" onChange={() => {}} options={[{ value: 'index.ts', label: 'index.ts', icon: <FileCode2 size={iconSize.sm} {...iconDefaults} /> }]} />
                          </EditorTabBar>
                          <ContentTabPanel idBase={tabsId} value="index.ts" activeValue="index.ts">
                          <DiffView
                            language="typescript"
                            lines={[
                              { kind: 'hunk', oldLine: null, newLine: null, text: 'createClient' },
                              { kind: 'context', oldLine: 12, newLine: 12, text: 'export function createClient() {' },
                              { kind: 'deleted', oldLine: 13, newLine: null, text: '  return legacy' },
                              { kind: 'added', oldLine: null, newLine: 13, text: '  return current' },
                              { kind: 'context', oldLine: 14, newLine: 14, text: '}' }
                            ]}
                          />
                          </ContentTabPanel>
                        </PaneStack>
                      </div>
                    ) : (
                      <Text size="sm" tone="secondary" sx={{ p: 4 }}>
                        {id === 'conversation' ? 'What the work is' : "The project's working directory"}
                      </Text>
                    )}
                  </WorkbenchPaneBody>
                </WorkbenchPane>
              </Fragment>
            )
          })}
        </PaneStack>

        <PaneStack style={{ flex: '0 0 260px' }}>
          {info.map((id, index) => {
            const previous = info[index - 1]
            return (
              <Fragment key={id}>
                {previous && (
                  <StackResizer
                    value={infoSizes[previous] / (infoSizes[previous] + infoSizes[id])}
                    label={`Height of ${previous} and ${id}`}
                    onChange={(share) =>
                      setInfoSizes((current) => resizePair(current, previous, id, share))
                    }
                  />
                )}
                <WorkbenchPane grow={infoSizes[id]} surface="default">
                  <WorkbenchPaneHeader>
                    {INFO.find((item) => item.id === id)?.icon}
                    <span>{INFO.find((item) => item.id === id)?.label}</span>
                    <Spacer />
                    <IconButton
                      size="xs"
                      title="Close"
                      icon={<X size={iconSize.sm} {...iconDefaults} />}
                      onClick={() => setInfo((current) => current.filter((value) => value !== id))}
                    />
                  </WorkbenchPaneHeader>
                  <WorkbenchPaneBody pad={3}>
                    <Text size="sm" tone="secondary">Stack several information panes</Text>
                  </WorkbenchPaneBody>
                </WorkbenchPane>
              </Fragment>
            )
          })}
        </PaneStack>
        <ActivityBar
          label="Information panes"
          side="right"
          items={INFO}
          visibleIds={info}
          onToggle={(id) => setInfo((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
        />
      </Workbench>
    )
  }
}
