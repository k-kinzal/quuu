import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportRoot } from '../appPaths.js'
import { reportCss } from './style.js'

/**
 * What Quuu puts next to the reports for every page to use.
 *
 * **The look is Quuu's; the content is the writer's.** A page that has to bring its own
 * appearance spends its effort there, and six reports come out looking like six products — which
 * is the point at which a reader stops trusting what is in them. So the stylesheet is handed over
 * ready to use, and the writer is left the thing only it can do.
 *
 * It lives **once at the root**, not per task: one sheet dresses every report, and rewriting it
 * per task would only spread the same bytes around.
 *
 * A drawing library lived here too for a while (Mermaid, then d3 beside it). Neither earned its
 * place: what Mermaid produced was a diagram rather than a picture, and the pages that came out
 * best drew their own SVG on a grid. Removing them took the only reason a report had to run
 * script with them, so the page is a static document again.
 */
export const REPORT_ASSETS = 'assets'
export const REPORT_STYLE_FILE = 'report.css'

/** How a page reaches them from its own directory. */
export const REPORT_ASSET_HREF = `../${REPORT_ASSETS}`

/**
 * Refresh the shared assets.
 *
 * Rewritten on every generation rather than once, so a report kept from an older build opens
 * dressed in the current design instead of in whatever shipped that month.
 */
export function writeReportAssets(): void {
  const dir = join(reportRoot(), REPORT_ASSETS)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, REPORT_STYLE_FILE), reportCss())
}
