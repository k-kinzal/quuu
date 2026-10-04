import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ControlSpecimen } from '../../../packages/design-system/src/components/ControlQuality.stories.js'
import { TooltipSpecimen } from '../../../packages/design-system/src/components/TooltipQuality.stories.js'
import { ExplorerResizeSpecimen } from '../../../packages/design-system/src/components/layout/EditorWorkspace.stories.js'
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

function equal(actual: unknown, expected: unknown, message: string | (() => string)): void {
  if (actual !== expected) throw new Error(`${typeof message === 'function' ? message() : message}: ${String(actual)} != ${String(expected)}`)
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

async function focus(name: string, selector?: string, expected?: Partial<CSSStyleDeclaration>, styleSelector?: string): Promise<CSSStyleDeclaration> {
  const target = element(name, selector)
  await focusTarget(target, name)
  const style = getComputedStyle(element(name, styleSelector))
  const deadline = performance.now() + 2000
  // Focus events can precede the renderer's resolved style update. Keep the
  // exact appearance assertions below, but allow that update to finish first.
  while (expected && Object.entries(expected).some(([property, value]) => style[property as keyof CSSStyleDeclaration] !== value) && performance.now() < deadline) {
    await frame()
  }
  return style
}

async function focusTarget(target: HTMLElement, name: string): Promise<void> {
  target.focus()
  // An inactive window can retain activeElement without matching native focus selectors.
  // One animation frame does not establish that the hidden renderer has acquired focus.
  const deadline = performance.now() + 2000
  const focused = (): boolean => document.hasFocus() && document.activeElement === target && target.matches(':focus')
  do { await frame() } while (!focused() && performance.now() < deadline)
  if (!focused()) {
    throw new Error(`${name}: native focus is missing: ${JSON.stringify(focusState(target))}`)
  }
}

function focusState(target: HTMLElement, vessel = target): object {
  const style = getComputedStyle(vessel)
  const matchingRules = (rules: CSSRuleList): string[] => Array.from(rules).flatMap(rule => {
    if (rule instanceof CSSStyleRule && (target.matches(rule.selectorText) || vessel.matches(rule.selectorText))) return [rule.cssText]
    return rule instanceof CSSGroupingRule ? matchingRules(rule.cssRules) : []
  })
  return { documentFocused: document.hasFocus(), active: document.activeElement?.outerHTML,
    focused: target.matches(':focus'), focusVisible: target.matches(':focus-visible'),
    outline: style.outline, outlineOffset: style.outlineOffset, target: target.outerHTML,
    animation: style.animation, transition: style.transition, appearance: style.appearance,
    animations: target.getAnimations().map(animation => ({ playState: animation.playState, currentTime: animation.currentTime })),
    userAgent: navigator.userAgent,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    moreContrast: matchMedia('(prefers-contrast: more)').matches,
    rules: Array.from(document.styleSheets).flatMap(sheet => matchingRules(sheet.cssRules)) }
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

  const search = await focus('search', 'input', { outlineWidth: '2px', outlineOffset: '1px' })
  const ring = { color: search.outlineColor, width: search.outlineWidth, offset: search.outlineOffset }
  equal(ring.width, '2px', 'search focus must be visible')
  equal(ring.offset, '1px', 'standalone focus is outside the frame')
  equal(getComputedStyle(element('search', 'input')).outlineStyle, 'none', 'only the vessel draws focus')
  for (const [name, selector] of [['filter'], ['text', 'input'], ['number', 'input'], ['select', '[role="combobox"]'], ['readonly', 'input'], ['inline'], ['prose'], ['composer', 'textarea'], ['button']] as const) {
    const style = await focus(name, selector, { outlineColor: ring.color, outlineWidth: ring.width, outlineOffset: ring.offset })
    for (const key of ['color', 'width', 'offset'] as const) {
      const prop = { color: 'outlineColor', width: 'outlineWidth', offset: 'outlineOffset' } as const
      equal(style[prop[key]], ring[key], () => `${name}: focus ${key} (${JSON.stringify(focusState(element(name, selector), element(name)))})`)
    }
  }
  for (const [name, selector] of [['icon', 'button'], ['tabs', '[role="tab"]']] as const) {
    const style = await focus(name, selector, { outlineColor: ring.color, outlineWidth: ring.width, outlineOffset: '-2px' }, selector)
    equal(style.outlineColor, ring.color, `${name}: focus color`)
    equal(style.outlineWidth, ring.width, `${name}: focus width`)
    equal(style.outlineOffset, '-2px', `${name}: inset focus`)
  }
  for (const [name, vessel] of [['checkbox', '.MuiCheckbox-root'], ['switch', '.MuiSwitch-root'], ['segments', '.MuiFormControlLabel-root']] as const) {
    const style = await focus(name, 'input', { outlineColor: ring.color, outlineWidth: ring.width }, vessel)
    equal(style.outlineColor, ring.color, `${name}: focus color`)
    equal(style.outlineWidth, ring.width, `${name}: focus width`)
  }
  const invalidBorder = getComputedStyle(element('error', 'fieldset')).borderColor
  await focus('error', 'input', { outlineColor: ring.color })
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

const tooltipCases = [
  ['nav', 'Project files / プロジェクト構造'], ['activity', 'Files panel'], ['collapse', 'Restore panel'],
  ['nav-custom', 'Documents and notes', 'button:nth-of-type(2)', 'nav'],
  ['icon', 'Add item'], ['disabled', 'Unavailable action'], ['menu', 'More actions'],
  ['list', 'Add row'], ['list-disabled', 'Remove row'], ['send', 'Send message'],
  ['split', 'Choose action', 'button[aria-haspopup]'], ['close', 'Close First (Delete)', 'button[aria-label="Close First"]'],
  ['scroll', 'Scroll tabs right', 'button[aria-label="Scroll tabs right"]'],
  ['scroll-disabled', 'Scroll tabs left', 'button[aria-label="Scroll tabs left"]', 'scroll'],
  ['reorder', 'Drag, or ↑ ↓ to reorder'], ['swatch', 'blue'], ['dismiss', 'Dismiss']
]

function tooltipTarget(name: string): HTMLButtonElement {
  const testCase = tooltipCases.find(item => item[0] === name)
  const selector = testCase?.[2] ?? 'button'
  const target = document.querySelector(`[data-tooltip="${testCase?.[3] ?? name}"] ${selector}`)
  if (!(target instanceof HTMLButtonElement)) throw new Error(`Missing tooltip control ${name}`)
  return target
}

async function renderTooltips(scheme: ColorScheme, density: Density): Promise<string[][]> {
  // Remount so a focused/hovered control cannot carry state into the next density.
  flushSync(() => root.render(<ThemeProvider key={`${scheme}-${density}`} colorScheme={scheme} density={density}><TooltipSpecimen /></ThemeProvider>))
  await document.fonts.ready
  await frame()
  return tooltipCases
}

async function prepareTooltip(name: string): Promise<{ x: number; y: number }> {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  await frame()
  const target = tooltipTarget(name)
  target.scrollIntoView({ block: 'center' })
  // Settle scrolling before hover/focus so a delayed pointer leave cannot dismiss the new name.
  await frame()
  const bounds = target.getBoundingClientRect()
  if (!target.getAttribute('aria-label')) throw new Error(`${name}: missing accessible name`)
  if (target.hasAttribute('title')) throw new Error(`${name}: native tooltip would compete with the kit`)
  return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) }
}

