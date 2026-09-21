# Quuu guide

Usage, configuration, and development details. See [README.md](../README.md) for an
introduction and installation.

## The core rule

**Done is a human privilege.**
Neither the scheduler, nor the agents, nor the error handlers write `done`.
An agent's normal exit reaches no further than `Review`.

```
[Draft] ──queue──> [Queued] ──acquire──> [Running] ──ends normally──> [Review]
                    ↑  ↑                     │                           │
      [Held] ──queue┘  │                     └── Limit / error ──> [Failed]
         ↑             │                                                 │
  remove from queue    └──── send back / auto retry ─────────────────────┘
                                                                         │
                                        human presses Done ──────────────┴──> [Done]
```

**Held** means "the instruction is written, but I don't want it running right now."
It merely leaves the queue, and is kept apart from Draft (still being written).
Only an explicit human action re-queues it; the scheduler never touches it.

## What works

| Feature | Implementation |
|------|------|
| Agent definitions | Command / argument template / environment variables / parallelism / fallback target / Limit detection / timeout |
| Agent groups | Three strategies: definition order, round robin, least busy |
| Project definitions | Directory, priority, concurrency limit, agents / groups to use |
| Conditional acquisition | Project priority → task priority → registration order. The first task satisfying slots, cooldowns, and scheduled times is moved to `Running` in the same transaction that acquires it |
| Limit fallback | Match the output against a regex → cooldown → follow the chain and automatically re-run with another agent (no human is asked). A running agent holds one slot on each agent it could still fall back to, so a Limit — which moves every run on that agent at once — always finds room. A run with no lane free waits instead of starting |
| When a Limit lifts | The moment the CLI printed ("try again at Sep 19th, 2026 7:13 PM", "resets 3pm") is cooled for exactly that long. A limit on **one model** ("You've reached your Fable limit") names no moment because that share is a slice of the account's **weekly** allowance — so it waits for the week to turn, read off the last turn Quuu watched that agent make, plus seven days. Until it has watched one, the configured cooldown is what probes for it |
| Supported agents | Claude Code / Codex / Cursor (`cursor-agent`) / Grok / GitHub Copilot / Antigravity (`agy`) / opencode. Definitions are only added where the command exists (disabled initially). A CLI supported after your database was made is offered once, on the next launch |
| Session log display | Opens the latest 80 messages from a durable index, pages in both directions, and retains at most 240 messages in the view. Log ingestion runs independently of windows; an uncached JSONL log opens from a bounded tail while history is indexed |
| Continued runs | Carries over the same session-id and runs the equivalent of `claude --resume <uuid> -p "<follow-up>"`. When the opener is cooling down, its configured fallback chain can continue on a compatible CLI with resume arguments. Unrelated group members are excluded. If both models hit Limit, the history shows the handoff, for example `Fable → Opus → Limit`, and waits until a candidate returns |
| Unattended operation | The scheduler keeps running with the window closed (lives in the menu bar) |
| Restart tolerance | Agents keep running when the app is killed. On launch it re-adopts them; anything that finished in the meantime is settled from its exit code |
| Crash tolerance | Ghost Runs that cannot be re-adopted are settled so their execution slots are freed |
| Ordering control | "After this task finishes" can be specified. Two kinds: wait for done / wait for the run to end. Cycles are detected and rejected |
| Hold | Takes a queued task off the queue to rest. A condition-free "later, for now"; only an explicit human action brings it back |
| P0 keeps its slot | The top priority pins the project / agent slots to that task. Until it is done, its follow-ups never wait in line behind other tasks |
| Change report | When a task reaches review, a **separate agent writes what changed a level above the code** — which concept became which, which relationship moved, which rule now says something else — as a static HTML page kept in Quuu's data area. Each report covers the **whole task from its first request to its latest result**, including follow-ups and agent fallbacks. The writer receives the original request, every run's conversation and output log references, and a fresh comparison from the task's starting tree through the report's ending tree (including uncommitted work). Missing evidence must be stated. Read from the task's Report surface. A task that reaches review again gets a new report only when the worktree changed since the last one; this controls when to regenerate, not the report's scope. "Write again" on the surface always writes |
| GitHub identity | Beyond commit author / committer, `git push` and `gh` (PR creation etc.) are also aligned to the GitHub App's bot identity. The app-wide default can be turned off per project or pointed at a different App |
| GitHub App setup | Available from "Set up GitHub App" in Settings (click → follow the browser flow to approve → the identity fills in). When the required permissions change, "Update GitHub App" replaces it through the same flow — no copying values by hand |
| Automation | Definitions that queue a task when conditions line up: "when the queue is free", "past a cron time", "when nothing unfinished remains". Any number per project |
| External session import | Detects directly launched Claude Code / Codex / Cursor / Grok / Copilot / Antigravity / opencode sessions and syncs them as projects and tasks. Running ones become Running; stopped ones become Done |
| Continue in the terminal | Reopens a finished session in the terminal, **still interactive** (the equivalent of `claude --resume <id>`). Can also just open the working directory |
| Open in an IDE / editor | Opens the working directory in JetBrains / Xcode / VS Code and so on. Which app to use is chosen per project (Xcode is handed the `.xcworkspace` / `.xcodeproj`) |
| View and queue from iPhone | State is passed through a folder in iCloud Drive, and the actions taken over there are imported. Each action carries **the state visible when it was tapped**, so crossed updates return to the human instead of silently overwriting |

