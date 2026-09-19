import { useId, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText } from 'lucide-react'
import { ContentTabPanel, ContentTabs } from './ContentTabs.js'
import { EditorTabBar } from '../layout/Workbench.js'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { Text } from '../data-display/Text.js'

const meta: Meta = { title: 'Navigation/ContentTabs', parameters: { layout: 'fullscreen' } }
export default meta

function Documents(): JSX.Element {
  const id = useId()
  const [files, setFiles] = useState(['hooks.json', 'notes.md', 'a-very-long-file-name-that-never-hides-the-close-control.md', 'index.ts'])
  const [active, setActive] = useState<string | null>(files[0])
  return <div style={{ width: 600, maxWidth: '100%', height: 240, display: 'flex', flexDirection: 'column' }}>
    <EditorTabBar><ContentTabs idBase={id} label="Open documents" appearance="document" value={active}
      options={files.map(file => ({ value: file, label: file, icon: <FileText /> }))} onChange={setActive}
      onClose={file => {
        const remaining = files.filter(value => value !== file)
        setFiles(remaining)
        if (file === active) setActive(remaining[Math.min(files.indexOf(file), remaining.length - 1)] ?? null)
      }} /></EditorTabBar>
    {files.map(file => <ContentTabPanel key={file} idBase={id} value={file} activeValue={active}>
      <Text sx={{ p: 4 }}>{file}</Text>
    </ContentTabPanel>)}
    {files.length === 0 && <Text sx={{ p: 4 }}>Select a document</Text>}
  </div>
}

export const ClosableDocuments: StoryObj = { render: () => <Documents /> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><Documents /></ThemeProvider> }
