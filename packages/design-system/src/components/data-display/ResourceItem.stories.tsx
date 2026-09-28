import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExternalLink, FileText } from 'lucide-react'
import { useState } from 'react'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { Panel } from '../layout/Panel.js'
import { ItemGroupHeader, ItemList } from './ItemList.js'
import { ResourceItem } from './ResourceItem.js'

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

export const Default: StoryObj = { render: () => <Resources /> }
export const Narrow: StoryObj = { render: () => <Resources narrow /> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><Resources /></ThemeProvider> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><Resources /></ThemeProvider> }