## Development

```sh
npm install
npm run dev          # start for development (with HMR)
npm run lint         # ESLint (type-aware)
npm run typecheck    # type check
npm test             # scheduler, parser, lifecycle, and restart tests
npm run check:architecture # layer, public-entry, and circular-dependency checks
npm run check        # lint + architecture check + typecheck + tests (run before finishing any work)
npm run build        # typecheck + bundle
npm run dist         # build the .app into apps/mac/release/
npm run dist:dmg     # build the dmg
npm run app:restart  # quit → rebuild the .app → relaunch
npm run icon         # regenerate the icon artifacts (only after redrawing)
npm run storybook    # visual check of the design system

npm run mobile:dev   # open the iPhone screens in a browser (runs on a fake iCloud)
npm run mobile:build # build the iPhone screens
npm run ios:build    # build the iOS app for the simulator to verify it compiles
npm run ios:open     # open in Xcode
npm run ios:install  # build onto a connected iPhone (needs Local.xcconfig → see Releases)
```

The rules for letting agents work on this repository start in
[AGENTS.md](../AGENTS.md).

### Repository structure

```
apps/
  mac/                 macOS app (Electron: main / preload / renderer)
  mobile/              iPhone app (screens in React, shell in Swift / WKWebView)
    src/               Screens. Uses the design system as-is
    ios/               Native shell. Reads and writes the iCloud folder
packages/
  design-system/       MUI-based UI kit. **Owns no domain**
```

Those are the three workspaces. The Mac's public API is `src/preload/api.ts`; the iPhone
protocol is owned by each app's receiving end and the
[compatibility tests](../tests/mobile-sync.compat.test.ts). There is no standalone domain
package and no `shared`.

npm workspaces. The development entry points (`npm run dev` / `check` / `dist`) live at
the repository root and fan out to the inner workspaces. **The quality gate
(`npm run check`) runs once, at the root.** Splitting it per workspace slides toward
"well, some of it passed".

No native modules are used. SQLite is the `node:sqlite` built into Electron / Node, so
there is no `electron-rebuild` and no ABI mismatch.

### Design system

The look is split out into [`packages/design-system`](../packages/design-system)
(`@design-system/react`): an MUI-based UI kit that **owns none of Quuu's domain**.
How to use it, and the call-site rules, are in [design-system.md](design-system.md).

- **Tokens = the MUI Theme.** The source of truth is `src/theme/tokens.ts`. Anything MUI
  models goes there; only concepts MUI lacks (surface hierarchy `palette.surface`,
  density `density`) are added as extensions
- **Views render domain state.** Color and shape live in each app's `ui/`; wording and
  layout in its view models. Operations and execution rules are owned by the responsible
  feature in the Mac's main process
- **Dimensions come as two density axes.** `compact` (mouse) and `comfortable` (finger):
  the step names stay the same, only the actual sizes change. This is how the iPhone app
  makes the same parts finger-sized
- **Screens only compose.** There is no CSS in `apps/mac/src/renderer`

```sh
npm run storybook   # visual check of the design system (http://localhost:6006)
```

### Icon

