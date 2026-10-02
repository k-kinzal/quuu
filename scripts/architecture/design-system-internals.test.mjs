import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectDesignInternals } from './design-system-internals.mjs'

const path = 'packages/design-system/src/components/Example.tsx'
test('requires visible tooltips for named icon controls, including styled and MUI buttons', () => {
  const declarations = `import Action from '@mui/material/IconButton'; const Root = styled('button')({}); const Derived = styled(Root)({});`
  for (const tag of ['button', 'Root', 'Derived', 'Action']) {
    for (const title of ['', 'title={label}']) {
      assert.equal(inspectDesignInternals(path, `${declarations} const view = <${tag} aria-label={label} ${title}><Icon /></${tag}>`).length, 1)
    }
    assert.deepEqual(inspectDesignInternals(path, `${declarations} const view = <ControlTooltip title={label}><${tag} aria-label={label}><Icon /></${tag}></ControlTooltip>`), [])
  }
  assert.deepEqual(inspectDesignInternals(path, `const view = <div role="img" aria-label={label} title={label} />`), [])
  assert.equal(inspectDesignInternals(path, `const Item = styled('button')({}); const view = <Item collapsed={collapsed} title={label}>{icon}</Item>`).length, 1)
  assert.equal(inspectDesignInternals(path, `const Grip = styled('button')({}); const view = <Grip title={label} />`).length, 1)
})
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
