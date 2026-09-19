import { ActionPill } from '@design-system/react'
import { Glyph } from '../lib/icons.js'
export function ScopeButton(props: { label: string; onClick(): void }): JSX.Element {
  return <ActionPill {...props} indicator={<Glyph name="down" step="sm" />} />
}
