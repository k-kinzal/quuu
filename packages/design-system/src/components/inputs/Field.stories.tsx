import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { Field, FieldHint, FieldRow } from './Field.js'
import { NumberInput, Select, TextArea, TextInput } from './TextInput.js'

const meta: Meta = { title: 'Inputs/Field' }
export default meta

export const Text_: StoryObj = {
  name: 'Text',
  render: () => (
    <Column gap={0} sx={{ maxWidth: 520 }}>
      <Field label="Name">
        <TextInput defaultValue="design-system" />
      </Field>
      <Field label="Command" hint={<>A command name on PATH, or an absolute path. e.g. <code>claude</code></>}>
        <TextInput mono defaultValue="claude" />
      </Field>
      <Field label="Description" hint="For anything long, the row count decides the height.">
        <TextArea rows={3} defaultValue={'First line\nSecond line'} />
      </Field>
      <Field label="Read only">
        <TextInput mono readOnly value="/Users/me/Projects/design-system" />
      </Field>
      <Field label="Value that cannot be fixed" error="Cannot be changed while running">
        <TextInput error defaultValue="claude" disabled />
      </Field>
    </Column>
  )
}

export const Numbers: StoryObj = {
  name: 'Numbers',
  render: function Render() {
    const [n, setN] = useState(3000)
    return (
      <FieldRow>
        <Field label="Interval (ms)" hint="The default is 3000." width="sm">
          <NumberInput value={n} min={500} step={500} onChange={setN} />
        </Field>
        <Field label="Cap" hint="Clamped to 1-8." width="xs">
          <NumberInput value={4} min={1} max={8} onChange={() => undefined} />
        </Field>
      </FieldRow>
    )
  }
}

export const Choice: StoryObj = {
  name: 'Choice',
  render: function Render() {
    const [value, setValue] = useState('a1')
    return (
      <Column gap={0} sx={{ maxWidth: 400 }}>
        <Field label="Target" hint="Open, type to filter, then choose with arrows and Enter.">
          <Select
            aria-label="Target"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            options={[
              { value: '', label: 'Unassigned' },
              { value: 'g1', label: 'Default', group: 'Groups' },
              { value: 'a1', label: 'Alpha', group: 'Individuals' },
              { value: 'a2', label: 'Beta', group: 'Individuals' },
              { value: 'a3', label: 'Gamma (unavailable)', group: 'Individuals', disabled: true },
              { value: 'jp', label: '日本語の候補', group: 'Individuals' }
            ]}
          />
        </Field>
        <FieldHint>Try an empty result, Escape, the empty value, disabled candidates, and Japanese input.</FieldHint>
      </Column>
    )
  }
}
