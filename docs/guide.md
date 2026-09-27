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
| When a Limit lifts | The moment the CLI printed ("try again at Sep 19th, 2026 7:13 PM", "resets 3pm") is cooled for exactly that long. A limit on **one model** ("You've reached your Fable limit") names no moment because that share is a slice of the account's **weekly** allowance — so it waits for the week to turn, read off the last turn Quuu watched that agent make, plus seven days. Until it has watched one, the configured cooldown is what probes for it. **Run Now** during a Limit starts that one task anyway: a plan change or credits bought can lift it from outside. If the run is still limited, the task goes back to waiting. Other tasks keep waiting until that probe gets through. Right-click the agent in Settings → Agents and choose **Reset Limit** to lift the cooldown for every task waiting on it, when the account is already back |
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
| Pull Request watch | The Pull Request tab carries one small circle for the CI of every open PR the task produced: green when all passed, red when any failed, yellow while any is still running (nothing while nothing reports). A PR whose checks are running is looked at again every minute until they answer, so the circle changes without pressing refresh. Each PR row also marks a branch that conflicts with its base |
| Sent back over a Pull Request | Settings › Pull Requests holds three prompts, each with its own switch: CI failed, CI still running, conflicts with the base branch. When a run ends normally, a task whose project has any of them on **keeps its run slot** while the run's conversation is indexed and GitHub is asked again; if the PR is in a state whose prompt is on, the prompt goes back to the same agent **exactly as written** and the task continues in that slot before anything else starts. Otherwise the slot is let go (at the latest after three minutes). `{{url}}`, `{{number}}`, `{{title}}`, `{{branch}}` and `{{base}}` are filled in only where written. A project can follow the app, opt out, or keep its own three. The worst state wins (conflict over failure over running), merged and closed PRs are ignored, and after five rounds in a row the task is left in review and a toast says so |
| GitHub identity | Beyond commit author / committer, `git push` and `gh` (PR creation etc.) are also aligned to the GitHub App's bot identity. The app-wide default can be turned off per project or pointed at a different App |
| GitHub App setup | Available from "Set up GitHub App" in Settings (click → follow the browser flow to approve → the identity fills in). When the required permissions change, "Update GitHub App" replaces it through the same flow — no copying values by hand |
| GitHub App credentials | Each Run starts with a private `GH_CONFIG_DIR`, shared by native `gh` and Git's credential helper. Quuu refreshes the installation token 15 minutes before expiration, including while the app is closed or restarting. Failed refreshes retry every minute and retain the existing token; they do not fall back to a personal login. Initial authentication failure stops the Run before launching the agent. Applies to newly started Runs |
| Automation | Definitions that queue a task when conditions line up: "when the queue is free", "past a cron time", "when nothing unfinished remains". Any number per project |
| External session import | Detects directly launched Claude Code / Codex / Cursor / Grok / Copilot / Antigravity / opencode sessions and syncs them as projects and tasks. Running ones become Running; stopped ones become Done |
| Continue in the terminal | Reopens a finished session in the terminal, **still interactive** (the equivalent of `claude --resume <id>`). Can also just open the working directory |
| Open in an IDE / editor | Opens the working directory in JetBrains / Xcode / VS Code and so on. Which app to use is chosen per project (Xcode is handed the `.xcworkspace` / `.xcodeproj`) |
| View and queue from iPhone | State is passed through a folder in iCloud Drive, and the actions taken over there are imported. Each action carries **the state visible when it was tapped**, so crossed updates return to the human instead of silently overwriting |

## Project documents

Open **Documents** in a project's left navigation. The searchable list includes
Markdown and text documents committed on the default branch; selecting one opens
its preview. Markdown links can move between documents and heading anchors. The
header names the branch, and Refresh reads its latest local commit. Uncommitted
files and the currently checked-out feature branch do not affect this view.

