/**
 * The stylesheet Quuu writes beside every report.
 *
 * **The look belongs to the app, not to whoever wrote the page.** Handing the stylesheet over
 * instead of asking for one is what keeps every report the same page, and leaves the agent only
 * the content. It styles bare semantic HTML only — no class name appears here, so a document
 * cannot ask for an appearance and a writer cannot invent one.
 *
 * The colors are the app's, but they are **spelled out here rather than read from the design
 * system**: main is process logic and must not import a UI package (`scripts/architecture/policy.mjs`).
 * That leaves two places holding the same values, so `tests/reportStyle.test.ts` fails the moment
 * they disagree — the drift is caught by the gate instead of by someone noticing a report looks
 * faintly wrong.
 *
 * Both appearances are written with `light-dark()` against `color-scheme`, and Quuu sets
 * `nativeTheme.themeSource`, so one file follows whichever the app is showing.
 */

/** The app's colors, as the two appearances. Checked against the design system's tokens in tests. */
export const REPORT_COLORS = {
  canvas: { dark: '#1f2023', light: '#fcfcfe' },
  inset: { dark: '#25272b', light: '#eef0f3' },
  card: { dark: '#292c30', light: '#f6f7f9' },
  text: { dark: '#d9dbdd', light: '#1b1e24' },
  secondary: { dark: '#a7abb3', light: '#4d535d' },
  tertiary: { dark: '#8c919b', light: '#686d78' },
  border: { dark: '#363940', light: '#d9dbe0' },
  /* Drawings need a heavier line than a page rule: a hairline on a dark sheet reads as nothing */
  borderStrong: { dark: '#4d515a', light: '#b8bcc4' },
  link: { dark: '#5ea8f9', light: '#0065b7' },
  /*
   * What a drawing is allowed to use. Six named colors, offset in both lightness and chroma so a
   * diagram has a priority order instead of six things shouting equally. A page that reaches for
   * its own colors is the one page in the product nobody designed.
   */
  slate: { dark: '#8d94a2', light: '#676d79' },
  green: { dark: '#5dac7b', light: '#1b7c4a' },
  violet: { dark: '#aa8ddd', light: '#7d5eaf' },
  blue: { dark: '#5eabf1', light: '#006bb2' },
  red: { dark: '#fe6863', light: '#ac011a' },
  amber: { dark: '#e8a750', light: '#975d00' }
} as const

const UI_FONT = "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif"
const MONO_FONT = "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace"

function pair(name: keyof typeof REPORT_COLORS): string {
  const value = REPORT_COLORS[name]
  return `light-dark(${value.light}, ${value.dark})`
}