The source is `brand/icon.icon` (an Icon Composer package; inside are `icon.json` and
images) — **exactly one per product**. Both Mac and iPhone are built from it. Everything
else is a generated artifact, rebuilt with `npm run icon`.

The current image is `Assets/artwork.png`. It contains the supplied artwork unmodified,
keeping the white ground and the blue-to-purple gradient of the Q. The layer scale is
`1024 / 1254` to fit the 1254-square source onto the 1024 canvas. Glass, specular,
shadow, and translucency are disabled so no effect stacks on the original colors.

| Artifact | Who uses it |
|--------|-----------|
| `apps/mac/build/Assets.car` | macOS 26+. The layered icon (Liquid Glass) resolved via `CFBundleIconName` |
| `apps/mac/build/icon.icns` | macOS 25 and earlier, and the DMG. The old grid: 824 inside a 1024 canvas |
| `apps/mac/build/icon.png` | Dock icon for development runs (`app.dock.setIcon`) |
| `apps/mac/build/github-app-logo.png` | 200px badge for the GitHub App. GitHub takes an App's logo through its own web form and nowhere else — no manifest field, no API — so the creation flow hands this file to the human on its last page, alongside a link to the form |
| `apps/mobile/ios/Quuu/Assets.car` | iOS 18+. Likewise resolved via `CFBundleIconName` |

On iOS there are **no legacy PNG icons**. What `actool` emits is already cut with the
mask, and when iOS masks it once more the corners get rounded twice and a white fringe
appears. That is why the iPhone app's minimum requirement is iOS 18 (Icon Composer's
floor).

From macOS 26 on, an icon is not a single picture but **background + foreground
layers**; refraction, specular, shadow, and the dark / tint / clear variants are
produced by the system at runtime. When drawing the foreground as SVG, don't draw
shadows, gradients, or blur (they would be applied twice). When using a finished PNG,
take the image in as-is and disable the overlapping effects.

The generated artifacts are committed. `npm run icon` requires Xcode
(`actool` / `ictool`) and `librsvg`, but since it **only runs when the icon is
redrawn**, `npm run dist` carries none of those requirements.

### App restarts and agents

Agents are not bound to Quuu's lifetime. They run in their own process groups, write
output straight to log files, and leave their exit codes in `logs/<runId>.exit`.
Therefore **the app may be killed, rebuilt, and relaunched even while runs are in
flight**. On launch it re-adopts whatever is running, and settles whatever finished in
its absence from the exit codes.

The flip side: quitting Quuu does not stop the agents. To stop one, **cancel** the task
(it takes down the whole process group, so grandchild processes are cleaned up too).

### Environment variables

| Variable | Purpose |
|------|------|
| `QUUU_USER_DATA` | Overrides the data directory (default: `~/Library/Application Support/taskd`) |
| `QUUU_SOCKET` | Overrides the Unix socket of the local task API (default: `$QUUU_USER_DATA/quuu.sock`) |
| `QUUU_CLAUDE_PROJECTS_DIR` | Root of Claude Code session logs (default: `~/.claude/projects`) |
| `QUUU_CLAUDE_SESSIONS_DIR` | Pid files Claude Code keeps only while running (default: `~/.claude/sessions`) |
| `QUUU_CODEX_SESSIONS_DIR` | Root of Codex session logs (default: `~/.codex/sessions`) |
| `QUUU_CODEX_LOCKS_DIR` | Locks Codex keeps only while running (default: `~/.codex/thread-writer-locks`) |
| `QUUU_CURSOR_CHATS_DIR` | Root of Cursor chats (default: `~/.cursor/chats`) |
| `QUUU_GROK_SESSIONS_DIR` | Root of Grok sessions (default: `~/.grok/sessions`) |
| `QUUU_COPILOT_SESSIONS_DIR` | Root of GitHub Copilot sessions (default: `~/.copilot/session-state`) |
| `QUUU_AGY_DIR` | Everything the Antigravity CLI wrote (default: `~/.gemini/antigravity-cli`) |
| `QUUU_OPENCODE_DB` | The one store opencode keeps every session in (default: `~/.local/share/opencode/opencode.db`) |
| `QUUU_APPLICATION_DIRS` | Where to look for IDEs / editors (`:`-separated; default: `/Applications` and `~/Applications`, plus `JetBrains Toolbox` under them) |

