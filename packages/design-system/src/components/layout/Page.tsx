import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { Spacer } from './Stack.js'

const PageRoot = styled('div')({ display: 'flex', flexDirection: 'column', minHeight: '100%' })

const PageHead = styled('header')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: `${theme.spacing(4)} ${theme.spacing(6)} ${theme.spacing(3)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`
}))

const PageBody = styled('div', { shouldForwardProp: blockProps('maxWidth') })<{
  maxWidth?: number
}>(({ theme, maxWidth = 860 }) => ({
  // The gap between items (16px) must be narrower than the surface's margin. The other way round and items stick to the edge
  padding: `${theme.spacing(5)} ${theme.spacing(6)} ${theme.spacing(8)}`,
  maxWidth
}))

const Title = styled('h2')(({ theme }) => ({
  margin: 0,
  ...theme.typography.subtitle2
}))

const Description = styled('p')(({ theme }) => ({
  margin: '4px 0 0',
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  // A description is a surface where prose is the main thing, so cap the line length
  maxWidth: theme.measure
}))

export interface PageProps {
  title: string
  description?: string
  /** What sits to the left of the title (the way back, and the like) */
  lead?: ReactNode
  /** The actions that sit to the right of the title */
  actions?: ReactNode
  maxWidth?: number
  children: ReactNode
}

/**
 * The surface for reading and for settings. Title + description + body.
 *
 * This is where the body width is capped. No screen re-decides its own max width.
 */
export function Page({
  title,
  description,
  lead,
  actions,
  maxWidth,
  children
}: PageProps): JSX.Element {
  return (
    <PageRoot>
      <PageHead>
        {lead}
        <div>
          <Title>{title}</Title>
          {description && <Description>{description}</Description>}
        </div>
        <Spacer />
        {actions}
      </PageHead>
      <PageBody maxWidth={maxWidth}>{children}</PageBody>
    </PageRoot>
  )
}

/**
 * A section. **The vertical rhythm belongs to the container.**
 *
 * Stacked as plain `block`s, the spacing becomes an assortment of whatever margins the
 * children happen to carry. It breaks by going tight exactly where parts without
 * margins (checkboxes, rows, description lists) end up adjacent (a "Sync" button really
 * was stuck to the row above it). If the container lays down even spacing, nothing you
 * put in it collapses.
 */
const SectionRoot = styled('section')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: theme.spacing(3),
  marginBottom: theme.spacing(6)
}))

const SectionTitle = styled('h3')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.xs,
  // The space below belongs to the container's (SectionRoot) gap. Do not open it twice
  margin: 0,
  ...theme.typography.caption,
  fontWeight: 600,
  color: theme.palette.text.tertiary,
  // Fill the rest of the heading line with a rule, marking where the section starts
  '&::after': { content: '""', flex: 1, height: 1, background: theme.palette.border.subtle }
}))

export interface SectionProps {
  title: string
  children: ReactNode
}

/** A section within a surface. A rule runs out from the heading, showing where one set begins and ends. */
export function Section({ title, children }: SectionProps): JSX.Element {
  return (
    <SectionRoot>
      <SectionTitle>
        <span>{title}</span>
      </SectionTitle>
      {children}
    </SectionRoot>
  )
}

/**
 * For when you want only the section heading (with a count or an action on the right).
 * Unlike `Section` it draws no rule; it only matches the row height.
 */
export const GroupTitle = styled('h3')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.xs,
  margin: `0 0 ${theme.spacing(2)}`,
  ...theme.typography.caption,
  fontWeight: 600,
  color: theme.palette.text.tertiary
}))

/** A numbered enumeration of rules. Prose is the main thing, so the line length is capped. */
export const OrderedNotes = styled('ol')(({ theme }) => ({
  margin: `${theme.spacing(2)} 0`,
  paddingLeft: '1.4em',
  maxWidth: theme.measure,
  ...theme.typography.body2,
  lineHeight: 1.9,
  color: theme.palette.text.secondary
}))
