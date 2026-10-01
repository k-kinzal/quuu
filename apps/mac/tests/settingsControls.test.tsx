// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CheckboxGroup } from '../../../packages/design-system/src/components/inputs/Toggle.js'
import { InputAction, SettingRow, SettingToggle, SettingsGroup } from '../../../packages/design-system/src/components/layout/Settings.js'
import { Select, TextArea, TextInput } from '../../../packages/design-system/src/components/inputs/TextInput.js'
import { Button } from '../../../packages/design-system/src/components/inputs/Button.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'

beforeAll(() => {
  window.matchMedia = media => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})
afterEach(cleanup)

describe('composed settings controls', () => {
  it('gives native controls the row name and hint, including an input with a separate action', () => {
    render(<ThemeProvider><SettingsGroup title="Workspace">
      <SettingRow label="Directory" hint="Used for new work">
        <InputAction><TextInput defaultValue="/tmp/work" /><Button>Browse</Button></InputAction>
      </SettingRow>
      <SettingRow label="Instructions" error="Enter an instruction"><TextArea /></SettingRow>
      <SettingRow label="Application" hint="Used when opening files"><Select value="editor" options={[{ value: 'editor', label: 'Editor' }]} /></SettingRow>
    </SettingsGroup></ThemeProvider>)
    expect(screen.getByRole('region', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Directory' })).toHaveAccessibleDescription('Used for new work')
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toBeInvalid()
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveAccessibleDescription('Enter an instruction')
    expect(screen.getByRole('combobox', { name: 'Application' })).toHaveAccessibleDescription('Used when opening files')
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Application' }), { key: 'Enter' })
    expect(screen.getByRole('listbox', { name: 'Application' })).toBeInTheDocument()
  })

  it('keeps an explicit input name distinct from the name of its group', () => {
    render(<ThemeProvider><SettingRow label="Arguments"><TextInput aria-label="Argument 1" /><TextInput aria-label="Argument 2" /></SettingRow></ThemeProvider>)
    expect(screen.getByRole('textbox', { name: 'Argument 1' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Argument 2' })).toBeInTheDocument()
  })

  it('activates a switch through its visible label and exposes saved choices as checkboxes', () => {
    const changed = vi.fn()
    render(<ThemeProvider>
      <SettingToggle label="Continue working" hint="After the window closes" checked={false} onChange={changed} />
      <SettingToggle kind="checkbox" label="Include in configuration" checked={true} onChange={() => undefined} />
    </ThemeProvider>)
    expect(screen.getByRole('switch', { name: 'Continue working' })).toHaveAccessibleDescription('After the window closes')
    fireEvent.click(screen.getByText('Continue working'))
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith(true)
    expect(screen.getByRole('checkbox', { name: 'Include in configuration' })).toBeChecked()
  })

  it('changes one member of a multiselection without dropping the other members', () => {
    function Example() {
      const [value, setValue] = useState(['closed'])
      return <ThemeProvider><SettingRow label="Events" hint="Choose any combination">
        <CheckboxGroup label="Events" options={[{ value: 'opened', label: 'Opened' }, { value: 'closed', label: 'Closed' }]} value={value} onChange={setValue} />
      </SettingRow></ThemeProvider>
    }
    render(<Example />)
    expect(screen.getByRole('group', { name: 'Events' })).toHaveAccessibleDescription('Choose any combination')
    fireEvent.click(screen.getByLabelText('Opened'))
    expect(screen.getByLabelText('Opened')).toBeChecked()
    expect(screen.getByLabelText('Closed')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Closed'))
    expect(screen.getByLabelText('Opened')).toBeChecked()
    expect(screen.getByLabelText('Closed')).not.toBeChecked()
  })

  it('does not change disabled settings when their labels are clicked', () => {
    const changed = vi.fn()
    render(<ThemeProvider>
      <SettingToggle label="Inherited switch" disabled checked={true} onChange={changed} />
      <CheckboxGroup label="Inherited events" disabled value={['opened']} options={[{ value: 'opened', label: 'Opened' }]} onChange={changed} />
    </ThemeProvider>)
    fireEvent.click(screen.getByText('Inherited switch'))
    fireEvent.click(screen.getByText('Opened'))
    expect(changed).not.toHaveBeenCalled()
  })
})
