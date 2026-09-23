import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportRoot } from '../appPaths.js'
import documentDesignCss from './vendor/document-design/v1.0.0/document-design.css?raw'
import documentDesignNotice from './vendor/document-design/v1.0.0/NOTICE.txt?raw'

/**
 * Bundle the pinned upstream CSS as text so packaged and development builds write the same
 * offline asset. The report viewer permits local files only and never runs the optional JS.
 * Assets live once at the root because they belong to every report, not to any one task.
 */
export const REPORT_ASSETS = 'assets'
export const REPORT_STYLE_FILE = 'document-design-v1.0.0.css'
export const REPORT_NOTICE_FILE = 'document-design-v1.0.0.NOTICE.txt'

/** How a page reaches them from its own directory. */
export const REPORT_ASSET_HREF = `../${REPORT_ASSETS}`

/**
 * Restore the pinned assets on generation. Versioned names leave older reports' stylesheets,
 * including the original report.css, intact when their markup uses a different component API.
 */
export function writeReportAssets(): void {
  const dir = join(reportRoot(), REPORT_ASSETS)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, REPORT_STYLE_FILE), documentDesignCss)
  writeFileSync(join(dir, REPORT_NOTICE_FILE), documentDesignNotice)
}
