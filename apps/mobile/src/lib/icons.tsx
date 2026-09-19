import { iconDefaults, useTheme } from '@design-system/react'
import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  Inbox,
  Plus,
  RefreshCw,
  Send,
  Settings,
  SquarePen
} from 'lucide-react'

/**
 * The single entry point for icons (convention E). Standardized on lucide for the
 * same reason as the Mac.
 *
 * **Never let callers write the size.** Pass `size` every time and switching density
 * leaves exactly the places someone forgot still small.
 * Only the step name (sm / md / lg) is accepted; the real size comes from the Theme.
 */
export type GlyphName =
  | 'back'
  | 'chevron'
  | 'down'
  | 'add'
  | 'compose'
  | 'settings'
  | 'inbox'
  | 'send'
  | 'up'
  | 'more'
  | 'done'
  | 'archive'
  | 'refresh'
  | 'alert'

const ICONS = {
  back: ChevronLeft,
  chevron: ChevronRight,
  down: ChevronDown,
  add: Plus,
  compose: SquarePen,
  settings: Settings,
  inbox: Inbox,
  send: Send,
  up: ArrowUp,
  more: Ellipsis,
  done: Check,
  archive: Archive,
  refresh: RefreshCw,
  alert: CircleAlert
} as const

export function Glyph({
  name,
  step = 'md'
}: {
  name: GlyphName
  /** The icon's step. Density decides the real size */
  step?: 'sm' | 'md' | 'lg'
}): JSX.Element {
  const theme = useTheme()
  const Icon = ICONS[name]
  return <Icon size={theme.iconSize[step]} {...iconDefaults} />
}
