import { REPORT_ASSET_HREF, REPORT_STYLE_FILE } from './assets.js'
import { t } from '../i18n/index.js'

/** A file the work touched, and what happened to it. */
export interface ReportChange {
  path: string
  /** `+` added, `-` deleted, `+-` changed. */
  mark: '+' | '-' | '+-'
}

export interface ReportRequest {
  cwd: string
  changes: ReportChange[]
  /** One line per commit, newest first. */
  commits: string[]
  pullRequests: string[]
  /** The conversation the work happened in. Empty when there is none to read. */
  sessionLog: string
  /** Absolute path the page must be written to. */
  page: string
  /** Extra instructions from settings. Empty when none. */
  instructions: string
}

/**
 * The components the stylesheet draws, and what each is for.
 *
 * **This list and the stylesheet are one thing.** A class the sheet styles but the instructions
 * never mention is a component nobody uses; a class named here that the sheet does not style is a
 * page that arrives undressed. `tests/reportStyle.test.ts` fails when they disagree.
 */
const COMPONENTS: Array<[string, string]> = [
  ['page', 'the sheet. One <div class="page"> wraps everything; it lays the 12 columns.'],
  ['eyebrow', 'the small line above the title.'],
  ['stand', 'the one sentence under the title.'],
  ['hero', 'what the page leads with. Either .was/.mid/.now side by side, or one <svg>.'],
  ['was / now', 'the two sides of the hero. Each holds .cap, .fig, .unit.'],
  ['mid', 'the gap between them; put an arrow <svg> in it.'],
  ['cap / fig / unit', 'a hero side: its label, a number, what the number counts.'],
  ['claim', 'the same slot as .fig, carrying a short phrase instead of a number.'],
  ['sec', 'one section. Holds .label and .field.'],
  ['label', 'the section name, in the left column.'],
  ['field', 'the section body, in the right columns.'],
  ['lead', 'the one line that says what the section is about.'],
  ['three', 'things abreast, three to a row, any number of them. Each is a <figure> with an <svg>, an <h3>, a <p>.'],
  ['holds / hold', 'number cards, two to a row, any number of them. Each is <div class="hold"><b>0</b><span>…</span></div>.'],
  ['caveat', 'something the reader would be wrong to assume still holds.'],
  ['note', 'a plain paragraph in the section body.'],
  ['mono', 'a path, an identifier, a command, inline.']
]

/**
 * What the report agent is told.
 *
 * Six versions of steering and two of handing over nothing both came back as documents with
 * pictures in them. Handed only the ask, the writer wrote its own stylesheet and its own
 * drawings; handed a licence to fetch anything, it reached for a font, a chart library, an icon
 * set and a diagram engine — and still produced a report.
 *
 * **So the design is Quuu\'s and the content is the writer\'s.** The sheet, the components and
 * the shape of the page are handed over ready to use, because a page that has to invent its own
 * appearance spends its effort there and six reports come out looking like six products — the
 * point at which a reader stops trusting what is in them. What is left to the writer is the part
 * only it can do: what changed, and which picture shows it.
 *
 * The one thing the ask still carries is **what an infographic is**. The word alone was read as
 * "a report, illustrated" every time.
 *
 * The text is dev-facing: it goes to a CLI, never onto a screen. Only the language the report is
 * written in follows the app\'s locale.
 */
export function reportPrompt(request: ReportRequest): string {
  const lines = (values: string[]): string =>
    values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- (none)'

  const sections = [
    `Please create an infographic of the changed intent in HTML.

> An infographic (information graphic) is a visual representation of information, data, or knowledge[1]. Infographics are used when information needs to be expressed quickly and clearly, and can be seen in signs, maps, journalism, technical writing, and education. They are also frequently used in computer science, mathematics, and statistics to clearly convey conceptual information. They are widely applied to the visualization of scientific information as well.

Please focus the information here on the changes in intent realized through code changes, such as specifications, concepts, and procedures.
Keep text usage to a minimum, and make the changes visually recognizable.`,
    `Working directory: ${request.cwd}
Change files:
${lines(request.changes.map((change) => `${change.mark}${change.path}`))}
Commit log:
${lines(request.commits)}
Pull Request:
${lines(request.pullRequests)}
Session file: ${request.sessionLog || '(none)'}
Write the page to: ${request.page}
Write language: ${t('report.language')}`,
    `Assets:
- ${REPORT_ASSET_HREF}/${REPORT_STYLE_FILE} — the page stylesheet. Link it; write no CSS of your own unless the sheet has no component for what you need.

The page is a static document. It cannot reach the network and does not run script - a fetched
font or a <script> renders as nothing.`,
    `Components the stylesheet draws:
${COMPONENTS.map(([name, what]) => `- .${name} — ${what}`).join('\n')}`,
    `Structure:

    <!doctype html>
    <html lang="..."><head><meta charset="utf-8">
    <link rel="stylesheet" href="${REPORT_ASSET_HREF}/${REPORT_STYLE_FILE}"></head><body>
    <div class="page">
      <p class="eyebrow">...</p>
      <h1>...</h1>
      <p class="stand">...</p>
      <div class="hero">
        <div class="was"><span class="cap">BEFORE</span><span class="claim">...</span><span class="unit">...</span></div>
        <div class="mid"><svg viewBox="0 0 56 16">...</svg></div>
        <div class="now"><span class="cap">AFTER</span><span class="claim">...</span><span class="unit">...</span></div>
      </div>
      <div class="sec">
        <div class="label">01<br>...</div>
        <div class="field"><p class="lead">...</p><svg viewBox="0 0 820 268">...</svg></div>
      </div>
      <div class="sec">
        <div class="label">02<br>...</div>
        <div class="field"><p class="lead">...</p></div>
        <div class="three">
          <figure><svg viewBox="0 0 260 96">...</svg><h3>...</h3><p>...</p></figure>
          ... two more ...
        </div>
      </div>
    </div>
    </body></html>

As many sections as the change needs - at least two. The hero is what the page leads with, and
there is exactly one.
**Use .fig only when a number is the point of the change.** Most changes have none worth
showing, and a page that leads with a count nobody asked about has spent its largest type on
the least interesting true thing about the work - put a short phrase in .claim instead, or
drop .was/.mid/.now and lead with a drawing.
Draw with inline <svg> inside .field or a <figure>; it inherits the page's colours through
\`var(--ink) var(--sub) var(--dim) var(--rule) var(--hair) var(--now) var(--warn)\` and the
named \`--blue --green --amber --red --violet --slate\`. Lay a drawing out on a grid before placing it: shapes
of one kind at one size, one stroke width, arrows of one length. A label that does not fit its
shape goes outside it.`
  ]
  if (request.instructions.trim().length > 0) sections.push(request.instructions.trim())
  return sections.join('\n\n')
}
