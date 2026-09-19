import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { TreeView, type TreeNode } from './TreeView.js'

const meta: Meta = { title: 'Data Display/TreeView' }
export default meta

const fileIcon = <FileText size={iconSize.sm} {...iconDefaults} />
const folderIcon = <Folder size={iconSize.sm} {...iconDefaults} />
const nodes: TreeNode[] = [
  { id: 'src', label: 'src', icon: folderIcon, tone: 'warning', children: [
    { id: 'new', label: 'new', icon: folderIcon, tone: 'success', children: [
      { id: 'new-file', label: 'client.ts', icon: fileIcon, tone: 'success', description: 'Added' }
    ] },
    { id: 'removed', label: 'removed', icon: folderIcon, tone: 'danger', children: [
      { id: 'removed-file', label: 'legacy.ts', icon: fileIcon, tone: 'danger', description: 'Deleted' }
    ] },
    { id: 'modified', label: 'index.ts', icon: fileIcon, tone: 'warning', description: 'Modified' },
    { id: 'unchanged', label: 'unchanged.ts', icon: fileIcon }
  ] },
  { id: 'long', label: 'a-very-long-file-name-that-keeps-its-space-without-a-status-icon.ts', icon: fileIcon, tone: 'success' },
  { id: 'readme', label: 'README.md', icon: fileIcon }
]

function Example(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>('modified')
  return <div style={{ width: 280 }}>
    <TreeView nodes={nodes} label="Files" selectedId={selectedId} onSelect={setSelectedId}
      defaultExpandedIds={['src', 'new', 'removed']}
      expandIcon={<ChevronRight size={iconSize.sm} {...iconDefaults} />}
      collapseIcon={<ChevronDown size={iconSize.sm} {...iconDefaults} />} />
  </div>
}

export const TintedRows: StoryObj = { render: () => <Example /> }
export const Comfortable: StoryObj = {
  render: (_args, { globals }) => <ThemeProvider colorScheme={globals.colorScheme === 'light' ? 'light' : 'dark'} density="comfortable"><Example /></ThemeProvider>
}
