import { useId, type ReactNode } from 'react'
import MuiCheckbox from '@mui/material/Checkbox'
import MuiSwitch from '@mui/material/Switch'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { FieldContext, useFieldContext } from '../inputs/FieldContext.js'
import { fieldWidth, type FieldWidth } from '../inputs/Field.js'

const Group = styled('section')(({ theme }) => ({
  minWidth: 0,
  marginBottom: theme.spacing(6),
  containerType: 'inline-size',
  containerName: 'settings',
  '& > section:last-child': { marginBottom: 0 }
}))
const Heading = styled('h2')(({ theme }) => ({
  margin: `0 0 ${theme.spacing(2)}`,
  ...theme.typography.body2,
  fontWeight: 600,
  color: theme.palette.text.secondary
}))
const Surface = styled('div')(({ theme }) => ({
  minWidth: 0,
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.default,
  // Child focus rings remain visible at the edge of the group.
  '& > :not(style) + :not(style)': { borderTop: `1px solid ${theme.palette.border.subtle}` }
}))
const Hint = styled('div', { shouldForwardProp: blockProps('error') })<{ error?: boolean }>(({ theme, error }) => ({
  ...theme.typography.caption,
  lineHeight: 1.5,
  color: error ? theme.palette.error.main : theme.palette.text.secondary,
  overflowWrap: 'anywhere'
}))
const Footer = styled(Hint)(({ theme }) => ({ padding: `${theme.spacing(2)} ${theme.spacing(4)} 0` }))

/** Related preferences share one boundary. Lists may own their own container instead. */
export function SettingsGroup({ title, hint, children, contained = true }: {
  title?: string
  hint?: ReactNode
  contained?: boolean
  children: ReactNode
}): JSX.Element {
  const id = useId()
  return <Group aria-labelledby={title ? id : undefined}>
    {title && <Heading id={id}>{title}</Heading>}
    {contained ? <Surface>{children}</Surface> : children}
    {hint && <Footer>{hint}</Footer>}
  </Group>
}

const RowRoot = styled('div', { shouldForwardProp: blockProps('stacked', 'width') })<{
  stacked: boolean; width: FieldWidth | 'auto'
}>(({ theme, stacked, width }) => ({
  display: 'flex',
  flexDirection: stacked ? 'column' : 'row',
  alignItems: stacked ? 'stretch' : 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(stacked ? 2 : 5),
  padding: `${theme.spacing(3)} ${theme.spacing(4)}`,
  minWidth: 0,
  // Respond to the pane, not the window: settings can sit beside two navigations.
  ...(!stacked && width !== 'auto' ? {
    [`@container settings (max-width: ${fieldWidth.md + fieldWidth.sm}px)`]: {
      flexDirection: 'column', alignItems: 'stretch', gap: theme.spacing(2)
    }
  } : {})
}))
const Copy = styled('div')(({ theme }) => ({
  flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: theme.spacing(1)
}))
const Label = styled('label')(({ theme }) => ({
  ...theme.typography.body1, color: theme.palette.text.primary, overflowWrap: 'anywhere'
}))
const Control = styled('div', { shouldForwardProp: blockProps('width', 'stacked') })<{
  width: FieldWidth | 'auto'; stacked: boolean
}>(({ theme, width, stacked }) => ({
  flex: stacked ? undefined : '0 1 auto',
  width: width === 'auto' ? 'auto' : '100%',
  maxWidth: width === 'auto' || stacked ? undefined : fieldWidth[width],
  minWidth: 0,
  // A short value stays short when the label moves above it.
  ...(width !== 'auto' && !stacked ? {
    [`@container settings (max-width: ${fieldWidth.md + fieldWidth.sm}px)`]: { alignSelf: 'flex-start' }
  } : {}),
  '& > .MuiFormControlLabel-root': { marginBottom: 0 },
  '& .MuiSwitch-root': { flexShrink: 0 },
  '& .Mui-focusVisible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: theme.spacing(0.5) }
}))

export interface SettingRowProps {
  label: string
  hint?: ReactNode
  error?: string
  width?: FieldWidth | 'auto'
  /** Long text, ordered editors and multi-control groups need the full reading width. */
  layout?: 'inline' | 'stacked'
  /** A per-field override or another accessory beside the control. */
  accessory?: ReactNode
  controlId?: string
  children: ReactNode
}

/** Label, supporting text and control are one accessible, responsive setting. */
export function SettingRow({ label, hint, error, width = 'md', layout = 'inline', accessory, controlId, children }: SettingRowProps): JSX.Element {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  const stacked = layout === 'stacked'
  return <RowRoot stacked={stacked} width={width}>
    <Copy>
      <Label id={id} htmlFor={controlId}>{label}</Label>
      {hintId && <Hint id={hintId} error={Boolean(error)}>{error || hint}</Hint>}
      {accessory && <Accessory>{accessory}</Accessory>}
    </Copy>
    <FieldContext.Provider value={{ label, labelId: id, hintId, invalid: Boolean(error) }}>
      <Control width={width} stacked={stacked}>
        {children}
      </Control>
    </FieldContext.Provider>
  </RowRoot>
}

const Accessory = styled('div')(({ theme }) => ({
  display: 'flex', justifyContent: 'flex-start', marginTop: theme.spacing(1),
  '& .MuiFormControlLabel-root': { marginBottom: 0 }
}))

/** Switches apply immediately; checkboxes belong to an explicitly saved form. */
export function SettingToggle({ label, hint, checked, disabled, onChange, kind = 'switch', accessory }: {
  label: string
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange(value: boolean): void
  kind?: 'switch' | 'checkbox'
  accessory?: ReactNode
}): JSX.Element {
  const id = useId()
  return <SettingRow label={label} hint={hint} width="auto" controlId={id} accessory={accessory}>
    <ToggleInput id={id} label={label} checked={checked} disabled={disabled} onChange={onChange} kind={kind} />
  </SettingRow>
}

function ToggleInput({ id, label, checked, disabled, onChange, kind }: {
  id: string; label: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void; kind: 'switch' | 'checkbox'
}): JSX.Element {
  const field = useFieldContext()
  const Control = kind === 'switch' ? MuiSwitch : MuiCheckbox
  return <Control checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}
    slotProps={{ input: { id, 'aria-label': label, 'aria-describedby': field?.hintId } }} />
}

/** Readouts, errors and multi-part content inside a settings group. */
export const SettingsBlock = styled('div')(({ theme }) => ({
  minWidth: 0, padding: `${theme.spacing(3)} ${theme.spacing(4)}`,
  display: 'flex', flexDirection: 'column', gap: theme.spacing(3), overflowWrap: 'anywhere'
}))

/** An input and its browse/apply action stay together without stretching the button. */
export const InputAction = styled('div')(({ theme }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing(2), minWidth: 0,
  '& > :not(style)': { flex: '1 1 auto', minWidth: 0 },
  '& > :not(style) ~ :not(style)': { flex: '0 0 auto' }
}))