The variables that relocate session logs are read by both import and the conversation
view. Tests point them all at once via `isolateSessionDirs` in
[`apps/mac/tests/helpers.ts`](../apps/mac/tests/helpers.ts)
(miss even one and they read the dev machine's real logs).

To launch separated from production data for verification:

```sh
QUUU_USER_DATA=/tmp/taskd-dev npm run dev
```

## CI

GitHub Actions ([ci.yml](../.github/workflows/ci.yml)) runs the quality gate
(`npm run check`) on every push to `main`. Lint, architecture, typecheck, and
tests are separate steps so a failure names the layer. The runner is macOS
because the tests build `quuu-pty` with `xcrun`.

## Releases

GitHub Actions ([release.yml](../.github/workflows/release.yml)) builds the Mac app and
puts dmgs (arm64 / x64) on the Release you published. Publish a GitHub Release (the tag
is created with it). The workflow stamps `apps/mac/package.json` with that tag's version
for the build, then rewrites the Release by attaching the dmgs. The version in git is
not consulted. Title and notes stay as you wrote them.

```sh
gh release create v0.1.0 --title v0.1.0 --generate-notes
```

The GitHub Releases UI does the same. Publishing the Release is the trigger — a tag
push by itself does not ship.

- **Signing defaults to ad-hoc (unofficial distribution).** Whoever downloads it has to
  get past Gatekeeper once — if opening is refused, use "Open Anyway" in
  System Settings › Privacy & Security, or in the terminal:
  `xattr -d com.apple.quarantine /Applications/Quuu.app`
- To use an Apple Developer Program certificate, put `CSC_LINK` (the .p12 certificate,
  base64) and `CSC_KEY_PASSWORD` in the repository Secrets. electron-builder switches to
  proper signing (no notarization is performed)
- **The iPhone app is not released.** Signed distribution requires the Apple Developer
  Program, so each user builds and installs it locally (`npm run ios:install`). The
  signing team goes into the gitignored `apps/mobile/ios/Local.xcconfig` as your own
  Team ID (if it's missing, the script explains how to create it; a free Personal Team
  is fine, but its profile expires after 7 days, so reinstall periodically)

## Operating tasks from the CLI

While Quuu is running, the main process serves a local API on a Unix socket under the
user data directory. No TCP port is opened, and the socket's permissions are `0600`. The
CLI never writes the DB directly; it goes through the same `QuuuApp` operations as the
UI and the iPhone, so side effects like waking the scheduler line up as well.

```sh
quuu projects list
quuu tasks list --project /Users/me/Projects/example
quuu tasks create --project /Users/me/Projects/example \
  --title 'Update the README' --prompt 'Add usage examples too' --priority 2
quuu tasks send <task-id> --message 'Please append the test results as well'
quuu tasks hold <task-id>
```

`quuu help` lists every operation. Output is JSON, easy for AI agents to consume as
well. The CLI's source of truth is [`apps/mac/bin/quuu`](../apps/mac/bin/quuu), which is
also bundled into the distributed `.app`. In development, symlink it from somewhere on
PATH (e.g. `~/.local/bin/quuu`) and the same command works from any project.

The HTTP contract is `GET /v1/projects`, `GET|POST /v1/tasks`,
`GET|PATCH|DELETE /v1/tasks/:id`, and `POST /v1/tasks/:id/:action`.
The endpoint is a Unix socket, so with `curl` use `--unix-socket`.

## View and queue from iPhone

Before bed, in the bath, on the move: read the answers that came back and mark them
done, or queue whatever comes to mind.

```
iCloud Drive/Quuu/
  mac/      Only the Mac writes here (state snapshot + task details)
  phone/    Only the iPhone writes here (action intents; one file per action)
```

**Every file has exactly one writer.** iCloud conflicts therefore cannot occur in
principle, and no merge logic is needed at all.

| Direction | What it carries |
|------|---------|
| Mac → iPhone | What things look like right now (lists, conversation tails, run results) |
| iPhone → Mac | What the human said they want (done, follow up and send back, queue, hold, new, archive) |

Each intent carries **the state visible when it was tapped**. The Mac checks it before
applying, and on a mismatch returns the reason instead of applying. The design assumes
time gaps, so "completing, sight unseen, a result from a run that happened after you
read" cannot occur.

- **Neither app has a folder picker.** The location is fixed at `iCloud Drive/Quuu`, and
  the Mac syncs by default. Settings › iPhone shows only the last sync and the actions
  that were not applied
- The iPhone needs only a **one-time OS permission** (a single "Open"). It is not a
  choice — iOS demands consent for reaching outside the sandbox. The app asks for it
  itself and asks again when it lapses. A dedicated iCloud container would make it zero,
  but Apple does not grant the iCloud capability to Personal Teams
- What you tap shows on screen immediately (marked as pending). Once imported, it is
  replaced by the real thing

## Importing directly launched sessions

Sessions started by launching an AI CLI directly from the terminal are picked up and
synced by Quuu in the background. The feature exists so that "open Quuu and you can see
what is running now and what has been done" holds.

| Behavior | Detail |
|------|------|
| Detection source | The locations in the table below (Claude Code / Codex / Cursor / Grok / Copilot / Antigravity / opencode) |
| Project | Resolved from the session's working directory. Auto-created if absent |
| Status | **Running** if there is a liveness marker; **Done** on an exit marker or sustained silence (CLIs without markers are judged by updates within the last 3 minutes) |
| Sync | 1.2 s after launch + every 60 s thereafter. Running it any number of times never duplicates (matched via `external_key`) |
| Consistency | Stopped sessions fall to Done on the next sync. **States a human has touched are never overwritten** |
| Safety | Imported projects are assigned no execution target. The import agent is always disabled. Quuu never launches anything on its own |
| Exclusions | Sessions Quuu itself launched, and subagents (launched by another agent), are not imported |

Configured in **Settings › General › Session import** (enable, auto-create, days to
look back, manual run).

### Where each CLI keeps things

This is not published specification; it was **verified by measurement** (the
implementation is gathered in
[`apps/mac/src/main/session/logAdapters.ts`](../apps/mac/src/main/session/logAdapters.ts)).

| CLI | Session log | Can a session ID be passed? | Running detection |
|-----|---------------|----------------------|-------------|
| Claude Code | `~/.claude/projects/<slug>/<id>.jsonl` | `--session-id` | `~/.claude/sessions/<pid>.json` (pid liveness also checked) |
| Codex | `~/.codex/sessions/<date>/rollout-<id>.jsonl` | No | `~/.codex/thread-writer-locks/<id>.lock` |
| Cursor | `~/.cursor/chats/<md5(cwd)>/<id>/store.db` (SQLite) | `--resume` (created even for an unused ID) | No marker → modification time |
| Grok | `~/.grok/sessions/<percent-encoded cwd>/<id>/chat_history.jsonl` | `--session-id` | No marker → modification time |
| GitHub Copilot | `~/.copilot/session-state/<id>/events.jsonl` | No | Ended once `session.shutdown` is written |
| Antigravity | `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl` | No (the CLI announces the conversation it opened on the first line of `--output-format stream-json`) | No marker → modification time |
| opencode | `~/.local/share/opencode/opencode.db` (SQLite; **every session in one store**) | No | Ended once the session's `time_idle` is stamped |

Two of them need more than a path. The Antigravity CLI ignores the directory it was started
in unless `--add-dir` names it, and it records a working directory in exactly one place — a
cache of the newest conversation per directory — so an older conversation in a directory
cannot be imported at all. opencode keeps every session in one store, so a session is named by
its id and never by a path: the conversation index carries the id in its key, and "when was it
last written" is answered by the session's own row rather than by the file's timestamp.

For CLIs that cannot take a session ID, the actual session is pinned down after launch
from cwd and time, and the record is corrected
([`apps/mac/src/main/session/sessionIdentity.ts`](../apps/mac/src/main/session/sessionIdentity.ts)).
Get this wrong and the conversation view and continued runs break at the same time —
and silently.

## Conversation and review projections

In Mac conversations, click an absolute path such as `/tmp/output` or a home path
such as `~/Documents/output` to open the folder in Finder. File paths select the
file in Finder. Paths in inline code and Markdown links work too; use either form
for names containing spaces. A missing or inaccessible path shows an error.

Session ingestion is owned by `main/session/index.ts` for the app's lifetime.
It parses appended JSONL in bounded read/write batches, yields between batches,
and stores messages and images in SQLite. Completed message bodies and image
bytes leave parser memory after each batch; late tool results retrieve their calls
from the index. Raw stdout keeps only its unfinished page. Changed Cursor stores
are re-read.
Windows subscribe to the index and hold their own bounded page range. A first
backfill or a log changed while the app was closed shows a tail preview first;
older pages become available when that source finishes indexing. Index versions
are part of the cache key so parser changes can explicitly invalidate old data.

Ingestion also records commit receipts and URLs returned by successful PR operations
for the task; URLs quoted in source files or conversation are not PR receipts.
Evidence versions allow cached messages to be reclassified in bounded batches without
reparsing the original logs. Review projections
are refreshed in the background, coalesced and throttled, with local Git results
saved before GitHub finishes. Opening Review reads that saved projection; the
refresh button requests fresh observations. Recorded commits remain discoverable
after checkout, recorded PRs are fetched directly by URL, and a GitHub failure
preserves previously fetched PRs with a notice. Git refs retain saved review objects.
Existing logs are backfilled after startup, including earlier runs of a task.

`QUUU_FIXTURE_HISTORY=6000 npm run dev:fixture` creates a long conversation and a
real repository under `/tmp/taskd-shot` for checking scrolling and saved reviews.

## Task ordering

Expresses "run this once the currently running task finishes" and "don't run these in
parallel".

- Set via **Predecessors** in the inspector. **Any number can be set** (nothing proceeds
  until all are satisfied)
- Two kinds of wait condition, held **per dependency** (A until done, B once its run
  ends — both are expressible)
  - **When done** (default) — waits until a human marks it done. Review is not skipped
  - **When the run ends** — proceeds even if it lands in Review or Failed
  - Change or remove the condition from the menu opened by clicking the predecessor's
    row
- Until its predecessors are satisfied, the task is never acquired from the queue (other
  tasks proceed)
- **List order follows the dependencies too.** While Queued, predecessors always appear
  before their dependents (queue numbers in the same order)
- Cycles are detected and rejected at setup time. Deleting a predecessor releases the
  link automatically — nothing stays stuck
- To keep the same repository from being touched concurrently, set the project's
  **concurrency limit** to 1

## Queueing tasks automatically

"Burn down one Issue when the queue is free", "clear PR review comments every morning" —
a project can hold **definitions that queue a task when conditions line up**. Configured
at **rail → project → gear → Auto-queue**. Any number can sit on one project.
Recurring task definitions appear as rows at the very bottom of the same task list,
with the same columns as ordinary tasks. They stay last when sorting, include disabled
definitions, and also appear in the compact list beside a task. Clicking a definition
opens its settings.

What gets queued is an ordinary task: acquisition, execution, and review all work as
before. The rule that **only a human writes `done`** also stands (automation can create
nothing beyond `Queued`).

Frequency (or a custom cron expression), an empty queue, and duplicate prevention
work as **gates that all AND together**. Each may be
omitted, but a definition with none of them would queue every tick, so it cannot be
saved.

| Condition | Meaning |
|------|------|
| **Only queue when the queue is empty** | When the project has nothing `Queued` and nothing `Running`. If something else is in progress, nothing is queued until it clears. Review, Failed, and Held don't count (so things keep moving while a human's attention is awaited) |
| **Frequency** | Choose once a day, once a week, or once each weekday without choosing a time. Periods follow the Mac’s local calendar (weeks start on Monday). A new definition can enqueue in the current period as soon as its other conditions allow; at most one task is enqueued per period. Weekdays skip Saturday and Sunday even when a previous day was blocked. Missed periods never accumulate. |
| **Cron expression** | Treated **not as firing at that time, but as a signal that queueing is allowed once it has passed** (a deadline). As a point event, a day that was busy at 3:00 would be skipped entirely; as a deadline it becomes "queue when free". Queueing advances to the next deadline, so the days the app was off never pile up |
| **States that count as duplicates** | Nothing is queued while **a task created by this definition** remains in one of the chosen states. Which states count is selectable (default: everything except Done). Archived tasks don't count, so one stuck task can be cleared that way |

