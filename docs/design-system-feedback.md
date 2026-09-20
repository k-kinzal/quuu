# Call-site feedback and decisions

## 2026-09-20 Local paths in Markdown

- Request: a folder named in a response needs to open from the conversation.
- Accepted: `Markdown.onOpenPath` opts into links for absolute and home-relative
  paths in prose, inline code, and Markdown destinations. Existing link appearance
  applies; the remark tree preserves code fences, commands, and existing links.
- Excluded: resolving the home directory, checking the filesystem, choosing Finder,
  and reporting unavailable paths belong to the Mac main process. The iPhone does
  not opt into local path detection.
- Verification: Markdown rendering and opener regression tests, the Local Paths
  story, and the Mac fixture conversation with a temporary output directory.

## 2026-09-15 Ambient light back on the compositor, window glass without an in-page blur

- Request: since the ambient lights were sampled on a 200ms clock the Mac window
  shimmers, and the faint colour reads as visible shapes at moments.
- Finding: at 3.5% the field resolves to a handful of colour levels, so each light is
  drawn as wide one-level bands. A step of a few pixels flips every pixel along every
  band edge in the same frame; measured on the real window as 80k–170k pixels changing in
  lockstep five times a second. Per-frame compositor motion moves the same edges by a
  fraction of a pixel, spread over time, which reads as drift.
- Accepted: `AmbientGradient` leaves its animations to the stylesheet and the compositor
  again. `useSampledAnimations` stays for the activity sweep only, documented as such.