export function reportCss(): string {
  return `/*
 * Type scale: major third (1.25) from a 16px base — 13 16 20 25 31 39 49 61 76
 * Vertical rhythm: one baseline = 28px. Every block gap is a multiple of it.
 * Grid: 12 columns, 24px gutter. Label field = 1–2, content field = 4–12.
 * Colour: neutrals plus one accent. The accent means "now".
 */
:root {
  color-scheme: light dark;
  --bg: ${pair('canvas')};
  --card: ${pair('card')};
  --ink: ${pair('text')};
  --sub: ${pair('secondary')};
  --dim: ${pair('tertiary')};
  --hair: ${pair('border')};
  --rule: ${pair('borderStrong')};
  --now: ${pair('link')};
  --warn: ${pair('amber')};
  --amber: ${pair('amber')};
  --blue: ${pair('blue')};
  --green: ${pair('green')};
  --red: ${pair('red')};
  --violet: ${pair('violet')};
  --slate: ${pair('slate')};
  --inset: ${pair('inset')};
  --base: 28px;
}

*, *::before, *::after { box-sizing: border-box; }
html { background: var(--bg); }

body {
  margin: 0;
  padding: 0;
  font: 16px/1.75 ${UI_FONT};
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  /* Japanese setting: proportional metrics for latin-in-japanese, strict line breaking */
  font-feature-settings: 'palt' 1;
  line-break: strict;
  overflow-wrap: anywhere;
}

/* The sheet. Everything sits on its 12 columns. */
.page {
  max-width: 1128px;
  margin: 0 auto;
  padding: calc(var(--base) * 4) 48px calc(var(--base) * 6);
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: 24px;
}
.page > * { grid-column: 1 / -1; }

/* A section's name sits in the left field; its content in the right one. */
.label {
  grid-column: 1 / 3;
  font-size: 13px;
  line-height: 1.7;
  font-weight: 600;
  letter-spacing: .12em;
  color: var(--dim);
  padding-top: 6px;
}
.field { grid-column: 4 / -1; }

/* Masthead ------------------------------------------------------------- */
.eyebrow {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .16em;
  color: var(--dim);
  margin: 0 0 var(--base);
}
h1 {
  grid-column: 1 / 10;
  font-size: 61px;
  line-height: 1.1;
  letter-spacing: -.035em;
  font-weight: 700;
  margin: 0 0 var(--base);
}
.stand {
  grid-column: 1 / 7;
  font-size: 20px;
  line-height: 1.6;
  letter-spacing: -.01em;
  color: var(--sub);
  margin: 0 0 calc(var(--base) * 3);
}

/* The one figure the page leads with ------------------------------------ */
.hero {
  display: grid;
  grid-template-columns: subgrid;
  grid-template-rows: auto auto auto;
  padding-bottom: calc(var(--base) * 2);
  border-bottom: 1px solid var(--hair);
}
.hero > div { display: grid; grid-row: 1 / 4; grid-template-rows: subgrid; }
.hero .was { grid-column: 1 / 4; }
.hero .mid { grid-column: 4 / 5; }
.hero .now { grid-column: 5 / 9; }
/* the arrow belongs on the figures' line, not on the caption's */
.hero .mid svg { grid-row: 2; align-self: center; width: 56px; }
.cap {
  display: block;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .16em;
  color: var(--dim);
  margin-bottom: calc(var(--base) / 2);
}
.now .cap { color: var(--now); }
/*
 * A number, when the number is the point. Proportional figures: tabular digits make a large
 * standalone number look loose.
 */
.fig {
  display: block;
  align-self: end;
  font-size: 76px;
  line-height: .92;
  font-weight: 700;
  letter-spacing: -.045em;
}
.was .fig { color: var(--dim); }
.now .fig { color: var(--now); }

/*
 * The same slot, carrying words instead.
 *
 * **Most changes have no number worth showing.** Forced into one anyway, a page leads with a
 * count nobody asked about — "1 → 3 dialects" — and spends its largest type saying the least
 * interesting true thing about the work. A short phrase does the job a figure cannot.
 * It stays in ink: the accent belongs to the mark, not to text.
 */
.claim {
  display: block;
  align-self: end;
  font-size: 39px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -.025em;
}
.was .claim { color: var(--dim); }
/* words need more room than digits */
.hero:has(.claim) .was { grid-column: 1 / 6; }
.hero:has(.claim) .mid { grid-column: 6 / 7; }
.hero:has(.claim) .now { grid-column: 7 / -1; }

/* Or the lead is simply a drawing. */
.hero > svg { grid-column: 1 / -1; grid-row: 1 / 4; }
.unit { display: block; font-size: 16px; color: var(--sub); margin-top: calc(var(--base) / 2); }

/* Sections -------------------------------------------------------------- */
.sec { display: grid; grid-template-columns: subgrid; margin-top: calc(var(--base) * 3); }
.lead {
  font-size: 25px;
  line-height: 1.45;
  letter-spacing: -.02em;
  font-weight: 600;
  margin: 0 0 calc(var(--base) * 1.5);
}
.note { font-size: 16px; line-height: 1.75; color: var(--sub); margin: 0; }

svg { display: block; width: 100%; height: auto; }
svg text { fill: var(--ink); font-family: inherit; }

/*
 * Things abreast, on the same column lines as everything else.
 *
 * Three to a row, and **any number of them**: a fourth starts the next row rather than being
 * refused. Positions were pinned to the first three for a while, so a page with more to say had
 * its fourth land wherever the browser felt like putting it.
 */
.three {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 4 / -1;
  row-gap: calc(var(--base) * 1.5);
}
.three > figure {
  margin: 0;
  border-top: 2px solid var(--rule);
  padding-top: calc(var(--base) / 2);
}
/*
 * Positioned per row rather than left to auto-flow: inside a subgrid, an item that does not fit
 * the remaining tracks is placed in an implicit column **outside the field**, which puts it in
 * the page's left margin. That actually happened to the third card below.
 */
.three > figure:nth-of-type(3n+1) { grid-column: 1 / 4; }
.three > figure:nth-of-type(3n+2) { grid-column: 4 / 7; }
.three > figure:nth-of-type(3n)   { grid-column: 7 / 10; }
.three h3 {
  font-size: 20px;
  line-height: 1.4;
  letter-spacing: -.01em;
  font-weight: 600;
  margin: var(--base) 0 calc(var(--base) / 4);
}
.three p { font-size: 13px; line-height: 1.75; color: var(--sub); margin: 0; }

/* Figures that are a number --------------------------------------------- */
/* Two to a row, and any number of them. */
.holds {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 4 / -1;
  row-gap: 24px;
}
.hold {
  background: var(--card);
  border-radius: 8px;
  padding: var(--base);
}
.hold:nth-of-type(odd)  { grid-column: 1 / 5; }
.hold:nth-of-type(even) { grid-column: 5 / 9; }
.hold b {
  display: block;
  font-size: 49px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -.04em;
  color: var(--now);
}
.hold span { display: block; margin-top: calc(var(--base) / 2); font-size: 13px; line-height: 1.75; color: var(--sub); }

/* Something the reader would be wrong to assume still holds -------------- */
.caveat {
  grid-column: 4 / -1;
  margin: var(--base) 0 0;
  padding-left: 20px;
  border-left: 2px solid var(--warn);
  font-size: 13px;
  line-height: 1.75;
  color: var(--sub);
}

code, .mono {
  font-family: ${MONO_FONT};
  font-size: .86em;
  background: var(--inset);
  border: 1px solid var(--hair);
  border-radius: 4px;
  padding: 1px 5px;
}

@media (max-width: 720px) {
  .page { padding: calc(var(--base) * 2) 24px calc(var(--base) * 4); column-gap: 16px; }
  h1 { grid-column: 1 / -1; font-size: 39px; }
  .stand, .label, .field, .three, .holds, .caveat { grid-column: 1 / -1; }
  .three > figure, .hold { grid-column: 1 / -1 !important; }
  .hero > div { grid-column: 1 / -1 !important; }
  .hero .mid { display: none; }
}
`
}
