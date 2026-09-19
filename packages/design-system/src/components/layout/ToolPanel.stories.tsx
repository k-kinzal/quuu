import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRight, FileCode2, ListFilter, Play, Search } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { ProgressBar } from '../data-display/ProgressBar.js'
import { Text } from '../data-display/Text.js'
import { IconButton } from '../inputs/Button.js'
import { SearchInput } from '../inputs/InlineInput.js'
import { Spacer } from './Stack.js'
import {
  ToolPanel,
  ToolPanelDisclosure,
  ToolPanelFooter,
  ToolPanelGroup,
  ToolPanelGroupHeader,
  ToolPanelMetric,
  ToolPanelMetricGrid,
  ToolPanelRow,
  ToolPanelRowBody,
  ToolPanelRowDetail,
  ToolPanelRowLabel,
  ToolPanelRowProgress,
  ToolPanelScroller,
  ToolPanelSummary,
  ToolPanelSummaryRow,
  ToolPanelToolbar
} from './ToolPanel.js'

const meta: Meta<typeof ToolPanel> = {
  title: 'Layout/ToolPanel',
  component: ToolPanel,
  parameters: { layout: 'centered' }
}
export default meta

/** An IDE-style ancillary surface that aligns the context, the comparable rows, and the primary action after selection onto a single vertical axis. */
export const CoverageAndActions: StoryObj<typeof ToolPanel> = {
  render: function Render() {
    const [selected, setSelected] = useState('src/parser.ts')
    return (
      <div style={{ width: 320, height: 520 }}>
        <ToolPanel>
          <ToolPanelToolbar>
            <SearchInput
              fill
              placeholder="Search files"
              icon={<Search size={iconSize.sm} {...iconDefaults} />}
            />
            <IconButton
              size="small"
              title="Show incomplete only"
              icon={<ListFilter size={iconSize.sm} {...iconDefaults} />}
            />
          </ToolPanelToolbar>
          <ToolPanelSummary>
            <ToolPanelSummaryRow>
              <Text size="xl" weight="bold" tabular>71.4%</Text>
              <Spacer />
              <Text size="xs" tone="tertiary" tabular>25 / 35</Text>
            </ToolPanelSummaryRow>
            <ProgressBar value={71.4} tone="warning" label="Line coverage 71.4%" />
            <ToolPanelMetricGrid>
              <ToolPanelMetric selected><span>Lines</span><span>71.4%</span></ToolPanelMetric>
              <ToolPanelMetric><span>Branches</span><span>62.5%</span></ToolPanelMetric>
              <ToolPanelMetric><span>Functions</span><span>82.6%</span></ToolPanelMetric>
              <ToolPanelMetric><span>Statements</span><span>75.6%</span></ToolPanelMetric>
            </ToolPanelMetricGrid>
          </ToolPanelSummary>
          <ToolPanelScroller>
            <ToolPanelGroup open>
              <ToolPanelGroupHeader>
                <ToolPanelDisclosure><ChevronRight size={iconSize.sm} {...iconDefaults} /></ToolPanelDisclosure>
                <FileCode2 size={iconSize.sm} {...iconDefaults} />
                <span>src</span>
              </ToolPanelGroupHeader>
              {[
                { path: 'src/parser.ts', value: 42.8 },
                { path: 'src/runner.ts', value: 66.7 },
                { path: 'src/index.ts', value: 100 }
              ].map((file) => (
                <ToolPanelRow
                  key={file.path}
                  lines={2}
                  depth={1}
                  selected={selected === file.path}
                  onClick={() => setSelected(file.path)}
                >
                  <ToolPanelRowBody>
                    <ToolPanelRowLabel>{file.path}</ToolPanelRowLabel>
                    <ToolPanelRowProgress>
                      <ProgressBar
                        value={file.value}
                        tone={file.value === 100 ? 'success' : file.value >= 60 ? 'warning' : 'danger'}
                        label={`${file.path} ${String(file.value)}%`}
                      />
                      <span>{file.value.toFixed(1)}%</span>
                    </ToolPanelRowProgress>
                  </ToolPanelRowBody>
                </ToolPanelRow>
              ))}
            </ToolPanelGroup>
          </ToolPanelScroller>
          <ToolPanelFooter>
            <ToolPanelRowDetail>{selected}</ToolPanelRowDetail>
            <Spacer />
            <IconButton
              size="small"
              title="Open selection"
              icon={<Play size={iconSize.sm} {...iconDefaults} />}
            />
          </ToolPanelFooter>
        </ToolPanel>
      </div>
    )
  }
}
