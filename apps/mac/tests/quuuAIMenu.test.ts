import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { EVENTS } from '../src/api/channels.js'
import { initMainI18n, t } from '../src/main/i18n/index.js'
import { menuForPlatform } from '../src/main/menuPlatform.js'
import { refreshMenuIfProjectsChanged } from '../src/main/menus.js'

const host = vi.hoisted(() => ({ build: vi.fn(), send: vi.fn(), show: vi.fn() }))
vi.mock('electron', () => ({ app: {}, shell: {}, Menu: { buildFromTemplate: host.build, setApplicationMenu: vi.fn() } }))
vi.mock('../src/main/windows.js', () => ({
  beginQuit: vi.fn(), showWindow: host.show,
  mainWindow: { isDestroyed: () => false, webContents: { isLoadingMainFrame: () => false, send: host.send } }
}))

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap(item => [item, ...flatten(Array.isArray(item.submenu) ? item.submenu : [])])
}

beforeEach(() => vi.clearAllMocks())

it.each(['en', 'ja'])('lists QuuuAI in the %s Go menu, preserves numbered destinations and dispatches its command', locale => {
  initMainI18n(locale)
  const projects = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `${locale} project ${i}` }))
  refreshMenuIfProjectsChanged(projects)
  const template = host.build.mock.calls[0][0] as MenuItemConstructorOptions[]
  const go = template.find(item => item.label === t('menu.go'))!
  const items = flatten(go.submenu as MenuItemConstructorOptions[])
  const quuu = items.find(item => item.label === 'QuuuAI')!
  expect(quuu.accelerator).toBe('Cmd+Shift+A')
  expect(items.find(item => item.label === t('menu.allTasks'))?.accelerator).toBe('Cmd+1')
  expect(items.find(item => item.label === t('menu.needsReview'))?.accelerator).toBe('Cmd+2')
  projects.forEach((project, i) => expect(items.find(item => item.label === project.name)?.accelerator).toBe(`Cmd+${i + 3}`))
  ;(quuu.click as (item: unknown, window: unknown, event: unknown) => void)(quuu, null, { triggeredByAccelerator: true })
  expect(host.show).toHaveBeenCalledOnce()
  expect(host.send).toHaveBeenCalledWith(EVENTS.command, { command: 'view.quuuAI' })

  for (const platform of ['darwin', 'win32'] as const) {
    const adapted = flatten(menuForPlatform(template, platform))
    const accelerator = platform === 'darwin' ? 'Cmd+Shift+A' : 'Ctrl+Shift+A'
    expect(adapted.filter(item => item.accelerator === accelerator)).toHaveLength(1)
    expect(adapted.find(item => item.label === 'QuuuAI')?.accelerator).toBe(accelerator)
    // Electron owns standard editing keys through roles; the new binding must leave those alone too.
    expect(['Cmd+A', 'Cmd+C', 'Cmd+V', 'Cmd+X', 'Cmd+Z', 'Cmd+Shift+Z', 'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y']).not.toContain(accelerator)
  }
  initMainI18n('en')
})
