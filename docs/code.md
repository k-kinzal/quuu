# Code rules

Conventions for code in this repository. Architecture decisions and the checks that
enforce them live in [architecture.md](architecture.md) and
[scripts/architecture/policy.mjs](../scripts/architecture/policy.mjs).

## Rules

- **Logic is 100% in the main process.** The renderer does display and input only. Windows
  can be destroyed at any time.
- **A task never changes CLI.** The first CLI that actually read a task (`taskLineage`: a run
  the CLI accepted, not one turned away at a limit or never spawned) takes every run after it,
  fresh sessions included, and a conversation is resumed by the agent that opened it. Never
  widen the candidates around this — not for a free slot, a cooldown, a failure that asks for
  another agent, or an explicit pick. A Codex conversation handed to `claude` is broken work,
  and it happened once.
- **A per-task agent pick is binding.** `agentOverrideId` names the whole field: that agent and
  its own fallback chain. The project's target never stands in for a pick that is busy; the task
  waits, and the wait names the agent. A task set to Codex that opened on Fable because Codex's
  slot was taken is how a Claude lineage got stamped on Codex work, and it happened.
- **Done (`done`) is a human's call.** Neither the scheduler, nor agents, nor error handlers
  ever write `done`. A normal agent exit can reach `review` at most.
- **Never ask a human in the normal path.** Limits fall back automatically. Hand things to a
  human only when hands are genuinely needed.
- Comments are written in English and explain **why**. What the code does is readable from
  the code.
- **User-facing copy never appears as a hardcoded string.** It lives in each side's i18next
  resources — `renderer/src/model/i18n/` for Mac screens, `main/i18n/` for menus,
  notifications, and IPC failure reasons, `mobile/src/model/i18n/` for the iPhone — with
  English as the source language and Japanese maintained alongside (the `ja` file is typed
  against `en`, so a missing key fails typecheck). The language follows the OS and is fixed
  at process start. The design system carries only its own generic strings (`DsStrings`);
  apps hand it a pack via `ThemeProvider strings`. Dev-facing text (logs, internal errors)
  stays plain English in code.
- **No Quuu vocabulary in the design system.** `@design-system/react` carries only what
  means the same thing in any app. Putting domain words like "Review" or "priority" into it
  would let the design system dictate Quuu's vocabulary.
- **Views render domain state.** State → shape/color lives in each app's `ui/StatusDot.tsx`
  and `ui/theme.ts`; copy, display order, and filtering belong to the View's display model.
  Do not attach UI to the domain.
- **Business operations are owned by their main-process feature.** Create/edit/approve in
  `main/tasks/`, execution slots/launch/recovery in `main/execution/`, automation in
  `main/automation/`. Decide and persist in the same transaction; notify and launch after
  the commit. No domain package.
- **`shared` is forbidden.** Do not grow packages by category of processing; put code with
  its meaningful owner. The IPC operation contract lives in `preload/contract.ts`, generated
  client types in `preload/api.ts`, the sync wire format in [mobile-sync.md](mobile-sync.md).
  Cross-app source imports, and Design System imports of app types, are forbidden too.
- **`ui/` does not implement decoration either.** Composing custom React components and
  assigning meaning is fine. If a generic display rule is missing, feed the reason back via
  [design-system-feedback.md](design-system-feedback.md) and let the Design System accept or
  reject it. Never adjust from the consumer side with `sx` / `style` / `styled`.
- **Screens (`components/` `views/`) contain no appearance.** They only **compose** what the
  design system and `ui/` provide ([design-system.md](design-system.md)).
- **If you change appearance, check it in Storybook.** `npm run storybook`
- Keyboard shortcuts are defined in exactly one place: the native menus
  (`apps/mac/src/main/menus.ts`).
- If you change the DB schema, write a migration (`db/database.ts`,
  `apps/mac/tests/migration.test.ts`).
