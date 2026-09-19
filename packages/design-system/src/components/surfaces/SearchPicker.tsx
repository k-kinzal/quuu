import useAutocomplete, { createFilterOptions } from '@mui/material/useAutocomplete'
import { styled } from '@mui/material/styles'
import { Check, Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PopoverSurface, usePopoverPanel } from './PopoverPanel.js'
import { feedbackMetrics } from '../../theme/feedback.js'
import { useStrings } from '../../theme/strings.js'

export interface SearchPickerOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
  group?: string
  separatorBefore?: boolean
}
export interface SearchPickerProps {
  open: boolean
  anchorEl: HTMLElement | null
  label: string
  placeholder?: string
  emptyLabel?: string
  options: readonly SearchPickerOption[]
  /** Arrays preserve the checks of a filter that toggles one value per opening. */
  value: string | readonly string[] | null
  onChange(value: string): void
  onClose(): void
}

const Surface = styled(PopoverSurface)(({ theme }) => ({
  width: feedbackMetrics.searchPicker.width,
  maxWidth: 'calc(100vw - 16px)',
  maxHeight: `min(${feedbackMetrics.searchPicker.height}px, 60vh)`,
  padding: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  '& svg': { width: theme.iconSize.sm, height: theme.iconSize.sm, flexShrink: 0 }
}))
const InputRow = styled('div')(({ theme }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing(2),
  flexShrink: 0, minHeight: theme.density.control.lg,
  padding: `${theme.spacing(1)} ${theme.spacing(2)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  color: theme.palette.text.tertiary
}))
const Input = styled('input')(({ theme }) => ({
  flex: 1, minWidth: 0, padding: 0, border: 0, outline: 0,
  background: 'transparent', color: theme.palette.text.primary,
  ...theme.typography.body2,
  '&::placeholder': { color: theme.palette.text.tertiary, opacity: 1 }
}))
const List = styled('ul')(({ theme }) => ({
  margin: 0, padding: theme.spacing(1), listStyle: 'none',
  minHeight: 0, flex: 1, overflowY: 'auto', overscrollBehavior: 'contain'
}))
const Option = styled('li')(({ theme }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing(2),
  minHeight: theme.density.row.lg, padding: `0 ${theme.spacing(1.5)}`,
  borderRadius: theme.radius.sm, cursor: 'pointer', color: theme.palette.text.secondary,
  '&[aria-selected="true"]': { color: theme.palette.primaryText },
  '&[aria-disabled="true"]': { opacity: theme.palette.action.disabledOpacity, pointerEvents: 'none' },
  '&[data-separator="true"]': { borderTop: `1px solid ${theme.palette.border.subtle}`, marginTop: theme.spacing(1) },
  '&.Mui-focused': { background: theme.palette.surface.selected },
  '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 }
}))
const Group = styled('li')(({ theme }) => ({
  padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
  ...theme.typography.caption, color: theme.palette.text.tertiary, fontWeight: 600
}))
const Label = styled('span')(({ theme }) => ({
  display: 'flex', alignItems: 'baseline', gap: theme.spacing(2), minWidth: 0, flex: 1,
  ...theme.typography.body2, color: theme.palette.text.primary,
  '& > span': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // Keep supporting information available for candidates with the same name.
  '&:has(> small) > span': { maxWidth: '55%', flexShrink: 0 },
  '& > small': {
    minWidth: 0, flex: 1,
    ...theme.typography.caption, color: theme.palette.text.tertiary,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left'
  }
}))
const Empty = styled('div')(({ theme }) => ({
  padding: theme.spacing(3), textAlign: 'center', color: theme.palette.text.secondary,
  ...theme.typography.body2
}))
const filter = createFilterOptions<SearchPickerOption>({ stringify: (option) => `${option.label} ${option.description ?? ''}` })

/** Choosing a candidate is left to MUI's combobox; where the surface is placed is shared with Menu. */
export function SearchPicker(props: SearchPickerProps): JSX.Element | null {
  // The search is discarded on every close, so next time you re-pick starting from the current selection.
  return props.open ? <OpenPicker {...props} /> : null
}

function OpenPicker({ anchorEl, label, placeholder, emptyLabel, options, value, onChange, onClose }: SearchPickerProps): JSX.Element {
  const strings = useStrings().searchPicker
  const [query, setQuery] = useState('')
  const { panelRef, position } = usePopoverPanel({ open: true, anchorEl, onClose })
  const closeToAnchor = (): void => { onClose(); anchorEl?.focus() }
  const selected = useMemo(() => Array.isArray(value)
    ? options.filter(option => value.includes(option.value))
    : options.find(option => option.value === value) ?? null, [options, value])
  const { getRootProps, getInputProps, getListboxProps, getOptionProps, groupedOptions } = useAutocomplete<SearchPickerOption, boolean>({
    options, value: selected, multiple: Array.isArray(value),
    inputValue: query, open: true, autoHighlight: true,
    getOptionLabel: (option) => option.label,
    getOptionKey: (option) => option.value,
    getOptionDisabled: (option) => option.disabled === true,
    isOptionEqualToValue: (option, selected) => option.value === selected.value,
    filterOptions: filter,
    onInputChange: (_event, input, reason) => { if (reason === 'input') setQuery(input) },
    onChange: (_event, _option, _reason, details) => { if (details) onChange(details.option.value) },
    onClose: (_event, reason) => {
      if (reason === 'escape' || reason === 'selectOption' || reason === 'removeOption') closeToAnchor()
    }
  })
  useEffect(() => {
    if (position.visibility === 'visible') panelRef.current?.querySelector('input')?.focus()
  }, [panelRef, position.visibility])

  return createPortal(
    <Surface ref={panelRef} style={position} {...getRootProps({
      onKeyDown: (event: KeyboardEvent<HTMLElement> & { defaultMuiPrevented?: boolean }) => {
        // Enter belongs to the IME until conversion is committed, including Safari's 229 event.
        if (event.nativeEvent.isComposing || event.keyCode === 229) {
          event.defaultMuiPrevented = true
          event.stopPropagation()
          return
        }
        // Selected values are checks, not editable tags; these keys only edit the query.
        if (Array.isArray(value) && ['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'].includes(event.key)) {
          event.defaultMuiPrevented = true
        }
        // Do not throw the hand to the end of the Portal; carry on from the entrance you were re-picking at.
        if (event.key === 'Tab') { event.preventDefault(); closeToAnchor() }
        event.stopPropagation()
      }
    })}>
      <InputRow><Search aria-hidden="true" /><Input {...getInputProps()} aria-label={label} placeholder={placeholder ?? strings.placeholder} spellCheck={false} /></InputRow>
      {groupedOptions.length > 0 ? (
        <List {...getListboxProps()} aria-label={label} aria-labelledby={undefined}>
          {groupedOptions.map((option, index) => {
            const { key, ...optionProps } = getOptionProps({ option, index })
            return <Fragment key={key}>
              {option.group && option.group !== groupedOptions[index - 1]?.group && <Group role="presentation">{option.group}</Group>}
              <Option {...optionProps} onClick={option.disabled ? undefined : optionProps.onClick}
                title={option.description} data-separator={option.separatorBefore && index > 0}>
                {option.icon}<Label><span>{option.label}</span>{option.description && <small><bdi>{option.description}</bdi></small>}</Label>
                {optionProps['aria-selected'] && <Check aria-hidden="true" />}
              </Option>
            </Fragment>
          })}
        </List>
      ) : <Empty role="status">{emptyLabel ?? strings.empty}</Empty>}
    </Surface>, document.body
  )
}
