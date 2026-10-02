import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectDesignInternals } from './design-system-internals.mjs'

const path = 'packages/design-system/src/components/Example.tsx'
test('rejects private focus rings and glows throughout the kit, including MUI state rules', () => {
  for (const selector of ['&:focus-visible', '&:focus-within', '&.Mui-focused', '&:has(.Mui-focusVisible)']) {
    for (const rule of ['outline: color', "'outlineWidth': 3", 'outlineOffset: -1', 'boxShadow: glow']) {
      assert.equal(inspectDesignInternals(path, `const style = {'${selector}': {${rule}}}`).length, 1)
    }
  }
})
test('allows shared focus recipes, bare input resets, selection colors and non-focus decoration', () => {
  assert.deepEqual(inspectDesignInternals(path, `const style = {
    '&:focus-visible': {...focusRing(theme, 'inside'), borderColor: theme.palette.primaryText},
    '& input:focus': {outline: 'none'}, '&:focus': {outline: 0},
    '&[data-dragging]': {outline: frame}, boxShadow: shadow
  }`), [])
})

test('keeps size recipes intact instead of overriding only height, type or corners', () => {
  for (const property of ['height', 'fontSize', 'lineHeight', 'letterSpacing', 'borderRadius', 'padding']) {
    assert.equal(inspectDesignInternals(path, `const style = {...controlMetrics(theme, 'xs'), ${property}: override}`).length, 1)
  }
  assert.deepEqual(inspectDesignInternals(path, `const style = {...controlMetrics(theme, 'xs'), width: '100%', color: theme.palette.text.primary}`), [])
})
