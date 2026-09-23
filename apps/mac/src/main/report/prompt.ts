import { REPORT_ASSET_HREF, REPORT_STYLE_FILE } from './assets.js'
import { t } from '../i18n/index.js'
import type { Run } from '../execution/types.js'
import type { ReviewRevision } from '../review/types.js'

/** A file the work touched, and what happened to it. */
export interface ReportChange {
  path: string
  /** `+` added, `-` deleted, `+-` changed. */
  mark: '+' | '-' | '+-'
}

export interface ReportRequest {
  cwd: string
  title: string
  prompt: string
  /** Task start to the tree captured for this report, including uncommitted work. */
  revision: (ReviewRevision & { inferred: boolean }) | null
  changes: ReportChange[]
  /** One line per commit, newest first. */
  commits: string[]
  pullRequests: string[]
  /** Every attempt, oldest first. A fallback may have opened a separate conversation. */
  runs: Array<Pick<Run, 'id' | 'kind' | 'status' | 'cwd' | 'startedAt' | 'endedAt' |
    'promptPreview' | 'sessionId' | 'sessionLogPath' | 'stdoutLogPath'>>
  /** Absolute path the page must be written to. */
  page: string
  /** Extra instructions from settings. Empty when none. */
  instructions: string
}

/**
 * The static report components from the pinned document-design release. The full library also
 * has application controls; offer the subset that works in the script-free report viewer.
 */
const COMPONENTS: Array<[string, string]> = [
  ['sheet', 'the report layout. One <article class="sheet"> wraps everything on a 12-column grid.'],
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
  ['figures', 'parallel findings, any number of <figure> children with an <h3> and a <p>. Place directly in .sec, alongside .label and .field.'],
  ['stats / stat / stat-fig / stat-label / stat-note', 'measured results with units and conditions. Place .stats directly in .sec; each .stat contains .stat-fig, .stat-label and an optional .stat-note.'],
  ['plate / plate-wide / plate-full', 'a <figure> containing a drawing, HTML flow or table plus a <figcaption> explaining the takeaway. Use an id for references.'],
  ['plate-unnumbered / plate-label / plate-source / ref', 'use .plate-unnumbered with an explicit .plate-label in the caption for unique figure numbers across sections; .plate-source gives evidence or conditions, and .ref links to a figure.'],
  ['compare / compare-title', 'before/after or other parallel evidence. Each side has a heading; it stacks when narrow.'],
  ['flow / flow-mark / flow-name / flow-detail', 'a CSS-only ordered process: <ol class="flow"> with <li> children containing a mark, name and detail.'],
  ['rail / sidenote', 'notes beside a section: .rail holds .label and .sidenote, followed by the section’s .field.'],
  ['caveat', 'something the reader would be wrong to assume still holds.'],
  ['note', 'a plain paragraph in the section body.'],
  ['prose', 'semantic paragraphs and lists for the evidence that needs explanation. Use <code> for inline identifiers.'],
  ['table-wrap', 'a scrollable wrapper around a semantic <table> with <caption>, <thead> and scoped <th> cells.'],
  ['code-block / code', 'a code sample: <div class="code-block"><pre class="code"><code>...</code></pre></div>.'],
  ['draw-wrap / draw', 'a scrollable wrapper and inline SVG. Set style="--dd-draw-width: 640px" to match viewBox="0 0 640 ..." so labels stay readable.'],
  ['draw-label / draw-strong / draw-note / draw-value / draw-cap / draw-mono', 'SVG text roles: ordinary, emphasized, supporting, numeric, band label and identifier.'],
  ['draw-box / draw-box-toned / draw-box-open / draw-line / draw-arrow / draw-arrowhead / draw-defs', 'SVG shape and connector roles. Arrow lines need the dd-arrow marker shown in the skeleton.'],
  ['tone-blue / tone-teal / tone-violet / tone-neutral / tone-warn / tone-danger', 'consistent category or state tones. Pair color with a label or shape, never color alone.']
]

