import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectDesignSource, inspectDesignSources } from './design-system.mjs'

const path = 'apps/mac/src/renderer/src/components/Example.tsx'
test('allows composing custom components and assigning meaning', () => {
  const source = `import { Row, Text, Button, Dot } from '@design-system/react'
    function Project({project}) { return <Row gap="md"><Dot color={project.color}/><Text>{project.name}</Text><Button onClick={project.open}>Open</Button></Row> }`
  assert.deepEqual(inspectDesignSource(path, source), [])
})
test('rejects DS component overrides, raw controls, aliased imports, spreads, and DOM writes', () => {
  for (const source of [
    `const View = () => <Text sx={{fontSize: 12}} />`,
    `const View = () => <Row gap={9} />`,
    `const View = () => <Text style={appearance} />`,
    `const View = () => <div className="button" />`,
    `const View = () => <button>Send</button>`,
    `import { styled as make } from '@mui/material/styles'; const View = make('button')({})`,
    `export { styled as make } from '@emotion/styled'`,
    `import './view.css'`,
    `const props = {sx: appearance}; const View = () => <Text {...props} />`,
    `el.style.height = '24px'`,
    `el['style'].height = '24px'`,
    `el.setAttribute('style', 'color:red')`,
    `sheet.insertRule('div { color: red }')`,
    `const View = () => <Dot color="#fff" />`
  ])
    assert.ok(inspectDesignSource(path, source).length > 0, source)
})
test('does not mistake measured image/window values and load checks for design values', () => {
  assert.deepEqual(
    inspectDesignSource(
      path,
      `const bounds = {width: rect.width, height: rect.height}; new IntersectionObserver(callback, {rootMargin: '600px'}); const Image = () => <img src={url} width={image.width} />`
    ),
    []
  )
})
test('does not mistake a code language dictionary for a CSS definition', () => {
  assert.deepEqual(
    inspectDesignSource(path, `const languages = {css: 'css', ts: 'typescript'}`),
    []
  )
})
test('allows only the View Theme type augmentation and rejects implementation imports', () => {
  assert.deepEqual(
    inspectDesignSource(
      'apps/mac/src/renderer/src/ui/theme.ts',
      `import type { Theme } from '@mui/material/styles'`
    ),
    []
  )
  assert.ok(
    inspectDesignSource(
      'apps/mac/src/renderer/src/ui/theme.ts',
      `import { styled } from '@mui/material/styles'`
    ).length
  )
})

test('retired tuning props cannot come back via variables, aliases, or spreads', () => {
  for (const source of [
    `const gap = 4; const V = () => <Toolbar padX={gap} />`,
    `const props = {indent: 52}; const V = () => <DataList {...props} />`,
    `const props = {termWidth: width}; const V = () => <DescriptionList {...props} />`,
    `import { Resizer as Boundary } from '@design-system/react'; const V = () => <Boundary min={176} max={300} />`,
    `const W = 208; const V = () => <Panel width={W} />`,
    `const W = 200; const V = () => <Panel width={W + 8} />`,
    `const V = () => <Panel width={readWidth()} />; function readWidth() { return 208 }`,
    `const props = {width: 208}; const V = () => <Panel {...props} />`,
    `const V = () => <Panel width={open ? 208 : 300} />`,
    `const props = {width: 208} as const; const V = () => <Panel {...props} />`,
    `const V = () => <Toolbar padY={1.5} />`,
    `const V = () => <ToastStack offset={32} />`,
    `const width = 208; const props = {width}; const V = () => <Panel {...props} />`,
    `const sizes = {regular: 208}; const {regular: width} = sizes; const V = () => <Panel width={width} />`,
    `const read = () => 208; const V = () => <Panel width={read()} />`,
    `const accent = '#fff'; const V = () => <Dot color={accent} />`,
    `const props = {color: '#fff'}; const V = () => <Dot {...props} />`,
    `const props: {width: number} = {width: 208}; const V = () => <Panel {...props} />`,
    `const props: {width: number} = {width: 208}; const V = () => <Panel width={props.width} />`
  ]) assert.ok(inspectDesignSource(path, source).length, source)
})

test('traces dimensions hidden in other files or re-exports back to the consumer-side source', () => {
  const issues = inspectDesignSources(new Map([
    ['/virtual/size.ts', `export const WIDTH = 208`],
    ['/virtual/index.ts', `export { WIDTH as size } from './size.js'`],
    ['/virtual/View.tsx', `import { size as w } from './index.js'; const V = () => <Panel width={w} />`]
  ]))
  assert.ok(issues.some((issue) => issue.includes('View.tsx') && issue.includes('width')))
})

test('allows domain min/max, purpose selection, saved/measured values, and DS dimensions', () => {
  assert.deepEqual(inspectDesignSource(path, `
    import { paneProfiles, tableMetrics } from '@design-system/react/layout-spec'
    const defaults = {rail: paneProfiles.navigation.initial}
    const V = () => <><NumberInput min={1} max={16}/><Resizer profile="navigation" value={saved.rail}/>
      <Toolbar placement="panel"/><DescriptionList labels="short"/><DataList placement="history"/>
      <ToastStack placement="aboveFooter"/><Panel width={defaults.rail}/><HeadCell width={tableMetrics.cell.count}/>
      <Panel width={rect.width}/><SpacerRow height={range.padTop}/></>`), [])
})

test('does not ban non-display data size/offset fields by name alone', () => {
  assert.deepEqual(inspectDesignSource(path, `const attachment = {size: 2048, offset: 32}; const View = () => <Text>{attachment.size}</Text>`), [])
})