Stack all three and you get "once a day, when nothing else is going on, if the previous
one is finished, burn down an Issue". Use only "when the queue is empty" and it becomes
rapid fire: each time one clears, the next is queued.

- With several on one project, the one that **queued least recently** is looked at first
  (the head of the list doesn't get to queue forever)
- Deleting a definition keeps the tasks it queued (only the origin mark is removed)
- A queued task shows which definition it came from under **Origin** in the info panel
- **Queue now** creates one without waiting for the conditions (an entry point for
  verifying the setup). It counts toward the current frequency period too
- Nothing is queued while the scheduler is paused

## P0 keeps its slot

When one task turns out bigger than expected and you are iterating on it with follow-ups,
switching to whatever else the queue picks up costs more than waiting. Setting the task to
**P0** sticks to it: besides going first, a P0 task **keeps its execution slot** until it
is done. Without that, every follow-up hands the slot to some other task, and the one in
front of you is the only one not moving.

- Set the priority to P0 (`⌘⌃0` / right-click › Priority / the inspector). Lowering it
  again lets the slot go
- What's kept is **one project concurrency slot** and **one agent parallelism slot**.
  The agent kept is the task-level choice if one is set, otherwise the one used by the
  most recent run
- While kept, the slot is handed to no other task. **Even "Run now" cannot take it.**
  P0 tasks compete normally with each other within the limits (they cannot squeeze each
  other into a total standstill)
- **Marking done releases it automatically.** Otherwise it holds until the priority is
  lowered
- While in effect, the footer shows `P0 N`; clicking it opens the task keeping the slot.
  A task that could not be acquired for lack of a slot shows the name in its reason:
  "'…' is holding the run slot as P0"
- A running task already occupies a real slot, so it is not double-counted as a
  reservation

Nothing changes a priority on its own. Stalling the rest of the queue is a deliberate
order, so it only takes effect when a human sets P0.

## Data

`~/Library/Application Support/taskd/`

- `taskd.db` — SQLite (WAL). Tasks, run history, agent definitions, projects
- `logs/<runId>.log` — stdout / stderr of each run

The location and file names keep the old name (taskd). Moving them when the public name
changed to Quuu would have orphaned the existing tasks and run history, so they were
deliberately left in place. The localStorage keys holding UI state (pane widths,
ordering, drafts) keep the old name for the same reason.

This directory is also Electron's userData (localStorage and cookies live here).
Electron's default is derived from the app name, so `apps/mac/src/main/index.ts` pins it
by passing the `appPaths` values explicitly. **Renaming the app does not move the
location.**

## About agent configuration

Quuu pins no permission mode. Things like `--permission-mode bypassPermissions` are
**written by the user as part of the agent definition's argument template**.

Non-interactive runs (`-p`) stall the moment a permission prompt appears, so for
unattended operation it must be specified in the argument template. The first-launch
presets include configurations that do not stall.

## Entry points for operations

This is a desktop app, so the same operation gets three entry points.

| Entry point | Purpose |
|------|------|
| **Native menus** | Where shortcuts are defined. What's possible is discoverable from the menu bar |
| **Right-click** | Directly on the target. Task rows / projects in the rail |
| **Command palette `⌘T`** | Jump to the destination without walking the hierarchy. Task search, navigation, operations |

**No operation requires a pointer.** The right-click menu is `⌘⌥↵`; pane widths and
column widths are changed by going to the handle with `⇥` and pressing `←` `→`.

### Shortcuts (defined in the native menus)

The menus are split **by what they act on**, so there is one place to look.
`Go` is destinations, `Task` is operations on the selected item, `View` is how the panes
are shown.

| Key | Action | Menu |
|------|------|---------|
| `⌘N` | New task | File |
| `⌘⇧N` | New project | File |
| `⌘O` | Open task | Task |
| `⌘R` | Run now | Task |
| `⌘⇧D` | Mark done (advances to the next automatically) | Task |
| `⌘⇧B` | Send back (into the conversation input) | Task |
| `⌘⌃0`–`⌘⌃3` | Set priority P0–P3 (P0 keeps its slot) | Task › Priority |
| `⌘⌫` | Archive | Task |
| `⌘[` `⌘]` | Back / forward through the screens already seen | Go |
| `⌘T` | Go anywhere (command palette) | Go |
| `⌘1` `⌘2` | All tasks / Needs review | Go |
| `⌘3`–`⌘9` | Go to project (up to 7; beyond that, `⌘T`) | Go › Projects |
| `⌘⌥1` | Toggle the menu | View › Panels |
| `⌘⌥2` | Minimize the list (side-by-side ⇄ minimized) | View › Panels |
| `⌘\` | Toggle the info panel | View › Panels |
| `⌘,` | Settings | Quuu |
| `⌘F` | Go to search | Edit |
| `⌘⌥↵` | Context menu (for the row, column, or pane the hand is on) | Edit |
| `⌘⌥←` `⌘⌥→` | Move the hand to the previous / next pane | View › Focus |

`⌘[` / `⌘]`, not `⌘←` / `⌘→`: a menu shortcut is taken before the screen sees it, and
those two are move-to-start / end-of-line inside every input in the app.

**The trackpad's page swipe does the same thing**, in whichever form the Mac is set to
(System Settings › Trackpad › More Gestures › Swipe between pages): three fingers arrives
as a window gesture, two fingers as sideways scrolling. With two-finger page swipes turned
off, a two-finger sideways scroll stays a scroll. Back and forward go through the
screens you actually stood on — a section, a task opened, a settings category, a project's
configuration — and not through every row the arrow keys passed over on the way. A
destination that has since been deleted is stepped over rather than landed on, and the
trail is per sitting: relaunching does not bring back yesterday's.

Only keys that would be meaningless in a menu are handled by the screens.

| Key | Action |
|------|------|
| `↑` `↓` / `J` `K` | Move between tasks (moves in **on-screen order**; an open detail view follows along) |
| `Home` `End` `⇞` `⇟` | To the ends of the list / 10 rows at a time |
| `Enter` | One level deeper (open from the list → once more into the conversation). **Always a newline in input fields** |
| `←` `→` | Change the width while gripping a pane boundary or column handle (`⇧` for 1px steps) |
| `⌘Enter` | Confirm from an input field (add / queue / send). Shared by the list's bottom edge and the conversation |
| `⇧⌘Enter` | Queue from the list and open it right away |
| `Esc` | One level back (stop typing → close the detail). The hand returns to the list |

### Where the hand is (panes)

Who receives `↑↓` or `↵` is decided by **the pane holding the hand**. That pane glows at
its outline.

```
[Menu] [List] [Conversation] [Input] [Info]
    ←────────  ⌘⌥← / ⌘⌥→  ────────→
```

`⇥` moves from pane to pane. **List rows are not walked with `⇥`** — with hundreds of
rows, just tabbing out of the list would take hundreds of presses. Rows are `↑↓`,
opening is `↵`, and operations on a row go to `⌘⌥↵`.

`Enter` is not used to confirm in input fields because it cannot be told apart from
committing a Japanese IME conversion. So that a conversion's `Enter` never triggers a
send, every input that listens for `Enter` / `Esc` ignores them during composition.

## Screen structure

The essentials:

```
L0 menu   →  L1 overview (table)  →  L2 task (conversation + info)
                  ↑ only choosing here opens L2

Opening L2 shrinks L1 to "side-by-side" (identifiable by title, movable with ↑↓).
The list's head has [＋][minimize][maximize], and the size moves along a single axis.
Minimizing (⌘⌥2) does not narrow the width and shave off information; it hides the
whole list and leaves a handle at the edge. **The handle comes back only when
pressed** (no pane slides out on mere hover). Maximizing closes the task and returns
to the full-width table — the same operation as the ✕ in the detail header.
```

- A task's centerpiece is **the conversation with the agent**. There is no dedicated
  prompt field: the first message written in the conversation becomes the prompt and is
  queued
- The bottom edge of the list does the same. **Line 1 is the title, lines 2+ are the
  prompt.** By default it goes to Queued whether or not there is a body; without one,
  the title is the instruction. Draft, Held, and Run now are explicit choices under the
  button's `▾`
- Both screens use the same prompt input: title, instructions, then project, AI,
  priority, and the send action. In task details the title, project, and AI stay
  visible in the same positions as fixed values; priority remains editable.
- While a task is open, the side-by-side list's `＋` (`⌘N`) can still queue a title as
  Queued — add without closing what you're reading. Delete and run are on the row's
  **right-click** (the same menu as the full-width table)
- Attributes (status, project, priority, agent, run history) go to the info panel on the
  right
- Agent definitions are a shared resource, so they live in **Settings › Agents**
- **Project configuration lives on the project's screen** (rail → project → gear).
  Configuration that affects only one project is not gathered into the app settings
