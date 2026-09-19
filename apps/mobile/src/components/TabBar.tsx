import { BottomNavigation } from '@design-system/react'
import type { GlyphName } from '../lib/icons.js'
import { Glyph } from '../lib/icons.js'
export interface Tab<T extends string> {
  id: T
  label: string
  icon: GlyphName
  badge?: number
}
export interface TabBarProps<T extends string> {
  tabs: ReadonlyArray<Tab<T>>
  active: T
  onChange(id: T): void
}
export function TabBar<T extends string>({ tabs, ...props }: TabBarProps<T>): JSX.Element {
  return (
    <BottomNavigation
      {...props}
      tabs={tabs.map((tab) => ({ ...tab, icon: <Glyph name={tab.icon} step="lg" /> }))}
    />
  )
}
