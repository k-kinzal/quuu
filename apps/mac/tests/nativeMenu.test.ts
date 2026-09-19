import { describe, expect, it, vi } from 'vitest'
import { menuTemplate } from '../src/main/menuTemplate.js'

describe('turning a screen menu into the OS shape', () => {
  it('returns the chosen row by its id', () => {
    const choose = vi.fn()
    const items = menuTemplate([{ id: '0', label: '開く' }], choose)
    ;(items[0].click as () => void)()
    expect(choose).toHaveBeenCalledWith('0')
  })

  it('inserts separatorBefore as a rule row in front of it', () => {
    const items = menuTemplate(
      [
        { id: '0', label: '開く' },
        { id: '1', label: '削除…', separatorBefore: true }
      ],
      () => {}
    )
    expect(items.map((i) => i.type ?? i.label)).toEqual(['開く', 'separator', '削除…'])
  })

  it('gives a check column only to the rows passed checked', () => {
    const items = menuTemplate(
      [
        { id: '0', label: 'P1', checked: true },
        { id: '1', label: 'コピー' }
      ],
      () => {}
    )
    expect(items[0]).toMatchObject({ type: 'checkbox', checked: true })
    expect(items[1].type).toBeUndefined()
  })

  it('shows the shortcut as text only, without binding the key', () => {
    const [item] = menuTemplate([{ id: '0', label: '新しいタスク', accelerator: 'Cmd+N' }], () => {})
    expect(item).toMatchObject({ accelerator: 'Cmd+N', registerAccelerator: false })
  })

  it('makes a disabled row unpressable (used as a heading)', () => {
    const [item] = menuTemplate([{ id: '0', label: '積み先', disabled: true }], () => {})
    expect(item.enabled).toBe(false)
  })

  it('builds a submenu by the same rules and returns the id through its parent', () => {
    const choose = vi.fn()
    const [parent] = menuTemplate(
      [
        {
          id: '0',
          label: '優先度',
          submenu: [
            { id: '0.0', label: 'P0' },
            { id: '0.1', label: 'P1', checked: true }
          ]
        }
      ],
      choose
    )
    const submenu = parent.submenu as Array<{ label?: string; click?: () => void }>
    expect(submenu.map((i) => i.label)).toEqual(['P0', 'P1'])
    submenu[1].click?.()
    expect(choose).toHaveBeenCalledWith('0.1')
  })
})
