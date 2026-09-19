import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button } from '../inputs/Button.js'
import { Column } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { SearchPicker } from './SearchPicker.js'

export default { title: 'Surfaces/SearchPicker', component: SearchPicker } satisfies Meta<typeof SearchPicker>

const options = [
  ...['alpha', 'api', 'beta', 'Design System', 'docs', 'frontend', 'mobile', 'sandbox', 'website', 'Reference material with a deliberately long name'].map((label) => ({ value: label, label, description: `/workspace/organization/products/${label}` })),
  { value: 'reference-a', label: 'Reference', description: '/workspace/team-a/reference' },
  { value: 'reference-b', label: 'Reference', description: '/workspace/team-b/reference' }
]

export const SearchAndSelect: StoryObj = { render: () => <Example /> }
function Example(): JSX.Element {
  const [value, setValue] = useState('Design System')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return <Column gap="lg"><Text>Search by name and path, the current value, an empty result, the keyboard, placement at the window edge</Text>
    <Button aria-haspopup="listbox" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)}>{value}</Button>
    <SearchPicker open={Boolean(anchor)} anchorEl={anchor} label="Working directory" placeholder="Search by name or path…" emptyLabel="No candidates match" options={options} value={value} onChange={setValue} onClose={() => setAnchor(null)} />
  </Column>
}
