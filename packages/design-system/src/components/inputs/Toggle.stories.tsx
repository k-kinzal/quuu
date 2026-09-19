import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { useTheme } from '../../theme/ThemeProvider.js'
import { Checkbox, RadioField, SegmentedControl, Switch } from './Toggle.js'

const meta: Meta = { title: 'Inputs/Toggle' }
export default meta

export const Checkboxes: StoryObj = {
  render: function Render() {
    const [a, setA] = useState(true)
    const [b, setB] = useState(false)
    return (
      <Column gap={0} sx={{ maxWidth: 520 }}>
        <Checkbox label="Start automatically at launch" checked={a} onChange={setA} />
        <Checkbox
          label="Keep running after closing"
          hint="Turn this off and it stops the moment you close it."
          checked={b}
          onChange={setB}
        />
        <Checkbox label="Only some are selected" indeterminate checked={false} onChange={() => undefined} />
        <Checkbox label="Cannot be changed" checked disabled onChange={() => undefined} />
      </Column>
    )
  }
}

/** Switch for things that take effect at once, Checkbox for things that take effect only on save. */
export const Switches: StoryObj = {
  render: function Render() {
    const [on, setOn] = useState(true)
    return (
      <Column gap={0} sx={{ maxWidth: 520 }}>
        <Switch label="Notify me" checked={on} onChange={setOn} />
        <Switch label="Paused" hint="Turn this on and it starts moving right away." checked={false} onChange={() => undefined} />
      </Column>
    )
  }
}

export const Radios: StoryObj = {
  render: function Render() {
    const [value, setValue] = useState('priority')
    return (
      <RadioField
        value={value}
        onChange={setValue}
        options={[
          { value: 'priority', label: 'Look for a free slot in definition order', hint: 'Tried from the top down.' },
          { value: 'round', label: 'Take turns', hint: 'For when you want the load spread out.' },
          { value: 'idle', label: 'Prefer whatever is idle', disabled: true }
        ]}
      />
    )
  }
}

/** An exclusive choice among a few values. The caller passes the color (only steps that carry meaning are colored). */
export const Segmented: StoryObj = {
  render: function Render() {
    const theme = useTheme()
    const [value, setValue] = useState(2)
    return (
      <SegmentedControl<number>
        label="Level"
        value={value}
        onChange={setValue}
        options={[
          { value: 0, label: 'P0', accent: theme.palette.accents.red },
          { value: 1, label: 'P1', accent: theme.palette.accents.amber },
          { value: 2, label: 'P2' },
          { value: 3, label: 'P3' }
        ]}
      />
    )
  }
}
