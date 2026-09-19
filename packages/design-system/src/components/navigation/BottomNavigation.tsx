/** The bottom navigation picked by finger. The glyph layout does not move as a count's digits change. */
import { styled } from '@mui/material/styles'
import { Row } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { useTheme } from '../../theme/ThemeProvider.js'
import { NotificationAnchor, NotificationBadge } from '../data-display/Annotations.js'
import type { ReactNode } from 'react'

const TabButton = styled('button')(({ theme }) => ({
  flex: '1 1 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(0.5),
  minHeight: theme.density.control.md,
  padding: `${theme.spacing(1.5)} 0`,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  color: theme.palette.text.tertiary,
  '&[aria-selected="true"]': { color: theme.palette.primaryText },
  '&:active': { background: theme.palette.surface.hover }
}))

export interface BottomNavigationItem<T extends string> {
  id: T
  label: string
  icon: ReactNode

  badge?: number
}

export interface BottomNavigationProps<T extends string> {
  tabs: ReadonlyArray<BottomNavigationItem<T>>
  active: T
  onChange(id: T): void
}

export function BottomNavigation<T extends string>({
  tabs,
  active,
  onChange
}: BottomNavigationProps<T>): JSX.Element {
  const theme = useTheme()
  return (
    <Row gap={0} role="tablist" align="stretch">
      {tabs.map((tab) => {
        const on = tab.id === active
        return (
          <TabButton
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.id)}
          >
            <NotificationAnchor>
              {tab.icon}
              <NotificationBadge count={tab.badge ?? 0} />
            </NotificationAnchor>
            <Text size="xs" color={on ? theme.palette.primaryText : undefined} tone="tertiary">
              {tab.label}
            </Text>
          </TabButton>
        )
      })}
    </Row>
  )
}
