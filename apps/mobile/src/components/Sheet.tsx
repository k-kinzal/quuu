import { SelectionSheet, type SelectionSheetProps } from '@design-system/react'
import { Glyph } from '../lib/icons.js'
import { t } from '../model/i18n/index.js'
export type SheetProps<T> = Omit<SelectionSheetProps<T>, 'selectedIcon' | 'closeLabel'>
export function Sheet<T>(props: SheetProps<T>): JSX.Element {
  return (
    <SelectionSheet
      {...props}
      selectedIcon={<Glyph name="done" step="md" />}
      closeLabel={t('sheet.close')}
    />
  )
}
export type { SelectionSheetOption as SheetOption } from '@design-system/react'