The default branch comes from `origin/HEAD`, with `main` / `master` as fallbacks.
A repository without remotes and with one branch uses that branch. No fetch or
checkout is performed. README variants throughout the repository also contribute
published HTTPS Docs links, including package badges in monorepos. Package names
distinguish these sites in the navigation. These websites open inside the preview,
with page navigation and an action to open the original site in a browser.

The task composer stays below every reading surface, including Documents,
Dashboard, Needs review and task details. Adding a task keeps the current page
open; Shift+⌘+Enter also opens the added task. Global and project settings omit
the composer. Drafts remain available when returning from settings.

## Development

```sh
brew install gitleaks # secret checks for Git commits and pushes
npm install          # also enables the repository's Git hooks
npm run dev          # start for development (with HMR)
npm run lint         # ESLint (type-aware)
npm run typecheck    # type check
npm test             # scheduler, parser, lifecycle, and restart tests
npm run check:architecture # layer, public-entry, and circular-dependency checks
npm run check        # lint + architecture check + typecheck + tests (run before finishing any work)
npm run build        # typecheck + bundle
npm run dist         # build the .app into apps/mac/release/
npm run dist:dmg     # build the dmg
npm run dist:release # build Release-marked dmg + zip for both Mac architectures
                     # (on Windows: the x64 installer and zip)
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

### Secret checks before commits and pushes

`npm install` / `npm ci` configures this checkout's `core.hooksPath` to `.githooks`.
For an existing checkout, run `brew install gitleaks` and `npm run hooks:install`.
The installer stops if existing hooks need to be integrated; it does not overwrite them.
No npm hook manager is required. Hooks also find Homebrew in GUI/agent environments.

- `pre-commit` scans the staged diff, including partially staged files.
- `pre-push` scans every outgoing ref's commit range, including intermediate and merge
  commits. Removing a secret in a later commit does not remove it from that history.
  New branches/tags, or remote tips missing locally, scan the entire reachable history.
  Ref deletion needs no scan. Tags pointing to non-commit objects are rejected.
- Findings and scanner failures block the operation. Diagnostics redact secret values.
  Gitleaks must be installed; an unavailable scanner never silently passes.

Rules extend Gitleaks' built-in defaults in `.gitleaks.toml`. Investigate a finding
before adding a narrowly scoped exception; do not exclude whole source or test trees.
Remove secrets from the staged changes or unpublished history before retrying. If a real
credential was exposed, revoke/rotate it too. Repository history must not be rewritten
without the owner's instruction (see [working.md](working.md)).

`npm run secrets:scan` manually scans all local refs for periodic inspection.
Keep the existing periodic checks: local hooks are an accident guard, and Git allows
them to be bypassed with `--no-verify` or a changed hook configuration. They do not
enforce a server-side policy or detect every possible kind of secret.
See [Gitleaks](https://github.com/gitleaks/gitleaks) and
[Git's hook documentation](https://git-scm.com/docs/githooks) for the underlying behavior.

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

Those are the three workspaces. The Mac's public API is `src/api/types.ts`; the iPhone
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
| `QUUU_CONNECTION_FILE` | Overrides CLI discovery (`$QUUU_USER_DATA/connections.json` by default) |
| `QUUU_URL` / `QUUU_TOKEN` | Explicit gRPC URL and bearer token; set both |
| `QUUU_OUTPUT` | CLI output default: `auto`, `json`, or `table`; `--output` takes precedence |
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

A second job builds on Windows (`npm run build`: typecheck, the ConPTY terminal host,
the bundle) and runs `tests/windowsPlatform.test.ts`. The rest of the suite drives POSIX
processes and runs on macOS only.

## Releases

GitHub Actions ([release.yml](../.github/workflows/release.yml)) builds the Mac app and
puts dmgs, update ZIPs and JSON feeds (arm64 / x64) on the Release you published. A
Windows runner builds `Quuu-<version>-win-x64-setup.exe` (installer) and
`Quuu-<version>-win-x64.zip` (no install) and attaches them to the same Release. Publish a GitHub Release (the tag
is created with it). The tag is the release date, `YYYY.MM.DD`, with no `v` prefix. The
workflow stamps `apps/mac/package.json` with its numeric version (for example,
`2026.09.27` becomes `2026.9.27`), then attaches the artifacts. The version in git is not consulted. Title
and notes stay as you wrote them.

```sh
tag=$(date +%Y.%m.%d)
gh release create "$tag" --title "$tag" --generate-notes
```

The GitHub Releases UI does the same. Publishing the Release is the trigger — a tag
push by itself does not ship. A tag in any other shape (`v0.1.0`, `2026.9.26`) fails the
workflow before building, so nothing is attached. One release per day: to ship again the
same day, delete that day's Release and tag first, then publish again.
Rebuilding the same date replaces the downloads but does not update existing
installations automatically; automatic updates require a newer dated Release.

- **Signing defaults to ad-hoc (unofficial distribution).** Whoever downloads it has to
  get past Gatekeeper once — if opening is refused, use "Open Anyway" in
  System Settings › Privacy & Security, or in the terminal:
  `xattr -d com.apple.quarantine /Applications/Quuu.app`
- To use an Apple Developer Program certificate, put `CSC_LINK` (the .p12 certificate,
  base64) and `CSC_KEY_PASSWORD` in the repository Secrets. electron-builder switches to
  proper signing (no notarization is performed)
- **Windows builds are unsigned.** SmartScreen asks once ("More info" → "Run anyway").
  Windows has no automatic updates; install a newer Release over the old one. The
  GitHub App commit identity keeps its key in the macOS Keychain and is macOS-only
- **The iPhone app is not released.** Signed distribution requires the Apple Developer
  Program, so each user builds and installs it locally (`npm run ios:install`). The
  signing team goes into the gitignored `apps/mobile/ios/Local.xcconfig` as your own
  Team ID (if it's missing, the script explains how to create it; a free Personal Team
  is fine, but its profile expires after 7 days, so reinstall periodically)

### Automatic Mac updates

Certificate-signed Release builds use Electron's built-in `autoUpdater` (Squirrel.Mac).
They check GitHub's latest stable Release 30 seconds after launch and every six hours,
download updates in the background, and apply them on the next app launch. **Quuu >
Check for Updates…** checks immediately. After a download, **Restart to Update** first
stops servers and closes SQLite through the normal shutdown path; running agents
remain detached and are re-adopted after restart. **Later** keeps the app open.

The Release workflow uses `electron-builder.release.yml` to mark the bundle as
`github-release`; `npm run dev`, `dist`, `dist:dmg`, and `app:restart` remain local
builds and never initialize the updater or contact the update feed. Moving a local
bundle into Applications does not enable updates. `dist:release` explicitly opts
into the Release channel and is intended for the release workflow.

Each architecture uses its own `RELEASES-<arch>.json` and ZIP. Feeds are attached only
after both ZIPs are uploaded. Squirrel compares numeric versions, rejects downgrades,
and verifies that an update matches the installed app's code signature. Prereleases
are excluded by GitHub's latest stable Release endpoint.

macOS requires a certificate signature for automatic replacement; an ad-hoc signature
cannot authenticate a later build. Keep the existing `CSC_LINK` and `CSC_KEY_PASSWORD`
Secrets configured with a consistent signing identity for Release builds. This change
does not provision certificates or change Secrets. Ad-hoc Releases remain available
as manual downloads and publish empty update feeds. Their update menu explains the
requirement and offers to open Releases. Existing versions without this feature need
one manual installation of a signed Release first. Install into Applications before
updating; a mounted DMG is read-only.

References: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)
and [Squirrel static update feeds](https://github.com/Squirrel/Squirrel.Mac#update-file-json-format).

## Operating tasks from the CLI

The CLI uses the built-in gRPC server. See [CLI and MCP](#cli-and-mcp) for discovery,
configuration and history analysis. The Unix socket API has been retired.

## Operating Quuu from Quuu (QuuuAI)

The first project in the rail is **QuuuAI**, built into Quuu and present from the first launch.
Its tasks are requests about Quuu itself — "register ~/src/api as a project", "enable Codex and
use it for api", "review failed runs every morning" — and the agent carries them out through the
`quuu` CLI, the same operations the screen uses.

- It runs in `Quuu.app/Contents/Resources/quuu-ai`, which ships the [quuu skill](../skills/quuu/SKILL.md)
  and its use-case references. A fresh conversation there ends with an instruction naming that
  skill's absolute path, so every CLI (not only those with a skill system) reads the copy that
  matches the running app. Follow-ups go out as written.
- Its runs find the bundled `quuu` first on `PATH`. Without Node.js, the launcher runs the CLI on
  Quuu's own runtime.
- It cannot be deleted, and its directory and worktree mode are fixed: the operations refuse
  them from the screen, the CLI and MCP alike. Disable it to stop its tasks. Name, color, agent,
  priority and concurrency are yours; it starts at project priority 0 on the default group.
- Each launch points it at the running app's workspace, so moving or updating the app, or a
  dev launch sharing the database, keeps it working. It starts with change reports, commit
  identity and Pull Request prompts off: nothing it does is committed.
- The workspace is inside the app bundle. Agents are told not to write there; a request that
  needs code changes becomes a task in the project that holds the code.

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
provider implementations live in
[`apps/mac/src/main/agent-adapters/`](../apps/mac/src/main/agent-adapters/)).

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
Which commits in a checkout are the task's is decided by the checkout's own reflog
against the task's run windows (`main/review/ownership.ts`): a commit created there
while a run was going is the task's; one that arrived by pull, checkout or reset is
not. Tasks of one project take turns on the same `main` and merge it into their
branches, so the start-to-now comparison alone would describe everybody's work. When
other work sits in the range, the task's file list is built from its own commits and
its uncommitted diff, and the report writer is sent to those instead of the two-tree
diff. A checkout that was not there to see the task run (no reflog of that time) falls
back to the whole range. The place a task worked in follows `cd` and `git -C` moves
written inside shell commands too, since Claude Code keeps its own directory.
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

## Project dashboard

Each project has a narrow icon navigation for Dashboard, Tasks and Settings. The
existing task list and project settings remain available there. Dashboard appears
only when report AI and the project's reports are enabled.

While Quuu is running, the report AI checks projects once per Mac calendar day.
It assesses the implementation against the purpose, vision and goals in AGENTS.md,
README.md and the project documentation. **Settings → Report → Project dashboard**
can replace that assessment prompt; an empty field uses the default. Task report
instructions remain separate. Both use the same writer or group and bundled
HTML document resources.

The project report opens by explaining what the project is: its name and concrete
function, who uses it for what, and a use case showing input, system behavior and
result. The hero uses plain descriptions and an overview figure. Progress against
goals, remaining work and evidence follow in the assessment sections. Customizing
the assessment focus preserves this introduction; task change reports keep their
before/after opening.

A saved fingerprint includes the local main commit (master when main is absent),
HEAD, staged and unstaged binary diffs, non-ignored untracked file contents, and
the dashboard instructions. An unchanged project keeps its last report. Git is
read without staging, checking out, or writing objects. Missed days do not queue
extra generations. **Regenerate report** in the dashboard header always requests
a new report. Until a page exists the dashboard body is empty; while regenerating,
it keeps the previous page. A failed generation also keeps that page, and running
generators survive app restarts just like task report generators.

## Report appearance

New reports use [document-design](https://k-kinzal.github.io/document-design/)
**v1.0.0**, bundled in the app and written locally to
`reports/assets/document-design-v1.0.0.css`. Generation and viewing require no
stylesheet download. Existing reports keep their original stylesheet.

The report writer receives the library's `.sheet` layout, a static component
guide, and an HTML skeleton. It uses figures with captions and sources, readable
SVG labels, tables, and notes to explain the evidence. The document language
selects English or Japanese typography, and colors follow the app's appearance.
Reports remain static: the library's optional JavaScript controls are not used.
Use **Write again** to regenerate an existing report with this layout.

The pinned file, upstream source, checksum, and license declaration are recorded
in [the vendored asset notes](../apps/mac/src/main/report/vendor/document-design/v1.0.0/README.md).

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
at **rail → project → settings icon → Auto-queue**. Any number can sit on one project.
Recurring task definitions appear as rows at the very bottom of the same task list,
with the same columns as ordinary tasks. They stay last when sorting, include disabled
definitions, and also appear in the compact list beside a task. Clicking a definition
opens its settings.

What gets queued is an ordinary task: acquisition, execution, and review all work as
before. The rule that **only a human writes `done`** also stands (automation can create
nothing beyond `Queued`).

Generated task titles automatically append the Mac's local enqueue date as ` YYYY/MM/DD`.
Daily, weekday, and cron schedules that can repeat within a day append
` YYYY/MM/DD HH:mm:ss` instead, as do definitions without a time condition.
This also applies to **Queue now**. The definition's name and prompt stay as entered;
the timestamp stays with the generated task while it waits or is retried.

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

`~/Library/Application Support/taskd/` (Windows: `%APPDATA%\taskd\`)

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

See [Agent integration](agent-adapters.md) for CLI and Adapter responsibilities.
The existing log-adapter selection also selects the provider diagnostic and session
capabilities. Runs retain that selection and custom limit patterns from launch, so
editing an Agent affects future runs without reinterpreting its history. Fable uses
the Claude adapter with its model specified in the existing argument templates.

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

On Windows, `Ctrl` stands in for `⌘`, `⌘⌃` becomes `Alt`, and Archive is `Ctrl+Shift+Backspace`
(`apps/mac/src/main/menuPlatform.ts`). The menu bar appears with `Alt`.

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

The left navigation lists projects by name (A–Z, with natural number order).
Project choices in the task-list filter and task inputs put the most frequently
run projects first, counting task runs started in the last seven days. Completed,
archived, and imported task runs count too; equal counts fall back to name and
then path. These display orders do not change execution priorities.

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
- **Project configuration lives on the project's screen** (rail → project → settings icon).
  Configuration that affects only one project is not gathered into the app settings

## CLI and MCP

See [the quuu skill](../skills/quuu/SKILL.md) for task operations, historical log
analysis and recurring analysis examples. Every operation is discoverable with
`quuu api` and `quuu describe RESOURCE.ACTION`. Use `quuu call RESOURCE.ACTION`
with JSON for the full operation set. The CLI uses HTTP/2 gRPC and generated
Protobuf messages; the old Unix socket API is retired.

**Settings > Connections** controls HTTP and MCP independently, with configurable
ports (Automatic selects a free port), live endpoints and binding errors. Both
listen only on loopback. `quuu config` returns connection information and the bearer
token for MCP client configuration; keep that output private. The token survives
restarts. Select a fixed MCP port when saving a client's connection configuration;
port zero selects an available port at each start. The generated gRPC
service contract is `apps/mac/proto/quuu.proto`.

Build the bundled CLI with `npm run build:cli`. `apps/mac/bin/quuu` launches it; the
packaged app includes the launcher, entry point and lazy chunks in `Contents/Resources/bin`. Add
that directory to PATH, or link the checkout launcher into a directory on PATH.
The installed local checkout uses `~/.local/bin/quuu`. Runs in QuuuAI get the bundled
directory on PATH automatically.

`quuu app info` reports the version, the data directory and the update state;
`quuu app check-for-updates` does what **Quuu › Check for Updates…** does, with any dialog
shown on the Mac. Operations that open dialogs or draw inside the window
(`system.pickDirectory`, `report.show`, …) still need a person at the Mac; the
[troubleshooting reference](../skills/quuu/references/troubleshooting.md) lists them.

The CLI requires Node.js 22.12 or later. Commander handles subcommands, options,
errors and `--help` / `-h` at every command level. Help reads only a generated
operation-name catalog; it does not initialize gRPC, load schemas or contact Quuu.

Output is readable tables/details in a human terminal, and JSON when stdout is
redirected/piped or an AI environment is detected (`QUUU_RUN_ID`, `CODEX_THREAD_ID`,
`CODEX_CI`, `CLAUDECODE`, `CURSOR_AGENT`). Nonempty markers other than `0` / `false`
count as AI execution, including PTYs. An unrecognized AI using a PTY can specify
`--output json`. Precedence is `--output` / `-o`, then `QUUU_OUTPUT`, then automatic
selection. Explicit `--output table` works in pipes too. Existing JSON shapes are
preserved. `--json` remains the operation **input** flag; use `--output json` for output.

All one-shot commands, including lists and generic `call`, accept `--query` in
[JMESPath](https://jmespath.org/tutorial.html) syntax, following the convention used
by [Azure CLI](https://learn.microsoft.com/cli/azure/query-azure-cli) and AWS CLI.
It supports field projection, filters, sorting and aggregates without shelling out.
The query runs against the complete JSON result before formatting. For shortcuts,
use `projects` / `tasks` as the root; `agents list`, `groups list`, `rules list` and
`call projects.list` return arrays. `tasks list` collects all matching pages first;
`call tasks.list` preserves API paging. Server filters (`--project`, `--status`)
are applied before the local output query. Empty selections remain `[]`, and missing
fields become `null` in JSON. Syntax errors fail before executing the operation.

```sh
quuu projects list --help
quuu projects list --query 'projects[].{name:name,path:path}'
quuu projects list --query 'sort_by(projects, &name)[].{id:id,name:name}' -o table
quuu tasks list --query 'tasks[?status==`review`].{id:id,title:title}'
quuu tasks list --query 'length(tasks)' -o json
quuu agents list --query '[?enabled].{id:id,name:name}'
```

Use single quotes around expressions to protect JMESPath backticks and `&` from
the shell. Log exports, `watch`, and `stream` always emit JSONL and reject `--query`
and `--output table`; use `call logs.page --query ...` for a queryable history page.

```sh
quuu tasks list --project /path/to/project --include-archived
quuu tasks logs TASK_ID --all > /tmp/task-history.jsonl
quuu tasks logs TASK_ID --all --search 'failed'
quuu rules list
quuu describe rules.create
```

Task log output is paged and streamed. Run IDs and message IDs accompany evidence
so an analysis can cite the original task instead of reporting untraceable advice.
Recurring rules enqueue ordinary tasks; those agents can use the same CLI to
inspect a project and create follow-up work.

## Task worktrees

**Settings > General > Worktrees** enables isolation for new tasks. It starts off.
Each project's settings can follow that choice, enable worktrees, or use the project
directory. Settings changes apply to tasks that have not started; existing conversations
keep their working directory.

The first run creates a `quuu/…` branch from the local default branch and a linked
worktree under the app data directory's `worktrees/`. Git's `origin/HEAD` identifies
the default branch; local `main` / `master`, or a sole branch in a local-only repository,
are fallbacks. Projects registered below the repository root keep that relative
subdirectory. A repository with no initial commit cannot create a worktree.

Follow-ups, retries, failures, review, and app restarts retain that same worktree.
The task's review, terminal and editor open there. Changing settings does not remove
existing worktrees. The task cannot move to another project while it owns one.

- **Done:** if GitHub confirms a merged PR for the task's exact current branch and
  commit, remove the worktree. Otherwise merge into the local default branch, then
  remove it. Quuu does not push the default branch. Later commits after a merged PR
  still need integration. If GitHub cannot be checked and the head is not already in the local default branch, completion waits for a retry.
- **Merge failure:** leave the task in Review and retain its worktree. Conflicts do
  not modify the default checkout. Resolve them in the task worktree and try Done
  again. Commit or discard uncommitted files and finish in-progress Git operations
  before completion; local default-branch changes are not overwritten.
- **Archive:** retain the worktree and its changes without merging or deleting them.
- **Delete:** stop the task and discard its worktree, including uncommitted files,
  without merging. Deleting a project does the same for its tasks, including archives.

Quuu removes its own temporary branch when safe. Branches created separately by the
agent are retained. Reopening a completed task creates a fresh workspace on its next
run and starts a fresh conversation. Completion from iPhone, CLI and MCP uses the
same integration checks as the Mac.

## Task lifecycle hooks

**Settings > Lifecycle hooks** defines reusable hooks. Project settings show the same
hooks and let each field inherit or override independently. A global hook may contain
only an AI/group and prompt while remaining disabled. A project can enable it and
select its events without copying the AI or prompt. Explicit off, an empty selection,
and empty text override inherited values; resetting overrides follows global changes again.
Project-only hooks are supported too.

Actions are a fresh AI session or a shell command (`/bin/sh -c`). Prompts are sent
literally: Quuu inserts no diff, task text, or template variables into the prompt.
Commands receive `QUUU_TASK_ID`, `QUUU_PROJECT`, `QUUU_RUN_ID`, `QUUU_HOOK_ID`, and
`QUUU_HOOK_EVENT` as environment variables. Both run in the task's observed working
directory, including a managed worktree, with the project's commit identity.
The commit preset starts disabled; select its AI before enabling it.

Events include creation, queueing, holding, agent start/stop, review, failure,
before completion, completion, reopening, archiving, restoring, and deletion.
Agent stop includes success, cancellation, failures and limits, so a retry can cause
another stop event. Initial historical imports do not replay creation events.
A transition to the same state does not fire again.

- **Before completion** runs before worktree integration. Its failure keeps the task
  in Review. Use it when a commit must exist before the human's Done action finishes.
- **Completed** runs after Done and worktree integration, in the project directory
  when the managed worktree has been removed.
- **Deleted** runs after task deletion, in the project directory. Existing hooks are
  stopped before a task's worktree is discarded. Their history survives deletion.
- Hooks execute in definition order, one at a time per project. Except for the
  explicit Agent started event, they wait for active task runs in that project.
  New task runs wait for outstanding hooks. Hook agents respect their concurrency and
  cooldown; reports retain their existing independent capacity. Hook failures are recorded; they do not
  automatically repeat a command or mark a task Done.

The chat shows hook status, literal instructions and output. Supported stream-based
AI logs use the existing conversation renderer; commands and other logs show their
raw output. The preview is bounded to the latest 64 KiB; Open full log opens the
saved output. Stop and Run again are explicit actions. Settings retains the latest
100 executions, including deleted tasks. The `hooks.list`, `hooks.log`, `hooks.resolve`,
`hooks.cancel`, and `hooks.retry` operations are also available through CLI and MCP.

Detached hooks survive app restarts. Queued definitions are snapshots of the settings
at the event, and their execution records are saved with that transition. Unknown
interrupted starts fail visibly instead of being replayed. Timeouts apply across
restarts too.

Task reports are a built-in review hook. Their request waits for custom hooks and
survives restart; their agent, output contract, revision deduplication, and report
settings remain owned by Quuu. Project assessments keep their daily schedule. The
hook settings show this built-in behavior without exposing its system prompt or
trigger as an editable custom hook.

## Remote Runners

Quuu can dispatch new tasks to a paired Linux Runner when a project permits it.
Enable Runner connections in Settings → Connections, issue a PIN, and start the
Runner with Quuu's LAN URL and certificate fingerprint. The project needs a Git
remote and the Runner needs the task, hook and task-report agents installed and
authenticated. Eligible Runners are preferred; existing conversations keep their
original computer. A disconnected Runner's work waits for reconnection.

The Runner owns an independent Git clone per task. Quuu owns scheduling, hooks,
reports, cancellation and review. Changes return through Git or PRs. Local-only
changes are not copied. GitHub App private keys stay in Quuu; active jobs receive
short-lived, repository-scoped installation tokens.

See [Runner image and operation instructions](../containers/runner/README.md) for
Docker builds, pairing, persistent storage and lifecycle limits. The local API
exposes `runners.status`, `runners.configure`, `runners.pairing` and `runners.revoke`.