- Accepted: a translucent theme sets `--ds-window-glass-filter: none`, and `glassMaterial`
  reads it. In a translucent window nothing in the page lies behind the shell, so its
  blur only re-blurred an unpainted ground; measured pixel-identical with it off, while it
  cost a full-window pass on every frame (about 60% of the ambient frame's GPU time).
  Storybook does not set `translucent`, so its glass stories keep their blur.
- Verification: `ambientGradient` and `windowGlass` tests; Mac fixture window measured
  at 60fps with the lights running and one fewer render pass per frame.

## 2026-09-10 Unified expanded transcript details

- Request: expanded actions have a full-width summary above separately indented
  code and output cards, making one operation look like unrelated surfaces.
- Accepted: `TranscriptToolEntry` contains the summary and `TranscriptToolDetail`
  on one quiet surface. Embedded `SourceBlock` sections share its width, use a
  single divider between input and result, and accept caller-owned labels even
  for plain output. Images use the same inset. Syntax highlighting, bounded
  scrolling, subdued failures and disclosure motion remain in place.
- Code applies its monospace family after the typography variant so the variant
  cannot replace it with the body font. No indentation or decoration is assigned
  by the application; translated input/result labels stay in the Mac View.
- Verification: `Data Display/Transcript` covers expanded edits, execution,
  reading, failures, long output and comfortable density in both color schemes.
  Mac fixture screens and the conversation recovery test cover real composition.

## 2026-09-10 Continuous window glass

- Request: an opaque header cuts through native window controls when navigation
  collapses. The header and left panels must read as one material with no vertical
  rule through the window band.
- Accepted: `AppShell glass` paints a single film, highlight and blur. Nested
  `GlassPanel` regions retain their ink and lower edges without layering another
  film. `AppShellMain windowHeader` and `Panel windowHeader` start their opaque
  ground below the common header height. Direct side-panel resizers also start
  below that band, including their pointer targets.
- Verification: `Layout/GlassPanel` covers expanded and collapsed navigation and
  collection panes, patterned and plain backdrops, both color schemes and reduced
  transparency. Mac fixture screens verify the native buttons and main content.

## 2026-09-10 Conversation arrivals

- Request: complete log blocks arrive abruptly and following immediately jumps
  to the bottom. Existing text should move upwards as new content is revealed.
- Accepted: `ConversationFeed` follows a data revision with one 180ms ease-out
  scroll and reveals new blocks or the growing lower edge of an existing block.
  Initial loading settles at the latest position before fading in; long batches
  travel at most one viewport. New revisions retarget from the current position.
- The app identifies blocks with `conversationBlock`, owns following, paging and
  reading anchors, and supplies a context key for immediate navigation. Timing,
  clipping and suppression of the feed's own intermediate scroll events stay here.
  Reading history and explicit navigation do not animate. User input interrupts
  motion, and the OS reduced-motion preference finishes it immediately.
- Verification: `Layout/Conversation Feed` covers appended and merged prose,
  first loading, long blocks and bursts. Real Mac fixtures and regression tests
  cover following, interruption, context changes, history and cleanup.
- References: [React commit snapshots](https://react.dev/reference/react/Component#getsnapshotbeforeupdate),
  [scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_anchoring/Overview),
  [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).

## 2026-09-10 Subdued transcript colors

- Request: action labels and error output in task conversations compete with the
  main message; their placement and size already work well.
- Accepted: transcript accents retain 35% of their semantic color, mixed in OKLab
  with tertiary text. The same rule covers action labels, failed targets, failure
  marks, error summaries, and expanded error output. Body text and dimensions stay
  at their existing rank; application status colors retain their meaning.
- Verification: `Data Display/Transcript` shows body text beside neutral, accent,
  success, pending, and failed rows, with expandable output in both color schemes.

## 2026-09-10 Quiet dotted loading marks

- Request: replace conventional rotating loading icons with slower dot motion,
  using https://www.aicss.dev/components/orbs as a visual reference.
- Accepted: eight fixed dots carry a soft opacity wave over 3.6 seconds. The same
  geometry serves status marks, loading feedback, and button loading slots, scaled
  by density. No rotation, displacement, or new colors are needed.
- Reduced motion and forced colors keep a static dotted mark. Accessible status
  labels remain on their owners, with localized loading names for generic feedback.
- Verification: stories cover dark/light, touch density, loading buttons, and many
  simultaneous marks. Check real fixture screens and accessibility regressions.

2026-09-09: File trees need change state without a trailing mark taking label space.
Accepted `TreeNode.tone` for a subdued full-row tint, preserved on hover and selection;
selection keeps an inset rule and keyboard focus keeps an outline. `description` carries
an accessible explanation. Git status, translated copy, and descendant aggregation stay
in the Mac display model and UI. `Data Display/TreeView` covers nested rows and both densities.

2026-09-06. A record of surveying Mac and iPhone call sites and pulling display
rules back here. "Reason" is inferred from the original comments and usage, not
confirmed with the original author.
Declaring and composing custom React components is allowed. The Design System owns the rules of appearance.

| Original location | Inferred reason the custom implementation arose | Decision and where it was accepted |
|---|---|---|
| 52px indent and 280px cap in Mac `SessionTurn` | No API aligned the action label column with expanded code | Accepted. `TranscriptCode` and `TranscriptToolVerb` use the same dimension source. String truncation decisions and result fetching stay in the app |
| 12px, faint text in Mac `SessionTurn` / `MessageBody` | Supplementary Markdown could only be shown at the same rank as body text | Accepted. `Markdown.subdued`. Uses the Theme's body2 and tertiary, and tracks density |
| The lock's -2px / 5px in Mac `TaskOverview`, symbols in `TaskSidebar` | No alignment rule existed for symbols placed beside text | Accepted. `InlineMarker`. Choose a purpose; do not correct positions on the screen |
| span and padding in Mac `TaskQuickAdd` | No container placed a non-interactive marker in the same row as buttons | Accepted. `MarkerSlot`. Whether it can be selected stays in the app |
| The "jump to latest" button in Mac `ui/panes` | The DS had no action floating inside a scroll area | Accepted. `FloatingAction` and `ConversationViewport`. Display conditions and scroll target stay in the app |
| The conversation / attribute / history sections in Mac `ui/panes` | Surfaces holding dedicated information were read as having dedicated decoration too | Accepted. The `ConversationLayout` container and `DetailFixed` / `DetailScroll` / `DetailGroup`. Which surfaces to arrange is assembled by the app |
| Priority and reservation quotes in Mac `ui/panes` | Assignment to semantic colors was implemented together with the glyph style and faint background | Display accepted. `NumericLabel` and `Quotation`. The meaning of priority and status is excluded and passed in from app wrappers |
| Rows, columns, selection, hover in Mac `ui/runs` | No pairing of short and long columns existed for comparing history | Accepted. `HistoryList`. Unifies rendering of date-time, result, and duration; holds no run status |
| Utterances, bundle headings, thinking, and tool rows in Mac `ui/session` | The presentation of conversation logs was considered product-specific | Accepted. `Transcript`. Speakers, collapsible asides, and operation results are display any product can use. CLI names, fetching, and execution are excluded |
| Image dimensions in Mac `SessionImages` and `ui/session` | Screens computed display dimensions to reserve space before load and for expansion | Accepted. `TranscriptImageFrame.ratio`. The DS computes display size. The source image's aspect ratio, lazy fetching, and fetch failures stay in the app |
| Change and CI marks in Mac `ui/workbench` | Choosing the domain shape and drawing with CSS were not separated | Drawing accepted. `ColorMark` / `IconMark`. The mapping change kind → color/shape and CI → icon/label stays in the app |
| Spacing in Mac `Chat` / `Composer` / `PendingTurn` and each iPhone view | APIs to space body, asides, and actions were missing | Accepted. `ContentInset` / `ContentBlock` / `ActionRow` / `GroupCaption` / `ContentEnd`. Pass a purpose, not an arbitrary CSS value |
| Scrolling in Mac `Inspector` / `SettingsShell` | Panel lacked options for overflowing content | Accepted. `Panel.scroll`. The look of scrolling is closed inside the DS |
| 0.8 / 0.75 in Mac `Inspector` / `TaskSidebar` | The visual strength of numbers was tuned per screen | Accepted. Unified into `SupportingText`. Where color alone suffices, use the existing `Text.tone` |
| The 40% in Mac `CommandPalette` / `StringListEditor` | The split between the flexible main item and the auxiliary column was decided per screen | Accepted. `SecondaryLabel` and `ValueColumn`. Text content and input updates stay in the app |
| Column widths in Mac `model/table`, the settings tables, and at list tails | Table column definitions held both meaning and dimensions | Dimensions accepted. `columnProfiles` / `tableMetrics` in the React-free `layout-spec`. The app selects a column purpose. User-saved widths and reordering are excluded |
| Auto-growing in Mac `Composer` / `TaskComposer` / `EditableBody` | DOM height and its cap were updated outside the input component | Accepted. Pass a purpose to `resizeInput`. IME, the meaning of send, and saving stay in the app |
| iPhone `Composer` | No short mobile send field existed, so a stand-in for the Mac Composer was hand-rolled | Accepted. `CompactComposer`. Owns the borderless body, send button, growth, and disabling when empty; the text, destination, and send icon are props |
| iPhone `Field` | Needed to avoid doubled borders and iOS zooming in on small text | Accepted. `SurfaceTextLine` / `SurfaceTextArea`. Delegates the border to the parent surface and takes body size from density |
| iPhone `ScopeButton` | A small touch control that names the current selection was missing | Accepted. `ActionPill`. The options, opening the selection surface, and the arrow stay in the app |
| Custom buttons and notification badge in iPhone `TabBar` | There was no bottom navigation, nor a count overlaid on a symbol | Accepted. `BottomNavigation` / `NotificationBadge`. Unifies the digit cap, spacing, and colors. Tab destinations and icon choice stay in the app |
| iPhone `Screen` / `GroupedList` | The convention to separate per-device screen assembly was read as separating decoration too | Generic containers accepted. `ScreenFrame` / `SafeHeader` / `SafeFooter` / `TitleBand` / `InsetGroup`. Screen layout and destinations continue to be composed in the app |
| iPhone `NavStack` | No component provided surface transitions and the back gesture | Accepted. `NavigationTransition`. Holds no destinations; owns lifetime, motion, parallax, shadow, and back-gesture detection |
| iPhone `SwipeRow` | The swipe-a-row-to-act pattern was missing | Accepted. `SwipeActions`. Owns width, motion, and finger detection; the actions chosen from state, and semantic colors, stay in the app |
| iPhone `Sheet` | No finger-friendly selection surface with its opening motion existed | Accepted. `SelectionSheet`. Takes options, the meaning of selected, icons, and translated labels. Leaves backdrop isolation and focus restoration to MUI Modal, and limits rapid taps to one result at a time |
| iPhone `UpdateBar` | No thin progress shape existed that does not push the nav down | Accepted. `EdgeProgress`. The iCloud-update meaning and the placement stay in the app |
| Numeric gap at call sites / Dot's 8px | The public API itself accepted free dimensions | Call-site compositions migrated to named spacing and `Dot.emphasis`. Arbitrary numbers are rejected by the check |
| DS `Text` not tracking density | Type-scale values were taken from the fixed compact table | Fixed as a DS defect. The Theme's typography is the source of truth; a test asserts body text and inputs match across both densities |

## What is not accepted

- Task status, priority, whether an action is allowed, Git/CI meaning, execution targets, and send/fetch/save are the app's responsibility.
  Assigning semantic colors to `theme.palette.quuu` and passing them into the DS's `color` / `shape` / `tone` is allowed.
- A project's saved colors are user data. Fixture colors are not a new UI palette either.
- Image natural sizes, the OS window region, measured bounds of native BrowserViews, and the user's resize results are data.
  Display rules for initial values, minimums, and caps belong to the DS.
- `IntersectionObserver.rootMargin` is fetch look-ahead and heading intersection detection, not rendered spacing.
- Bare `div` / `span` / `section` without decoration is allowed for structure and event boundaries.
  Not for controls, stylesheets, or overriding appearance.

## Checks that prevent recurrence

`npm run check:architecture` scans all call-site sources (Mac renderer, mobile).
It rejects `sx` / `style` / `css` / `className`, implementation imports from MUI / Emotion,
stylesheets, bare controls, numeric dimension props, and DOM style mutation.
Aliased imports, re-exports, object spreads, and DOM-attribute routes are tested too.
Beyond Theme type extensions, there are no per-file exclusions and no allowlists for existing violations.

This is a check of syntactic entry points, not a proof against every indirect way of generating CSS.
Every new display requirement is closed the same way as this table: reason for the gap → accept/exclude → component and call site → visual check.
Renames to get past the check, and generic props that accept CSS objects, are not accepted.

## 2026-09-06 re-audit — dimension tweaks left in component props

Deleting custom CSS alone still leaves paths that pass literal numbers to DS
components. The reasons below are inferred from usage and component APIs.
Do not replace all of this with a ban on custom React components.

| Location | Inferred reason it became necessary | Decision and where accepted | What stays at the call site |
|---|---|---|---|
| 208 / 268 / 300 in Mac `state/store` | The saved width and the initial display convention were treated as the same Layout | Initial widths accepted. navigation / collection / inspector in `layout-spec.paneProfiles`. The `PaneWidth` type rejects arbitrary numeric assignment | Pane-to-purpose mapping, save/restore, open/close |
| 176–300 / 220–420 in Mac `App` | Resizer required min/max, making the app decide | Limits accepted. `Resizer.profile` uses the same purpose definitions as the initial widths. The min/max knobs are removed | Saved widths and resize results. `restorePaneWidth` fits them to the current convention |
| 260–480 in Mac `TaskWorkbench` | Keeping the attribute surface readable was treated as the screen's job | Limits accepted. Merged into the inspector purpose above. Growing from the right remains the existing invert | Surface contents, placement, open/close |
| padX=4 / padY=1.5 in Mac `TaskFilterBar` | No purpose existed for aligning with the heading's sides while narrowing only the band's top and bottom | Accepted. `Toolbar.placement="panel"`. pad / padX / padY are removed; choose among the inline / panel / section purposes | Filter items and actions |
| termWidth=64 in two places in Mac `CommitIdentity` | In settings with short attribute names, the default label column was judged too wide | Accepted. `DescriptionList.labels="short"`. The DS owns the standard / short label columns; termWidth is removed | Attribute names and values. The GitHub identity does not go into the DS |
| indent=52 in Mac `RunHistory` | No purpose existed for aligning an opened detail to its related row, so the row's dimension was copied | Accepted. `DataList.placement="history"`. Uses the same indent source as `HistoryChain`; indent is removed | Which history to expand, the detail contents |
| offset=32 in Mac `Toasts` | The call site duplicated the band height so toasts would not overlap the status bar | Accepted. `ToastStack.placement="aboveFooter"`. Shares `AppShellFooter` and `shellMetrics.footerHeight`; offset is removed | Toast content, what to show, actions after pressing |

A further scan also found the 1 / 2 initial area ratio in `interaction/workbench`.
Presumably the saved distribution and the initial distribution were treated as the
same Record; the initial distribution is accepted. It goes back to
`layout-spec.paneWeights.standard / primary`, and the default of the DS's
`WorkbenchPane` uses the same source. Which surface is primary, and the user's
ratio changes and their persistence, stay in the app.

### Exclusions, reconfirmed

- Composition via custom React components, and choosing existing tone / shape / named spacing, are allowed.
- Project colors, image natural sizes, OS regions, and user-saved widths are input data.
  Do not extend that exclusion to the judgment of initial values and bounds.
- NumberInput's min/max/step constrain business values. Do not treat them the same as Resizer's identically named props.
- Body `rows` and item `lines` choose how many lines of content to show. Line heights and px definitions are owned by the DS.
- Fetch look-ahead, virtualization counts, scroll-following decisions, and limits on string content are distinguished from rendered spacing.

### Hardened checks

Removed knobs are rejected even when the value is not a literal. For dimension
props passed as variables, expressions, or spreads, the check follows TypeScript
symbols to the numeric original at the call site. Aliased imports, other files,
re-exports, and destructuring are covered by regression tests. Routes that move a
raw semantic color into a variable are rejected too.
The saved-width type is the DS-generated `PaneWidth`, so a change reverting the
store's initial value to a number fails type checking.
Passing the check alone is not proof of separated responsibilities; new props require the same accept/exclude judgment.

## 2026-09-06 A single translucent side panel

The nav and the companion list each had their own film, blur, and full-height
rule, so the same left menu looked like two different materials, and the collapsed
state's line ran into the window's three buttons. The footer also cut across under the left menu.

- Accepted: `GlassPanel` owns a single thin film and blur. `GlassPanelDivider` places the line and the resize hit area starting below the top band.
- Accepted: `surface="transparent"` on surfaces and `bordered={false}` on `SideNav` / `CollapseHandle`. These are purposes that delegate to the parent's material and boundary; they accept no free CSS values.
- Accepted: `AppShellMain` wraps the main surface and its footer. The narrow footer's gauges can be reached through `StatusBarOverflow`; the switching action stays outside.
- Excluded: which screens go in the left menu, its open/close state, and task operations are composed by the Mac's `LeftMenu`.
- Visual check: `Layout/GlassPanel` expanded, nav collapsed, both collapsed; on the Mac fixture, both color schemes and each open/close state.

### Follow-up feedback: the material difference is too weak

- Request: without changing the overall design, make the left side read as a different material from the main area.
- Accepted: adjust the film to dark 0.18 / light 0.24, add a 40px in-page blur, a faint surface highlight, and outer-edge shading. The decoration is owned by the single container, and no vertical edge is drawn in the top 40px.
- Accepted: apply `glassText` only to the panel's children. Keeps supporting text from sinking when stronger transparency shifts the background luminance.
- The Mac side's responsibility: set the desktop-blurring material to `menu` and the effect state to `active`. OS drawing settings do not come into the DS.
- Visual check: besides the story that blurs a pattern, use `PlainBackdrop` to see the surface difference survive on a flat background. The CSS blur and the OS behind-window effect are verified separately.

## 2026-09-06 Control quality and optical adjustment

[AI CSS](https://www.aicss.dev/) served as a quality reference for thinking through
component states and combinations, and [this explanation of optical adjustment](https://postd.cc/optical-adjustment/)
as a reference for judging the optical weight of glyphs and shapes.
Component appearances were not ported; the existing dimensions and colors — glass
on the left, opaque surface on the right — remained the source of truth.

### Stage 1: component rules

| Gap | Acceptance and owner |
|---|---|
| Text size and band differing per heading | `PanelHeading` and `headerBandHeight`. Unifies the 40px axis, the 1px optical correction of the glyphs, and rules drawn on the inside |
| Buttons switching content, with no tab-to-content association | MUI-based `ContentTabs` / `ContentTabPanel`. Owns arrows, Home/End, disabled items, the underline, long labels, horizontal scrolling, and screen-reader support |
| Hover on a selected item washing out the selection | `NavItem` / `MenuNavItem` / `ItemRow` / `ActivityBar`. Unifies the coexistence of selection and hover, and the focus outline |
| List selection stuck to the edge, the marker floating between two lines | `ItemList.inset` and `ItemMarker`. Side padding, a short selection marker, correction toward the first line. Weakens the group film |
| Input context, body, and actions at equal strength | The `Composer` set. Sorts out the small context selector, body height, focus frame, and spacing of the send action |
| Short value selection as custom buttons | `SegmentedControl` rebuilt on radio. Keeps strings and numbers; exposes selection and disabled |
| No way to tell that thinking and tool rows can be opened | `Transcript`. Tunes the disclosure marker, hover/focus/expanded states, and utterance spacing |
| Normal / disabled / keyboard rendering differing per component | MUI Button / IconButton focus, disabled, and symbol alignment. Also honors the OS's reduced-motion |

### Stage 2: fixes fed back from the real screen

- With the nav collapsed on the real screen, the heading sat too close to the OS
  buttons. `PanelHeader.startInset` reserves the OS region and then adds the normal
  padding. No correction values are written in the app.
- The tab strip took up slack inside a vertical flex. The strip's height is capped, returning the remainder to the body.
- In the touch-oriented story, controls spilled out of the 40px band. The band and the glass edge follow the same density height.
- Round-tripping on a real device, xterm's auto-focus intercepted the next arrow key.
  `TerminalView` does not steal focus while the hand is on the tab strip, and does
  not focus hidden terminals. The pure-black ground visible around the terminal
  also returns to the existing surface color.
- An empty review does not create panels for nonexistent tabs; it shows the
  pre-selection state. MUI's scroll arrows also get action names, exposing their purpose to screen readers.

Visual checks used Computer Use: Storybook in dark and light, 380px width, many
tabs, comfortable; the fixture's lists and conversations, collapsing, a real-file
review, and multiple terminal tabs.
Regression tests cover tab keyboard operation, panel association, input retention,
radio values, and terminal focus. Whether operations are allowed, data fetching,
Git/CLI meaning, and the left panel's open/close decision remain owned by the app.

## 2026-09-07 Alignment, and continuity from action to response

The previous round of visual fixes alone left two gaps: shared baselines between
adjacent components, and the experience before the log exists.

### Stage 1: accepted components

- `PanelHeading.count`: makes the heading and its count one unit sharing a baseline
  and optical correction. Center-aligning separate line boxes does not line up CJK
  text with small digits.
- `PanelHeaderLead` / `leadingColumn`: give the close action and the `ActivityBar`
  right below it a common width. The vertical rule is drawn on the inside, so
  symbol centers are not pushed out half a pixel.
- `Button`: removed the exception that made only colored buttons bold. The same
  size has the same glyphs and the same border-inclusive height.
  Adjacent row actions share a vertical center and common spacing.
- `SearchPicker`: built on MUI's combobox; owns search, candidate supporting info,
  the current value, zero results, keyboard selection, IME commit, and focus
  restoration. The meaning and order of candidates are the call site's decision.
- `ActivityStatus`: has restrained motion, an announced state, reception freshness,
  and an action leading to diagnostics. Honors reduced-motion.
  Holds no business state and no "it hung" judgment.

### Stage 2: feedback from the real screen

- Measuring the Mac buttons from AppKit gave a 14px diameter and 23px spacing.
  The Mac side updates the OS dimensions, and the rail derives its 42px width from
  the center of the close circle. The DS heading band becomes 42px too, aligning
  the left and right surfaces to the same height. The glass on the left, the opaque
  main surface on the right, and independent collapsing are kept.
- Focusing before the selection surface was laid out never handed focus to the input. Focus after placement is settled.
- Stop keeping a surface with leftover blank space after filtering; shrink to the
  content height. `PopoverPanel` also follows height changes via ResizeObserver,
  keeping a surface opened from the window's bottom edge attached to its entry
  point. To avoid jumping up and down on each keystroke, the opening direction is
  also kept as long as the surface fits on the current side.
- In Storybook, the in-flight ring inherited the disabled dimness and overlapped
  the text. `Button`'s loading is distinguished from the disabled opacity, and the central ring gets a readable color.
- Using RTL for leading path truncation flipped the trailing slash. Candidate
  supporting info gets `unicode-bidi: plaintext` to preserve text direction.
- The Mac side applies the selection component to the two newly added entry points,
  ordering names A–Z with natural number order, then by path for identical names.
- While reading the latest run, follow along to the next run; when a past run is
  selected, stay on it. Waiting before launch, send in progress, run started,
  before the log exists, the reception interval, and completion are shown as one
  continuous sequence. Until the current instruction reaches the log, a sent copy
  is shown; once it arrives, it is not duplicated.
- Quuu's launch record stays in the raw log; the conversation does not show the
  command and the instruction twice. Leftover provisional stdout was detected on
  the real screen, and a change of read source is announced as a full replacement.
  The reception model updates not only the body but also the path, the count, and
  whether history was loaded.
- In the distributed app's long conversations, the import-time summary reappeared
  at the tail as "sent". The copy is limited to runs the app itself sent, and is
  removed once this run's response exists. An instruction that moved into the
  history-loaded range is not re-shown. This goes back to the Mac side as a
  display-model decision.

Verification drives Storybook and the fixture's real screens with Computer Use.
Search, path matching, IME commit, draft retention, double-send prevention while
sending, input retention on rejection, and following the latest run are also
covered by regression tests.
`QUUU_FIXTURE_UX=1 npm run dev:fixture` creates 30 projects and a no-traffic
verification CLI. It waits 12 seconds until the log exists, 18 seconds until the
first response, and another 18 until the next, so the transitions can be
reproduced on the real screen.

## 2026-09-07 Expanded-state axes, and a close action that belongs to its target

- The expanded left nav stacked NavSection and NavItem padding, drifting right of
  the collapsed symbol column. SideNav passes the collapsed width to its children
  and derives item symbol positions from the same center. Project dots sit in the same column.
- The right-side collapse control included the header's normal padding, off-axis
  from the ActivityBar below. Accepted PanelHeader's trailingColumn and
  PanelHeaderTrail; head and tail use the same column width.
- The bottom-left settings row was as tall as padding plus row height, taller than
  the main surface's footer. NavSection.pinned and the footer share footerBandHeight,
  and SideNav's extra bottom padding is removed.
  compact bottoms out at 32px; comfortable widens to the control height. The notice
  placed above references the same height.
  Both draw their top rule on the inside, aligning not just heights but the centers of icons and text.
- The review's close action sat at the far right edge, away from what it closes.
  ContentTabs gains onClose and owns the per-tab button and Delete. No nested
  buttons; the tab name and the close action name are exposed separately.
  Focus returns to the next tab after closing the selected one.
  The app owns disposing the target and choosing the next selection; closing an
  unselected tab keeps the current content.

Computer Use checks Storybook and the real screen: expansion, collapse, the left
and right axes, and opening and closing multiple files. Regression tests cover the
per-tab close action, selection retention, focus after Delete, and releasing the PR view.

## 2026-09-09 Spatial continuity when surfaces open and close

- Request: opening a detail should bring it in from the right while the collection
  joins the navigation material. Collapsing navigation and opening work or inspector
  panes should explain their direction, quickly enough to accept the next action.
- Accepted: `MotionLayout` and `motionRegion` capture named surfaces before React
  changes their layout. Translation and clipped, resizing pictures keep text unscaled.
  Pictures are inert, hidden from accessibility, and removed after 180 ms; the new
  React tree mounts and accepts input immediately. A second layout action cancels
  the previous playback; OS reduced motion also cancels active playback.
- Accepted: `Reveal` delegates inline height expansion to MUI Collapse, with the same
  short duration and reduced-motion preference. Closed content leaves the focus and
  reading order immediately and unmounts after its exit.
- Excluded: the app owns which collection/detail correspond, which edge a pane opens
  from, and when a layout change is requested. Section navigation, tab selection,
  live log updates, and pointer resizing do not start layout transitions.
- Verification: `Layout/Motion` demonstrates navigation, collection/detail, inspector,
  lower pane, disclosure, and immediate tabs. Mac fixture checks cover the actual
  assembled surfaces, repeated actions, and reduced motion. Regression tests protect
  immediate actions, picture cleanup, accessibility, and explicit navigation.

## 2026-09-09 Keep collection identities and navigation boundaries during motion

- Failure observed in Computer Use frames: exiting collection and inspector pictures
  could cross fixed navigation, and retained panes were crossfaded as two copies.
  A full collection and its compact presentation also lost the positions of their titles.
- Accepted: retained regions animate their live dimensions with a constant flex footprint.
  Opening clips travel with the surface edge; exiting pictures move inside a stationary
  viewport bounded by their former area. No pane-wide crossfade is used for resizing.
- Accepted: `motionAnchor` connects corresponding identifiers across a reparented
  presentation. Only one title is painted during that motion, with supporting metadata
  introduced as the title settles. `GlassPanel` carries the collection's moving boundary
  as one material. Screens supply identities, never coordinates or timing.
- Verification: the interactive story includes collection hiding and a fixed tool rail.
  Regression cases cover both clipping directions, retained dimensions, title continuity,
material geometry, cancellation, immediate input, and reduced motion. Computer Use
  records held frames from the fixture app to inspect the intermediate states.

## 2026-09-09 Match composer and destination picking to collection density

- Request: the task-list prompt and its project picker occupied too much space
  compared with the surrounding compact controls.
- Accepted: the composer starts at one input line, with smaller internal spacing,
  bottom inset, and corners. `ComposerOptions` lets context values share the action
  band and wrap within their own space, keeping the submit action reachable.
  Context chips retain their density-scaled height and truncate long names.
- Accepted: SearchPicker uses compact single-line candidates with name and supporting
  information side by side. Names have a bounded share, preserving the path tail
  for duplicate names; the full path remains available through the option title.
  The search field and candidates use control/row tokens, and the panel has a
  smaller preferred width and height cap.
- The Mac task composer assembles its project, agent, conditions, and priority beside
  the add action. Selection, search, and submission remain the existing operations.
- Verification: Composer stories cover inline options, narrow width, and touch
  density; SearchPicker includes long and duplicate names. Inspect the fixture's
  actual task list and destination search in both color schemes, and run the
  existing creation, draft-retention, keyboard, and path-filtering regression suite.

## 2026-09-09 Compact ongoing activity into one readable line

- Request: ongoing execution used too much conversation space for elapsed time,
  response age, and an extra log action. The reader needs to know whether work
  continues. AICSS's Thinking State is the reference for a quiet shimmering label.
- Accepted: `ActivityStatus` now takes only a label, uses one compact row, and
  pairs a small mark with a gentle text shimmer. Both gradient colors come from
  readable text tokens; reduced motion and forced colors use static text.
- The Mac owns startup/running wording and removes the indicator on every terminal
  state. Log silence does not change the process status. Timing subscriptions and
  the duplicate log action leave the conversation; the run history owns log access.
- Verification: ActivityStatus stories cover conversation placement, narrow width,
  Japanese copy, and comfortable density. Regression tests cover startup, silence,
  responses, prompt deduplication, and terminal states without timing or extra actions.

## 2026-09-09 Barely perceptible color across the window

- Request: bright colors should slowly merge and separate across the entire Mac
  window, at only 2–3% alpha, including its translucent material.
- Accepted: `AmbientGradient` owns a transparent viewport overlay, with one 2.5%
  opacity applied after compositing five soft radial gradients. Transform-only
  loops take 120–180 seconds and start at different phases. There is no opaque
  ground, pointer tracking, or application-specific vocabulary.
- The overlay sits outside moving panes and ignores pointer input and accessibility.
  Hidden documents pause it; reduced motion and forced colors remove it.
- The Mac opts in once at the window composition. The Design System owns its
  colors, timing, transparency, and stacking; the iPhone does not opt in.
- Verification: dark, light, and translucent Storybook examples, fixture screens,
  and regression coverage of input access, visibility changes, and cleanup.
- Follow-up (2026-09-10): raise the combined opacity to 10% at the user's request
  to tune perceptibility. Keep the same colors, motion periods, and transparency.
- Further tuning (2026-09-10): settle at 5% after the user tried 10%, keeping
  the glass-like color while making it less visible.
- Further tuning (2026-09-10): reduce the combined opacity to 3.5% at the
  user's request.

## 2026-09-10 Keep prompt settings readable beside multiple actions

- Request: using the same prompt interface in the list and detail revealed that
  a narrow detail pane squeezed project and AI names down to icons when cancel
  and send occupied the action band.
- Accepted: `ComposerToolbar` can wrap, and `ComposerActions` keeps related
  actions together at the trailing edge. The action group moves to another line
  before forcing the settings into the leftover sliver of space.
- The Mac composes one input for creation and follow-ups, with fixed values in
  the same positions as selectable values. No consumer dimensions or styles.
- Verification: editable, fixed, narrow, and constrained Composer stories;
  the fixture app's list, detail, and running view with a narrow window.

## 2026-09-17 Search every single-value dropdown from the keyboard

- Request: form dropdowns and collection filters could only be scanned, while the
  destination picker already supported typing to narrow candidates.
- Accepted: `Select` opens `SearchPicker`, retaining its framed trigger, change
  contract, empty values, group headings, and disabled candidates. The picker
  accepts multiple checked values for filters that toggle one value per opening.
- Search uses MUI's combobox behavior, with case-insensitive substring matching,
  arrow navigation, Enter selection, and focus returned on selection or dismissal.
  An IME conversion never commits a choice. Queries reset on every opening.
- The Mac composes the same picker for list filters, the composer agent, and group
  membership. Labels stay with the app; generic search and empty-result copy comes
  from the English/Japanese Design System string packs.
- Verification: searchable select regression cases, task creation and filter
  integration tests, the Field story, and the actual fixture app screens.