function checkTooltip(text: string): void {
  const tips = [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')]
  equal(tips.length, 1, `${text}: exactly one tooltip`)
  equal(tips[0].textContent, text, 'visible tooltip name')
  // Popper rounds translation to device pixels; inspect the painted bubble inside its margins.
  const bounds = (tips[0].querySelector('.MuiTooltip-tooltip') ?? tips[0]).getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0 || bounds.left < 0 || bounds.right > innerWidth || bounds.top < 0 || bounds.bottom > innerHeight) throw new Error(`${text}: tooltip outside the viewport ${JSON.stringify(bounds.toJSON())}, viewport ${innerWidth}x${innerHeight}`)
  if (tips[0].closest('nav')) throw new Error(`${text}: tooltip clipped by the navigation container`)
}

Object.assign(window, { renderTooltips, prepareTooltip, tooltipTarget, checkTooltip,
  focusTooltip: (name: string) => focusTarget(tooltipTarget(name), name) })

async function renderExplorer(width: number, scheme: ColorScheme): Promise<void> {
  flushSync(() => root.render(<ThemeProvider colorScheme={scheme}><ExplorerResizeSpecimen width={width} /></ThemeProvider>))
  await frame()
  await frame()
}

function explorerGeometry() {
  const pane = document.querySelector<HTMLElement>('section[aria-label="Files"]')!
  const content = document.querySelector<HTMLElement>('section[aria-label="Selected content"]')!
  const handle = document.querySelector<HTMLElement>('[role="separator"]')!
  const layout = document.querySelector<HTMLElement>('[data-explorer-layout]')!
  const bounds = handle.getBoundingClientRect()
  return {
    width: pane.getBoundingClientRect().width,
    content: content.getBoundingClientRect().width,
    overflow: layout.scrollWidth > layout.clientWidth,
    value: Number(handle.getAttribute('aria-valuenow')),
    x: Math.round(bounds.x), y: Math.round(bounds.y + bounds.height / 2)
  }
}

Object.assign(window, { renderExplorer, explorerGeometry })
