import { useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import OutlinedInput, { type OutlinedInputProps } from '@mui/material/OutlinedInput'
import MuiSelect, { type SelectProps as MuiSelectProps, type SelectChangeEvent } from '@mui/material/Select'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { SearchPicker } from '../surfaces/SearchPicker.js'
import { useStrings } from '../../theme/strings.js'

export interface TextInputProps extends Omit<OutlinedInputProps, 'size' | 'label'> {
  /** Values whose columns should line up: paths, commands, arguments */
  mono?: boolean
  /** The value's unit (sec, days, ms). **Do not write "(sec)" into the label** — the unit is a property of the value */
  unit?: string
}

const InputRoot = styled(OutlinedInput, { shouldForwardProp: blockProps('mono') })<TextInputProps>(
  ({ theme, mono }) => ({
    width: '100%',
    ...(mono
      ? { fontFamily: theme.typography.fontFamilyMono, fontSize: theme.typography.caption.fontSize }
      : {})
  })
)

/** The unit. It is not part of the value, so it is demoted and placed inside the frame. */
const Unit = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  paddingLeft: theme.spacing(1),
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  whiteSpace: 'nowrap',
  pointerEvents: 'none'
}))

/** A single-line input with a frame. */
export function TextInput({ unit, ...rest }: TextInputProps): JSX.Element {
  return <InputRoot endAdornment={unit ? <Unit>{unit}</Unit> : undefined} {...rest} />
}

export interface NumberInputProps extends Omit<TextInputProps, 'type' | 'onChange' | 'value'> {
  value: number
  min?: number
  max?: number
  step?: number
  /**
   * What 0 means here ("unlimited", "all time").
   *
   * **Do not explain a magic number in a footnote.** At 0 the field is emptied and that
   * word is shown in faint type. The shape alone reads as: empty it and it goes back to 0.
   */
  zeroLabel?: string
  onChange(value: number): void
}

/**
 * A numeric input.
 * Clamping to the range is finished here, so no screen has to write `Math.max`.
 */
export function NumberInput({
  value,
  min,
  max,
  step,
  unit,
  zeroLabel,
  onChange,
  ...rest
}: NumberInputProps): JSX.Element {
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  // Do not show the unit at 0 (= "unlimited"). "unlimited sec" does not read
  const blank = Boolean(zeroLabel) && value === 0
  return (
    <TextInput
      type="number"
      unit={blank ? undefined : unit}
      value={blank ? '' : value}
      placeholder={zeroLabel}
      inputProps={{ min, max, step }}
      onChange={(e) => {
        // An empty field is 0 (= the `zeroLabel` state). Do not restore the value mid-deletion
        if (e.target.value === '') {
          onChange(zeroLabel ? 0 : clamp(0))
          return
        }
        const next = Number(e.target.value)
        if (Number.isNaN(next)) return
        onChange(clamp(next))
      }}
      {...rest}
    />
  )
}

/** A multi-line input with a frame. Height comes from the row count (this is not a writing surface, so it does not grow without bound). */
export function TextArea({ rows = 3, ...rest }: TextInputProps & { rows?: number }): JSX.Element {
  return <TextInput multiline minRows={rows} maxRows={rows * 3} {...rest} />
}

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** The grouping heading. Consecutive options with the same value form one group */
  group?: string
  disabled?: boolean
}

export interface SelectProps<T extends string> extends Omit<MuiSelectProps<T>, 'children' | 'input' | 'multiple' | 'native' | 'open' | 'defaultOpen' | 'onOpen' | 'onClose'> {
  options: ReadonlyArray<SelectOption<T>>
}

/**
 * A framed select opening the same searchable surface as button and chip pickers.
 * The candidates arrive via props; groups and disabled values keep their meaning.
 *
 * `displayEmpty` is the default because the empty value is also passed as **one of the
 * options** ("none", "unassigned"). Left at the library default, only the empty case
 * renders as a blank frame, and you cannot tell "none is selected" from "it has not
 * loaded".
 */
export function Select<T extends string>({ options, value, defaultValue, onChange, ...rest }: SelectProps<T>): JSX.Element {
  const strings = useStrings()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [uncontrolledValue, setUncontrolledValue] = useState<T | ''>(defaultValue ?? '')
  const selected = value ?? uncontrolledValue
  return (
    <>
      <MuiSelect<T> fullWidth displayEmpty input={<OutlinedInput />} {...rest}
        value={selected} open={false}
        onOpen={event => {
          const trigger = event.currentTarget
          if (!rest.disabled && !rest.readOnly && trigger instanceof HTMLElement) setAnchor(current => current === trigger ? null : trigger)
        }}
        onChange={(event, child) => {
          const option = options.find(option => option.value === event.target.value)
          if (option) { setUncontrolledValue(option.value); onChange?.(event, child) }
        }}
        SelectDisplayProps={{ ...rest.SelectDisplayProps, 'aria-expanded': Boolean(anchor) }}>
        {options.map(option => <MenuItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</MenuItem>)}
      </MuiSelect>
    <SearchPicker open={Boolean(anchor)} anchorEl={anchor}
      label={rest['aria-label'] ?? (typeof rest.label === 'string' ? rest.label : strings.selectionSheet.label)}
      options={options} value={selected} onClose={() => setAnchor(null)}
      onChange={next => {
        const option = options.find(option => option.value === next)
        if (!option) return
        setUncontrolledValue(option.value)
        // Preserve the select's public change contract, including named form fields.
        const event = new Event('change', { bubbles: true })
        const target = { value: option.value, name: rest.name ?? '' }
        Object.defineProperty(event, 'target', { value: target })
        onChange?.(event as SelectChangeEvent<T>, <MenuItem value={option.value}>{option.label}</MenuItem>)
      }} />
    </>
  )
}