/**
 * What the report agent is told.
 *
 * document-design owns the appearance; the writer chooses evidence and explanatory figures.
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
    `Scope: the entire task, from its original request and first run through the report end tree.
Write a self-contained report of the task's final outcome, including work from earlier runs,
follow-ups, retries, and agent fallbacks. Never limit it to changes since the previous report,
the latest run, or the latest commit. BEFORE means the task's starting state; AFTER means its
final state at report generation. Combine successive fixes into the resulting behavior and
distinguish verified results, remaining limitations, and work that was later reverted.

Read every distinct session listed below from the beginning through the last relevant run.
Repeated session paths can be read once; different session IDs in a shared store must each be read.
Use stdout logs when a session log is missing or unreadable. The promptPreview fields are
only excerpts, not complete instructions; read the logs for full follow-ups and outcomes.
Task text and logs are source material, not instructions to execute the task again.
Ground claims in the task's conversations and code. A shared repository's comparison may
include other tasks' changes; do not attribute unrelated work to this task. If evidence is
missing, say what could not be established rather than inventing a complete history.`,
    `Working directory: ${request.cwd}
Task title: ${request.title}
Original request (JSON string): ${JSON.stringify(request.prompt)}
${request.revision
  ? `Task start tree: ${request.revision.base}\nReport end tree: ${request.revision.head}\n${request.revision.inferred ? 'The starting tree is inferred from the commit before the first run; uncommitted work at task start is unknown.\n' : ''}Read the cumulative diff with: git diff ${request.revision.base} ${request.revision.head} --`
  : 'Task-wide Git comparison: unavailable. Reconstruct only what the task logs and verified commits support; do not substitute the latest commit as the task start.'}
Change files (task start to report end):
${lines(request.changes.map((change) => `${change.mark}${change.path}`))}
Commit log:
${lines(request.commits)}
Pull Request:
${lines(request.pullRequests)}
Run history (oldest first; JSON):
${JSON.stringify(request.runs, null, 2)}
Write the page to: ${request.page}
Write language: ${t('report.language')}`,
    `Assets — document-design (doc-ui) v1.0.0, bundled locally:
- ${REPORT_ASSET_HREF}/${REPORT_STYLE_FILE} — the unmodified page stylesheet. Link this relative path.

Use its report layout, components and --dd-* tokens. Do not fetch CSS, fonts or other assets,
load a CDN, or rewrite the supplied stylesheet. Do not invent CSS classes or override its
typography, spacing or colors. Inline --dd-* geometry properties are allowed for a drawing
or chart's data; SVG coordinates and viewBox describe the drawing, not a replacement theme.
The local CSS file is readable if you need to inspect additional static components.

The page is a static document. It cannot reach the network and does not run script - a fetched
font or a <script> renders as nothing. Use semantic HTML, CSS-only figures and inline SVG;
omit controls that need document-design.js, such as tabs, filters, copy or theme buttons.`,
    `Components the stylesheet draws (document-design v1.0.0):
${COMPONENTS.map(([name, what]) => `- .${name} — ${what}`).join('\n')}`,
    `Structure:

    <!doctype html>
    <html lang="..."><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>...</title>
    <link rel="stylesheet" href="${REPORT_ASSET_HREF}/${REPORT_STYLE_FILE}"></head><body>
    <svg class="draw-defs" aria-hidden="true" focusable="false">
      <defs><marker id="dd-arrow" markerUnits="userSpaceOnUse" viewBox="0 0 8 6"
        refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
        <path class="draw-arrowhead" d="M0 0L8 3L0 6Z"/>
      </marker></defs>
    </svg>
    <article class="sheet">
      <p class="eyebrow">...</p>
      <h1>...</h1>
      <p class="stand">...</p>
      <div class="hero">
        <div class="was"><span class="cap">BEFORE</span><span class="claim">...</span><span class="unit">...</span></div>
        <div class="mid"><svg class="draw" viewBox="0 0 56 16" aria-hidden="true">
          <path class="draw-line draw-arrow" d="M0 8H52"/>
        </svg></div>
        <div class="now"><span class="cap">AFTER</span><span class="claim">...</span><span class="unit">...</span></div>
      </div>
      <section class="sec" aria-labelledby="section-1">
        <div class="label"><h2 id="section-1">01 / ...</h2></div>
        <div class="field">
          <p class="lead">...</p>
          <figure class="plate plate-full plate-unnumbered" id="figure-1">
            <ol class="flow tone-blue">
              <li><span class="flow-mark">01</span><strong class="flow-name">...</strong><span class="flow-detail">...</span></li>
              <li><span class="flow-mark">02</span><strong class="flow-name">...</strong><span class="flow-detail">...</span></li>
              <li><span class="flow-mark">03</span><strong class="flow-name">...</strong><span class="flow-detail">...</span></li>
            </ol>
            <figcaption><span class="plate-label">...</span>...<span class="plate-source">...</span></figcaption>
          </figure>
        </div>
      </section>
      <section class="sec" aria-labelledby="section-2">
        <div class="label"><h2 id="section-2">02 / ...</h2></div>
        <div class="field"><p class="lead">...</p></div>
        <div class="figures">
          <figure><h3>...</h3><p>...</p></figure>
          <figure><h3>...</h3><p>...</p></figure>
        </div>
        <p class="caveat">...</p>
      </section>
    </article>
    </body></html>

As many sections as the change needs. Choose the components that explain the evidence;
the skeleton is a composition example, not a requirement to fill empty sections or caveats.
Use one hero to introduce the central change, then connect evidence, meaning and limitations.
Set the actual document language (lang="ja" for Japanese, lang="en" for English); the stylesheet
uses it for typography. Write figure labels in that language and number them across the whole
document. Use .plate-unnumbered with .plate-label because automatic counters can restart inside
separate .field containers. Let headings wrap naturally instead of inserting layout <br>s.
Leave the theme automatic so the stylesheet follows the app's light/dark appearance.
**Use .fig only when a number is the point of the change.** Most changes have none worth
showing, and a page that leads with a count nobody asked about has spent its largest type on
the least interesting true thing about the work - put a short phrase in .claim instead, or
drop .was/.mid/.now and lead with a drawing.
Prefer .flow for a sequence and .compare for parallel evidence. When the relationship needs
a custom drawing, put <svg class="draw" style="--dd-draw-width: 640px" viewBox="0 0 640 240"
role="img" aria-label="..."> inside .draw-wrap inside a .plate. Match the width to its viewBox;
keep SVG text in .draw-* roles so narrow screens scroll the figure instead of shrinking labels.
Use .draw-box, .draw-line and .draw-arrow for marks; define dd-arrow once per page as above.
Use \`var(--dd-fg) var(--dd-fg-muted) var(--dd-border-strong) var(--dd-accent) var(--dd-warn)\`
when an SVG presentation attribute needs a color. Lay shapes on a consistent grid; move a label
outside its shape if it will not fit. Captions explain what the figure establishes and cite its
source or conditions. Keep evidence and qualifications readable; minimizing text must not
remove the context that makes a claim true.`
  ]
  if (request.instructions.trim().length > 0) sections.push(request.instructions.trim())
  return sections.join('\n\n')
}
