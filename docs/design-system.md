# @design-system/react

An MUI-based design system. A UI kit that **holds no domain**.

Only things whose meaning does not change across apps belong here.
Bringing in app-specific words like "Needs review" or "priority" would let the
design system dictate the app's vocabulary, and every new word would mean
another design-system change.

## Usage

```tsx
import { ThemeProvider } from '@design-system/react'

<ThemeProvider colorScheme={settings.theme}>{/* 'dark' | 'light' | 'system' */}
  <App />
</ThemeProvider>
```

### Density — a surface for the mouse, a surface for the finger

The axis that carries the same design onto both. **The information design does not
change with the device; the dimensions do.** A mouse can point at 1px; a finger cannot.

```tsx
<ThemeProvider density="comfortable">  {/* default is 'compact' */}
```

| | `compact` | `comfortable` |
|---|---|---|
| Who touches it | mouse and keyboard | fingers |
| Body text (`fontSize.md`) | 13px | 17px |
| Button height (`density.control.sm`) | 26px | 44px |
| List row (`density.row.xl`) | 30px | 56px |
| Icon (`iconSize.md`) | 16px | 22px |

**Step names and meanings are the same in both.** Screens write only the step
name (`theme.density.control.sm`) and never learn the actual size. Do not branch
on `theme.densityMode` — a branch always ends up fixed on one side only.

Wrap hover rules in `canHover`. **Fingers have no hover** — it triggers the moment
you touch and lingers after you lift (something not being pressed keeps looking
pressed). The tactile response to a press is `:active`.

To add an app's domain colors, **layer** `createTheme`.

```tsx
import { createTheme, type ColorScheme } from '@design-system/react'

export function buildTheme(scheme: ColorScheme) {
  const base = createTheme({ colorScheme: scheme })
  return createTheme(
    { colorScheme: scheme },
    { palette: { app: { status: { review: base.palette.accents.amber } } } }
  )
}

<ThemeProvider colorScheme={pref} buildTheme={buildTheme}>…</ThemeProvider>
```

## Tokens

The source of truth for values is [`src/theme/tokens.ts`](../packages/design-system/src/theme/tokens.ts).
Whatever MUI already has (`palette` / `typography` / `spacing` / `shape` /
`transitions`) goes there; extend **only concepts MUI lacks**.

| Addition | Contents |
|---|---|
| `palette.surface` | Surface hierarchy. Back to front: `canvas` → `subtle` → `default` → `raised` (+ `hover` / `selected` / `overlay`) |
| `palette.border` | `subtle` (surface boundaries) / `strong` (input outlines) |
| `palette.accents` | Named colors (blue / green / amber / red / violet / slate). **Raw material the app assigns to its domain** |
| `palette.syntax` | Syntax colors. Named colors assigned to telling code apart (no new colors added) |
| `palette.text.tertiary` `.inverse` | Two levels MUI lacks |
| `typography.fontFamilyMono` | Monospace typeface |
| `density.row` `.control` | Row and control heights |
| `radius` / `iconSize` / `measure` | Corner radius, three icon sizes, max line length for body text |

The type scale rides on MUI's variants (`caption` 11 / `body2` 12 / `body1` 13 /
`subtitle2` 14 / `h6` 17). Do not add new variants.

## Components

Directories follow MUI's classification.

| Category | Main items |
|---|---|
| `inputs/` | Button, IconButton, LinkButton, Field, TextInput, NumberInput, TextArea, Select, Checkbox, Switch, RadioField, SegmentedControl, InlineInput, PlainInput, AutoTextArea, SearchInput, InlineAddRow, the Composer set, RepeatableList, SwatchGroup |
| `data-display/` | Text, Paragraph, Code, CodeBlock, SourceBlock, Markdown, Diagram, Kbd, KeyCap, Chip, Badge, Counter, Dot, StatusIndicator, Gauge, ProgressBar, DescriptionList, DataList, the DataTable set, the ItemList set, Tooltip, Divider |
| `feedback/` | Alert, Quote, HintList, EmptyState, Spinner, Skeleton, ToastStack, LinearProgress, ActivityStatus |
| `surfaces/` | Menu, Popover, Card, Dialog, the Disclosure set, the CommandDialog set, SearchPicker |
| `navigation/` | SideNav, NavItem, NavSection, NavHeading, MenuNav, MenuNavItem, Tabs, ContentTabs / ContentTabPanel (per-tab onClose), StatusBarItem, PillButton, StatusBarNotice |
| `layout/` | the AppShell set (the main surface and its footer are AppShellMain), GlassPanel / GlassPanelDivider, the Panel set, the ToolPanel set, ScrollArea, Toolbar, Resizer, CollapseHandle, Page, Section, ListFrame, Row, Column, Spacer |
| `utils/` | VisuallyHidden, Truncate |

