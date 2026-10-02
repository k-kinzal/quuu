import { fileURLToPath } from 'node:url'
import { analyze } from './analyze.mjs'
import { inspectDesignConsumers } from './design-system.mjs'
import { inspectDesignKit } from './design-system-internals.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const result = analyze(root)
const design = inspectDesignConsumers(root)
result.issues.push(...design.issues)
const kit = inspectDesignKit(root)
result.issues.push(...kit.issues)
if (result.issues.length) {
  console.error(result.issues.join('\n'))
  process.exitCode = 1
} else {
  console.log(
    `Architecture check: ${result.files} files / ${result.edges} dependencies. No layer, public-entry, manifest, or cycle violations.`
  )
  console.log(`Design System: ${design.files} consumer files. 0 styling-rule leaks.`)
  console.log(`Design System: ${kit.files} implementation files. 0 control-contract violations.`)
}
