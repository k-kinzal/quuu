import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExternalLink, FileText, GitPullRequest } from 'lucide-react'
import { useState } from 'react'
import { ThemeProvider, useTheme } from '../../theme/ThemeProvider.js'
import { Panel } from '../layout/Panel.js'
import { ItemGroupHeader, ItemList } from './ItemList.js'
import { ResourceItem } from './ResourceItem.js'
import { Dot } from './StatusIndicator.js'

const meta: Meta = { title: 'Data Display/ResourceItem', parameters: { layout: 'fullscreen' } }
export default meta

function Resources({ narrow = false }: { narrow?: boolean }): JSX.Element {
  const [selected, setSelected] = useState('requirements · Docs')
  const websites = ['bison-parser · Docs', 'requirements · Docs', 'sql-semantics-mysql · Docs',
    'sql-semantics-mysql · SQL Semantics', '日本語の長いドキュメント名と導入ガイド']
  const files = ['README.md', 'guide.md', 'understanding-schema-binding-and-statement-models.md']
  return <Panel width={narrow ? 220 : 256} bordered="right" style={{ height: '100vh' }}>
    <ItemList>
      <ItemGroupHeader>Documentation sites</ItemGroupHeader>
      {websites.map(label => <ResourceItem key={label} label={label} description="example.github.io"
        icon={<ExternalLink />} selected={selected === label} onClick={() => setSelected(label)} />)}
      <ItemGroupHeader>Repository files</ItemGroupHeader>
      {files.map(label => <ResourceItem key={label} label={label} description={label === 'README.md' ? undefined : 'packages/semantics/docs'}
        icon={<FileText />} selected={selected === label} onClick={() => setSelected(label)} />)}
    </ItemList>
  </Panel>
}

/** A state mark at the end of the row stays on the name's line however far the name wraps. */
function WithMeta(): JSX.Element {
  const theme = useTheme()
  const [selected, setSelected] = useState(1)
  const rows = [
    { title: '#12 Parse window functions', context: 'Write the parser', color: theme.palette.success.main },
    { title: '#9 A long title that wraps onto a second line to show where the mark stays', context: 'Conflicts with the base branch · Docs', color: theme.palette.error.main },
    { title: '#7 Bump dependencies', context: 'Maintenance', color: theme.palette.warning.main }
  ]
  return <Panel width={256} bordered="right" style={{ height: '100vh' }}>
    <ItemList>
      {rows.map((row, index) => <ResourceItem key={row.title} label={row.title} description={row.context}
        icon={<GitPullRequest color={theme.palette.success.main} />} meta={<Dot color={row.color} />}
        selected={selected === index} onClick={() => setSelected(index)} />)}
    </ItemList>
  </Panel>
}

export const Default: StoryObj = { render: () => <Resources /> }
export const Narrow: StoryObj = { render: () => <Resources narrow /> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><Resources /></ThemeProvider> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><Resources /></ThemeProvider> }
export const StateMark: StoryObj = { render: () => <WithMeta /> }
