import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { WindowControlsSpecimen, type WindowScreen } from '../../../packages/design-system/src/components/layout/WindowControls.stories.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'

const root = createRoot(document.getElementById('root')!)
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()))
function element(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function checkClear(message: string, inset = 84): void {
  const shell = element('[data-ds-app-shell]').getBoundingClientRect()
  const node = element('[data-window-content]')
  const rect = node.getBoundingClientRect()
  assert(rect.width > 0, `${message}: content is visible`)
  assert(rect.left >= shell.left + inset, `${message}: content starts at ${rect.left - shell.left}, inside native controls ending at ${inset}`)
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  assert(Boolean(hit && node.contains(hit)), `${message}: heading or action is reachable`)
}

async function check(): Promise<string> {
  for (const scheme of ['dark', 'light'] as const) {
    for (const density of ['compact', 'comfortable'] as const) {
      for (const screen of ['new', 'settings', 'page', 'thread'] as const) {
        const render = (collapsed = true, inset = 84, selected: WindowScreen = screen): void => {
          flushSync(() => root.render(<ThemeProvider colorScheme={scheme} density={density}>
            <WindowControlsSpecimen screen={selected} collapsed={collapsed} inset={inset} />
          </ThemeProvider>))
        }
        render()
        const label = `${scheme}/${density}/${screen}`
        // Layout effects protect the first paint, without a later poll or explicit screen opt-in.
        checkClear(`${label}: initial`)
        await frame()
        checkClear(label)
        for (const header of document.querySelectorAll<HTMLElement>('[data-lower-header]')) {
          assert(Number.parseFloat(header.style.getPropertyValue('--ds-window-controls-inset') || '0') === 0, `${label}: lower headers keep their own padding`)
        }

        // Resize only a sibling: the settings title itself and all of its ancestors keep their dimensions.
        const rail = element('[data-window-rail]')
        rail.style.width = '208px'
        await frame(); await frame()
        checkClear(`${label}: resized rail`)
        const header = element('[data-window-content]').closest<HTMLElement>('header, h1')!
        assert(Number.parseFloat(header.style.getPropertyValue('--ds-window-controls-inset')) === 0, `${label}: expanded rail returns the space`)
        rail.style.width = '42px'
        await frame(); await frame()
        checkClear(`${label}: collapsed rail`)

        render(false)
        for (let i = 0; i < 40; i++) { await frame(); checkClear(`${label}: opening motion`) }
        render(true)
        for (let i = 0; i < 40; i++) { await frame(); checkClear(`${label}: closing motion`) }

        if (screen === 'page' || screen === 'settings') {
          const scroller = screen === 'page' ? element('[data-window-scroll]') : element('nav')
          scroller.scrollTop = scroller.scrollHeight
          await frame(); await frame()
          checkClear(`${label}: scrolled to the end`)
          assert(element('[data-window-content]').getBoundingClientRect().top < 44, `${label}: heading stays in the top band`)
        }
        if (screen === 'thread') {
          const shell = element('[data-ds-app-shell]')
          shell.style.width = '600px'
          await frame(); await frame()
          checkClear(`${label}: thread replaces the channel`)
          shell.style.width = ''
          await frame(); await frame()
          checkClear(`${label}: channel returns`)
        }
        render(true, 0, 'new')
        checkClear(`${label}: native title bar`, 0)
        assert(element('[data-window-content]').getBoundingClientRect().left < 84, `${label}: no macOS clearance on other platforms`)
      }
    }
  }
  return 'window controls: all layouts passed'
}

Object.assign(window, { checkWindowControls: check })
