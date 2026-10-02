import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ControlSpecimen } from '../../../packages/design-system/src/components/ControlQuality.stories.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { ColorScheme, Density } from '../../../packages/design-system/src/theme/tokens.js'

const root = createRoot(document.getElementById('root')!)
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()))

function element(name: string, selector?: string): HTMLElement {
  const parent = document.querySelector(`[data-control="${name}"]`)
  const node = selector ? parent?.querySelector(selector) : parent?.firstElementChild
  if (!(node instanceof HTMLElement)) throw new Error(`Missing control: ${name} ${selector ?? ''}`)
  return node
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} != ${String(expected)}`)
}

function sameGeometry(names: string[]): void {
  const [first, ...rest] = names.map(name => element(name))
  for (const node of rest) {
    equal(node.getBoundingClientRect().height, first.getBoundingClientRect().height, `${names.join(', ')}: height`)
    for (const key of ['fontSize', 'lineHeight', 'letterSpacing', 'borderRadius'] as const) {
      equal(getComputedStyle(node)[key], getComputedStyle(first)[key], `${names.join(', ')}: ${key}`)
    }
  }
}

async function focus(name: string, selector?: string): Promise<CSSStyleDeclaration> {
  element(name, selector).focus()
  await frame()
  if (document.activeElement !== element(name, selector)) throw new Error(`Focus moved away from ${name} to ${document.activeElement?.outerHTML}`)
  return getComputedStyle(element(name))
}

async function check(scheme: ColorScheme, density: Density): Promise<string> {
  flushSync(() => root.render(<ThemeProvider colorScheme={scheme} density={density}><ControlSpecimen /></ThemeProvider>))
  await document.fonts.ready
  await frame()
  sameGeometry(['search', 'filter', 'selected', 'button-xs', 'search-disabled', 'filter-disabled'])
  sameGeometry(['text', 'number', 'select', 'button-md', 'error', 'text-disabled', 'select-disabled', 'readonly'])
  equal(getComputedStyle(element('search', 'input')).fontSize, getComputedStyle(element('filter')).fontSize, 'search text inherits the filter type scale')
  const height = element('search').getBoundingClientRect().height
  equal(height, density === 'compact' ? 22 : 36, 'filter density')
  if (element('textarea').getBoundingClientRect().height <= element('text').getBoundingClientRect().height) throw new Error('Multiline field was collapsed to single-line height')

  const search = await focus('search', 'input')
  const ring = { color: search.outlineColor, width: search.outlineWidth, offset: search.outlineOffset }
  equal(ring.width, '2px', 'search focus must be visible')
  equal(ring.offset, '1px', 'standalone focus is outside the frame')
  equal(getComputedStyle(element('search', 'input')).outlineStyle, 'none', 'only the vessel draws focus')
  for (const [name, selector] of [['filter'], ['text', 'input'], ['number', 'input'], ['select', '[role="combobox"]'], ['readonly', 'input'], ['inline'], ['prose'], ['composer', 'textarea'], ['button']] as const) {
    const style = await focus(name, selector)
    for (const key of ['color', 'width', 'offset'] as const) {
      const prop = { color: 'outlineColor', width: 'outlineWidth', offset: 'outlineOffset' } as const
      equal(style[prop[key]], ring[key], `${name}: focus ${key}`)
    }
  }
  for (const [name, selector] of [['icon', 'button'], ['tabs', '[role="tab"]']] as const) {
    const target = element(name, selector)
    target.focus()
    await frame()
    equal(getComputedStyle(target).outlineColor, ring.color, `${name}: focus color`)
    equal(getComputedStyle(target).outlineWidth, ring.width, `${name}: focus width`)
    equal(getComputedStyle(target).outlineOffset, '-2px', `${name}: inset focus`)
  }
  for (const [name, vessel] of [['checkbox', '.MuiCheckbox-root'], ['switch', '.MuiSwitch-root'], ['segments', '.MuiFormControlLabel-root']] as const) {
    element(name, 'input').focus()
    await frame()
    equal(getComputedStyle(element(name, vessel)).outlineColor, ring.color, `${name}: focus color`)
    equal(getComputedStyle(element(name, vessel)).outlineWidth, ring.width, `${name}: focus width`)
  }
  const invalidBorder = getComputedStyle(element('error', 'fieldset')).borderColor
  await focus('error', 'input')
  equal(getComputedStyle(element('error', 'fieldset')).borderColor, invalidBorder, 'invalid border survives focus')
  equal(getComputedStyle(element('error')).outlineColor, ring.color, 'validation does not replace keyboard focus')
  for (const name of ['search-disabled', 'filter-disabled', 'text-disabled', 'select-disabled']) {
    equal(getComputedStyle(element(name)).opacity, '0.4', `${name}: disabled appearance`)
  }
  for (const name of ['text', 'number', 'select', 'textarea']) {
    equal(getComputedStyle(element(name, 'fieldset')).borderTopWidth, '1px', `${name}: frame never thickens`)
  }
  element('filter').click()
  await frame()
  sameGeometry(['search', 'filter', 'selected'])
  equal(element('search').getBoundingClientRect().height, height, 'interaction does not resize the row')
  return `${scheme}/${density}: geometry, type, frame, focus, disabled, error and selection passed`
}

function prepareHover(name: string): { x: number; y: number; border: string; background: string } {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  const target = element(name)
  target.scrollIntoView({ block: 'center' })
  const bounds = target.getBoundingClientRect()
  const style = getComputedStyle(target)
  return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2), border: style.borderColor, background: style.backgroundColor }
}

function readHover(name: string): { border: string; background: string } {
  const style = getComputedStyle(element(name))
  return { border: style.borderColor, background: style.backgroundColor }
}

Object.assign(window, { checkControls: check, prepareHover, readHover })