## Choosing a switcher

- Show one piece of content: `ContentTabs` + `ContentTabPanel`. For switching documents use `appearance="document"`.
- Pick from many candidates: `SearchPicker`. Searchable by name and supporting info; after selection, focus returns to the entry point.
- Form dropdowns use `Select`, which opens the same searchable picker. Pass an accessible label; empty values, groups, and disabled candidates keep their meaning. `SearchPicker` also accepts an array of current values for filters that toggle one choice per opening.
- Pick among a few values: `SegmentedControl`. Holds radio selection state; owns no content surface.
- Open and close several surfaces: `ActivityBar`. Simultaneous display is allowed, so do not make it exclusive tabs.
- Execute on the spot: `Button` / `IconButton`.

Pass the same `useId()` and values to `ContentTabs` and each `ContentTabPanel`.
Place a panel per enabled tab and pass the selected value to `activeValue`. Hidden
panels keep their children alive and leave the reading and focus order. Fetching
and the lifetime of native surfaces are the app's decision.
Selection moves with arrows and Home / End, skipping disabled items. When tabs
overflow, only the tab strip scrolls.

Check dark, light, narrow widths, many tabs, and touch density in
`Patterns/InteractionQuality`. `Layout/Workbench` checks simultaneous surfaces;
`Layout/GlassPanel` checks the material and collapsing.

## Markdown and diagrams

Conversation content (Markdown, code, diagrams) is **left to the upstream
implementations**. The corners of the notation (nested lists, reference links,
footnotes, code inside tables, per-language grammar) are finely specified, and a
home-grown approximation will inevitably lie somewhere.

| What | Delegated to | What this package owns |
|---|---|---|
| Interpreting the notation | `react-markdown` + `remark-gfm` + `remark-breaks` | Element mapping (`Markdown.tsx`), spacing, hierarchy |
| Code grammar | `shiki` (the same TextMate grammars as VS Code) | Colors (`markdown/shikiTheme.ts`) and language detection (`language.ts`) |
| Diagrams | `mermaid` | Palette variables and spacing (`markdown/diagram.ts`) |

Decisions:

- **Never render raw HTML.** Keep react-markdown's default (no `rehype-raw`).
  Strings arriving in a conversation are treated as written by someone else
- **Only link destinations that can be opened** (`markdown/url.ts`). `javascript:` and relative paths stay as text
- **Local paths are opt-in.** `Markdown.onOpenPath` links absolute and `~/` paths
  in prose, inline code, and Markdown links. The callback receives an encoded
  destination; filesystem access and native opening belong to the host.
- **Never fetch images.** Show only what they point at
- **Add no colors.** Code uses `palette.syntax`; diagrams pass Theme tokens into
  mermaid's theme variables (a stock theme would make that one spot look like another app)
- **Use the JavaScript grammar engine** (`shiki` defaults to WebAssembly).
  The page CSP is `script-src 'self'`, so WASM cannot be assembled.
  `tests/markdownCode.test.ts` cross-checks that results match the upstream engine
- **Load mermaid and grammars only when needed** (dynamic import). A conversation with no diagrams or code loads neither

## Storybook

```sh
npm run storybook          # http://localhost:6006
npm run build-storybook
```

Stories sit next to their components (`Button.stories.tsx` next to `Button.tsx`).
Switch the color scheme in the toolbar. Tokens with different light and dark
values tend to get checked on one side and called done, so keep the switch at hand.

## Rules