- IPC is oRPC + Zod; in-flight/success/failure state uses TanStack Query (adopted at the
  user's direction). Do not hand-roll contract/client/mock mappings or transport.
- Do not add other dependencies. No native modules (SQLite is `node:sqlite`).
  **The exception is conversation rendering** (`react-markdown` / `remark-*` / `shiki` /
  `mermaid`): notation, grammar, and diagrams are detailed specs where a homegrown
  approximation renders lies, so accuracy won and the user chose to add them. Do not fold
  these back into homegrown implementations.

## Map of the tree

npm workspaces. **Run commands at the repo root** (`npm run dev` / `check` / `app:restart`
delegate into the workspaces). One run of the quality gate at the root covers everything.

```
apps/mac/            macOS app (Electron)
apps/mobile/         iPhone app (screens in React, shell in Swift / WKWebView)
packages/            the independent Design System
```

| Path | Role |
|------|------|
| `packages/design-system/` | MUI-based UI kit. **No domain.** Dimensions come in two density axes (`compact` / `comfortable`) |
| `apps/mac/src/main/mobile-sync/` | Mac-side export and import. Applying always goes **through the app's regular operations** |
| `apps/mobile/src/bridge/` | the seam to the shell. Screens know nothing else (the fake iCloud for browsers lives here too) |
| `apps/mobile/ios/Quuu/` | the native shell. Holds only folder permission, coordinated reads/writes, and change notification |

| Path | Role |
|------|------|
| `apps/mac/src/main/execution/scheduler.ts` | conditional acquisition, end-of-run policy, consistency recovery at startup |
| `apps/mac/src/main/automation/evaluate.ts` | evaluation of automations (definitions that enqueue tasks when conditions line up) |
| `apps/mac/src/main/report/` | the change report: when one is written, and what the writing agent is told. **Touches no task state, holds no execution slot** |
| `apps/mac/src/main/platform/reportViews.ts` | shows a generated page. Static documents only — its session refuses every request that is not the report file |
| `apps/mac/src/main/execution/runner.ts` | agent launch, cancel, exit classification (restart resilience lives here) |
| `apps/mac/src/main/platform/runProcess.ts` | process-group operations, reading log tails and exit codes |
| `apps/mac/src/main/agent-adapters/` | Per-provider errors, logs, session identity and liveness translated to Quuu contracts |
| `apps/mac/src/main/agent-adapters/limitWindow.ts` / `claude/weeklyWindow.ts` | when a Limit lifts: read out of what the CLI printed, or — for a limit on one model, which never prints one — off the week that model's share belongs to |
| `apps/mac/src/main/nativeMenu.ts` | lets the OS draw menus the screens request. **Never draw menus inside the window** |
| `apps/mac/src/main/contextMenu.ts` | right-click for inputs, selection, links (a base with no app vocabulary) |
| `apps/mac/src/main/db/repo.ts` | SQL is confined here. No raw SQL anywhere else |
| `apps/mac/src/main/session/logAdapters.ts` | Provider-independent session lookup through the adapter registry |
| `apps/mac/src/main/agents/cli.ts` | CLI compatibility queries; native syntax lives per provider in `main/agent-clis/` |
| `apps/mac/src/main/agent-adapters/opencode/store.ts` | the one CLI whose sessions are **not files**: opencode keeps every session in a single SQLite store, so it is named by id, never by path |
| `apps/mac/src/main/platform/terminal.ts` | opens a terminal (writes a `.command`, hands it to `open`) |
| `apps/mac/src/main/platform/editorApps.ts` | finds and opens installed IDEs / editors |
| `apps/mac/src/main/platform/launch.ts` | the single `open(1)` path. **The reason we don't use AppleScript is documented here** |
| `apps/mac/src/main/automation/cron.ts` | homegrown cron parser, kept only to compute the next allowed enqueue time |
| `apps/mac/src/main/tasks/ordering.ts` | acquisition order and prerequisites. Consistency with display order is tested too |
| `apps/mac/src/main/import/` | importing sessions that were launched directly |
| `apps/mac/src/main/session/` | session attachment, indexing and tailing (provider parsers belong to adapters) |
| `packages/design-system/` | MUI-based design system (`@design-system/react`). **No domain** |
| `apps/mac/src/renderer/src/ui/` | display that belongs to Views (status marks, conversation, run history). Sits on top of the design system |
| `apps/mac/src/renderer/src/` | React screens. State is centralized in `state/store.ts`. **No CSS** |
| `brand/icon.icon/` | the icon **master (one per product)**. Mac and iPhone artifacts are generated from here |

To touch the icon, edit only `brand/icon.icon` and regenerate with `npm run icon`.
Never replace `icon.png` / `icon.icns` / `Assets.car` directly (they are wiped the next
time someone runs `npm run icon`). **Never keep two pictures** — one product wearing
different faces per device is invisible until you see both side by side.
Details in the [guide](guide.md#icon).

## iPhone app

`apps/mobile`. **Screens are React (using the design system as-is); the shell is Swift.**
It mirrors the Mac's "logic in main, renderer displays and inputs": on iPhone, **the OS is
Swift's job; assembly and screens are the Web's**.

```sh
npm run mobile:dev    # open in a browser (runs on a fake iCloud; no device needed)
npm run mobile:build  # build the screens
npm run ios:build     # build for the simulator, prove it compiles
npm run ios:open      # open in Xcode
```

- **Display copy is owned by the View.** State follows the wire protocol; each app's display
  model owns the wording and scopes. Keep the established product terms
  (`apps/mobile/tests/scope.test.ts`).
- **Never put the app's name on a screen.** The user already knew it when they tapped the
  home-screen icon.
- **Nothing switches instantly except tabs.** A screen opened by a tap slides in from the
  right and returns to the right (`NavStack`). Choosing surfaces rise from the bottom
  (`Sheet`).
- **Arrange things the iOS way.** Two kinds of bars (large title / centered title + `‹`),
  lists as inset groups. Screen assembly lives in the app; the drawing rules for its
  materials live in the Design System (ScreenFrame / InsetGroup / NavigationTransition …).
- **No dimensions in screens.** Touch surfaces get `density="comfortable"` set in one
  place. Write only the step name (`theme.density.control.sm`) and the actual size follows.
  Anywhere you write px, that one screen drops out of the density system.
- **No decisions in Swift.** The iPhone's `src/sync/` composes requests; the Mac's task
  operations decide whether to apply them. Swift handles OS reads/writes, coordination, and
  change notification.
- **Screen assembly is not shared with the Mac.** Folding the 4-pane layout onto a phone is
  bad for both. What is shared is the product display rule — "the same state appears in the
  same color with the same words." Implementations live in each View; no shared UI in the
  business layer.
- Baked-in screens ship under **a custom scheme** (`quuu://app`). With `file://`, neither ES
  modules nor CSP nor `localStorage` work (`ios/Quuu/WebAssets.swift`).
- Info.plist is not left to auto-generation. The generated scene config is empty and **the
  app launches to nothing** (the reason is written in `ios/Info.plist`).
- Screen-side exceptions are piped to the shell's log. Never create "a black screen with no
  reason recorded."
