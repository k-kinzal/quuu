import MuiCheckbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MuiRadio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import MuiSwitch from '@mui/material/Switch'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { FieldHint } from './Field.js'

export interface CheckboxProps {
  label: string
  /** A note on what happens. Write what turning it off does */
  hint?: string
  checked: boolean
  disabled?: boolean
  indeterminate?: boolean
  onChange(next: boolean): void
}

/** A two-value setting. The note lives inside the label too, so the hit area stays wide. */
export function Checkbox({
  label,
  hint,
  checked,
  disabled,
  indeterminate,
  onChange
}: CheckboxProps): JSX.Element {
  return (
    <FormControlLabel
      sx={{ mb: 4 }}
      disabled={disabled}
      control={
        <MuiCheckbox
          checked={checked}
          indeterminate={indeterminate}
          onChange={(event) => onChange(event.target.checked)}
        />
      }
      label={
        <>
          {label}
          {hint && <FieldHint>{hint}</FieldHint>}
        </>
      }
    />
  )
}

export type SwitchProps = Omit<CheckboxProps, 'indeterminate'>

/**
 * A two-value toggle that takes effect at once.
 * For settings that only take effect once Save is pressed, use `Checkbox` (things that
 * take effect differently look different).
 */
export function Switch({ label, hint, checked, disabled, onChange }: SwitchProps): JSX.Element {
  return (
    <FormControlLabel
      sx={{ mb: 4 }}
      disabled={disabled}
      control={
        <MuiSwitch checked={checked} onChange={(event) => onChange(event.target.checked)} />
      }
      label={
        <>
          {label}
          {hint && <FieldHint>{hint}</FieldHint>}
        </>
      }
    />
  )
}

export interface RadioOption<T extends string> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

export interface RadioFieldProps<T extends string> {
  value: T
  options: ReadonlyArray<RadioOption<T>>
  onChange(next: T): void
  /** Lay them out horizontally. Only when the options are short and there are three or fewer */
  row?: boolean
}

/** An exclusive choice. Each option can carry its reason alongside it. */
export function RadioField<T extends string>({
  value,
  options,
  onChange,
  row
}: RadioFieldProps<T>): JSX.Element {
  return (
    <RadioGroup row={row} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((option) => (
        <FormControlLabel
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          sx={{ mb: 2 }}
          control={<MuiRadio />}
          label={
            <>
              {option.label}
              {option.hint && <FieldHint>{option.hint}</FieldHint>}
            </>
          }
        />
      ))}
    </RadioGroup>
  )
}

/* ------------------------------------------------------- segmented control */

const SegRoot = styled(RadioGroup)(({ theme }) => ({
  flex: '0 0 auto',
  display: 'inline-flex',
  flexDirection: 'row',
  gap: theme.spacing(0.5),
  padding: theme.spacing(0.5),
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.sm,
  background: theme.palette.surface.subtle
}))

const SegOption = styled(FormControlLabel, { shouldForwardProp: blockProps('selected', 'accent') })<{
  selected: boolean
  accent?: string
}>(({ theme, selected, accent }) => ({
  position: 'relative',
  minWidth: theme.density.control.sm,
  height: theme.density.control.sm,
  padding: `0 ${theme.spacing(1.5)}`,
  margin: 0,
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: theme.radius.xs,
  background: selected ? theme.palette.surface.raised : 'transparent',
  boxShadow: selected ? `0 1px 2px ${theme.palette.surface.overlay}` : undefined,
  color: selected ? (accent ?? theme.palette.text.primary) : theme.palette.text.secondary,
  cursor: 'pointer',
  '& .MuiFormControlLabel-label': { ...theme.typography.caption, fontWeight: 600 },
  // The native radio is kept, so arrow-key selection and screen reader support are not hand-rolled.
  '& .MuiRadio-root': { position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clipPath: 'inset(50%)' },
  '&:has(.Mui-focusVisible)': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: 1 },
  '&:hover': { color: theme.palette.text.primary },
  '&.Mui-disabled': { opacity: theme.palette.action.disabledOpacity, cursor: 'default' }
}))

export interface SegmentedOption<T> {
  disabled?: boolean
  value: T
  label: string
  title?: string
  /** A color applied only when it is selected */
  accent?: string
}

export interface SegmentedControlProps<T> {
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange(next: T): void
}

/**
 * An exclusive choice among a few values, shaped so it can be switched in place without
 * opening anything. Once the options grow, switch to `Select` (do not let it keep
 * stretching sideways).
 *
 * The selection is exposed as a radio, and the dimensions follow the density.
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <SegRoot row aria-label={label} value={String(value)} onChange={(_, next) => {
      const option = options.find((item) => String(item.value) === next)
      if (option && !option.disabled) onChange(option.value)
    }}>
      {options.map((option) => (
        <SegOption
          key={String(option.value)}
          value={String(option.value)}
          selected={option.value === value}
          accent={option.accent}
          disabled={option.disabled}
          title={option.title ?? option.label}
          control={<MuiRadio />}
          label={option.label}
        />
      ))}
    </SegRoot>
  )
}