- **No domain words.** If you need names for states or classifications, that is the app's job
- **Values come from tokens.** No raw colors or px inside components
- **No bundled icons.** Symbols come in via props (do not lock in an icon library)
- When something is missing, add it here instead of adjusting on the screen
- **Call sites own no display rules.** Composing with your own React components is allowed.
  Instead of adding decoration with `sx` / `style` / `styled`, feed the reason for the gap back and add parts or purpose props.
  Even when Theme values are used, reimplementing how inputs, buttons, or rows are drawn duplicates display rules.
- Specify spacing in compositions by name, like `Row gap="md"`. For purpose-specific
  column dimensions use `@design-system/react/layout-spec`, which contains no React; do not define actual sizes on screens.
- **Lists go in the container (`ListFrame`).** Add/remove actions live in the band at
  its bottom edge; do not float buttons outside the list (their placement drifts per screen)

## Checking the boundary with apps

Acceptances, exclusions, and their reasons are recorded in [design-system-feedback.md](design-system-feedback.md).
`npm run check:architecture` also checks call sites for smuggled-in display rules.
Separate the device-specific **assembly** of screens from the **look** of generic
parts; the latter is owned here.

`npm run typecheck -w @design-system/react` type-checks the package on its own.
`npm run check:architecture` forbids dependencies from this package on Quuu's
domain, contracts, or apps. Adding a Quuu package as a peer dependency still fails the check.

The editor's explorer surface, body, overlaid search field, and input form are
`layout/EditorWorkspace.tsx`. It takes the meaning of operations via props and
children, and holds no Git / IPC / app state.


### APIs that keep call sites from choosing dimensions

- Panes use `Resizer profile="navigation | collection | inspector"`. The initial
  width is `paneProfiles[profile].initial`; a saved width comes back through
  `restorePaneWidth(profile, saved)`. Store `PaneWidth` as-is; do not fabricate
  initial values from numbers or type assertions.
- Action bands use `Toolbar placement="inline | panel | section"`. pad / padX / padY are not accepted.
- Attribute lists use `DescriptionList labels="standard | short"`. The label column's actual width is not passed.
- Details belonging to history use `DataList placement="history"`. They align with the related rows.
- Notifications use `ToastStack placement="aboveFooter"` to avoid the bottom band. Do not copy the band height.
- The initial distribution of vertically stacked surfaces is `paneWeights.standard / primary`. A saved distribution is treated as data.

Removed adjustment knobs are rejected by the check even through spreads. Moving a
dimension or a raw color into another variable, expression, or file does not help —
the check traces back to the original at the call site. Missing purposes go back to [design-system-feedback.md](design-system-feedback.md).

### Opening and closing surfaces

Use `MotionLayout` around adjacent regions and spread `motionRegion(id, edge)` on
existing vessels. Give corresponding full and compact collections the same id.
Use `motionAnchor(id)` on corresponding titles and group labels to carry their
positions across those presentations. Retained regions resize as live, opaque
surfaces; alternate presentations carry their identifiers while metadata changes.
`GlassPanel` follows the collection's moving boundary. Entering and exiting
surfaces are clipped to their own areas, so they never paint over adjacent navigation.
Change `motionKey` only when surfaces open, close, or reorder; `contextKey` makes
explicit section navigation immediate. Nest a layout when its panes move independently.
No timing, easing, CSS, or dimension adjustments belong at call sites. Direct resizing,
tab selection, and live content updates keep their key and remain immediate.

Use `Reveal open={open}` for inline details. Keep the children inside the component
while closing so it can finish the exit; it handles mounting, inertness, and reduced
motion. `Layout/Motion` is the interactive reference.

Action disclosures use `TranscriptToolEntry` around their summary and reveal,
with `TranscriptToolDetail` containing labeled `TranscriptCode` sections. These
share one surface and reading width. `SourceBlock appearance="embedded"` is the
generic code surface for an existing container; its `label` identifies both
highlighted input and plain output. Labels belong to the caller.

Use `ConversationFeed` for complete blocks that arrive in batches. Pass a data
`revision`, a navigation `contextKey`, and the app's `follow` / `active` state.
Mark body blocks with `conversationBlock(id)` so both new blocks and merged prose
can be revealed. The feed owns arrival scrolling and ignores its intermediate
scroll events; `onScroll` continues to report reader movement. History anchoring
and paging remain in the app. `Layout/Conversation Feed` exercises arrival sizes
and updates faster than the animation. No timing or CSS belongs at call sites.
