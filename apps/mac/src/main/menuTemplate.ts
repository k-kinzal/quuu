import type { MenuItemConstructorOptions } from 'electron'
import type { MenuTemplateItem } from './desktop/types.js'
import { platformAccelerator } from './menuPlatform.js'

/**
 * Turn "what to show" from the UI into the OS menu shape.
 *
 * Doesn't import electron, so it's testable as-is (`tests/nativeMenu.test.ts`).
 * `nativeMenu.ts` does the actual opening.
 */
export function menuTemplate(
  items: MenuTemplateItem[],
  choose: (id: string) => void
): MenuItemConstructorOptions[] {
  return items.flatMap((item): MenuItemConstructorOptions[] => {
    const separator: MenuItemConstructorOptions[] = item.separatorBefore
      ? [{ type: 'separator' }]
      : []

    if (item.submenu) {
      return [
        ...separator,
        {
          label: item.label,
          enabled: item.disabled !== true,
          submenu: menuTemplate(item.submenu, choose)
        }
      ]
    }

    return [
      ...separator,
      {
        label: item.label,
        enabled: item.disabled !== true,
        // Only rows that pass checked get the checkmark column (no blank gutter on rows that don't)
        ...(item.checked === undefined
          ? {}
          : { type: 'checkbox' as const, checked: item.checked }),
        /*
         * Display only. Always add `registerAccelerator: false`.
         * Without it, the key gets stolen even while the menu isn't open
         * (breaking the rule that shortcuts are defined in the native menu, one place only)
         */
        ...(item.accelerator ? { accelerator: platformAccelerator(item.accelerator, process.platform), registerAccelerator: false } : {}),
        click: () => choose(item.id)
      }
    ]
  })
}
