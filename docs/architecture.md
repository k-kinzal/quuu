# Quuu Structural Design Proposal

Surveyed at: `540685d`. Design approved: `3556785`. Implemented and revised: 2026-09-06.

**The approved structure is now in place. The current file layout and the boundaries under inspection are encoded in the architecture check (`scripts/architecture/policy.mjs`, run via `npm run check:architecture`).**
This document supersedes the earlier proposal.
Below, the user's stated requirements, the claims of external sources, and the design decisions applied to Quuu are kept distinct.
[AGENTS.md](../AGENTS.md) and the boundary checks were also revised to match this design's responsibilities and contracts.

The Agent integration boundaries were revised on 2026-09-23. See [Agent integration](agent-adapters.md) for the implemented CLI/Adapter split, compatibility guarantees and verification sequence.

## 1. Target state and scope of the design

The goal is to put this Electron + React app for managing AI agents into a state where a change and its impact can be traced.
Choose a structure in which someone fixing a task operation can find its acceptance conditions, state changes, persistence, and tests inside the owning feature.

Conditions the user stated explicitly:

- The Design System does not depend on Quuu's vocabulary, states, or app implementation.
- Views display state. No domain-ui is created.
- `shared` is forbidden. The existing directory and alias are migration targets too.
- Choosing strict DDD is not itself a goal. If a domain is adopted as an independent boundary, it must have substance.
- Prioritize fixability and conformance to the conventions of the language and frameworks.

This proposal adopts no independent domain; business rules are implemented as ordinary application operations.
An operation coordinates the persistence and execution it needs, and splits complex decisions into functions within its feature.
That code is not billed as a DDD implementation or a finished domain layer.
Building a general-purpose iCloud library, a DI container, or a four-layer template stamped onto every feature is out of scope.

## 2. What the sources actually support

| Primary source | What the source shows | Decision adopted for Quuu |
|---|---|---|
| [electron-vite: Project Structure](https://electron-vite.org/guide/dev#project-structure) | main / preload / renderer as build entry points within one app | Keep the existing three entry points. Do not present internal feature names or layout as official recommendations |
| [Fowler: Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | Logical separation of presentation, business decisions, and data access. The units of separation are not necessarily units of distribution | Presentation lives in the renderer, business operations in the owning feature in main, SQL in db |
| [Fowler: Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html) | Gather the processing for one request into a procedure, splitting work into functions as needed | Implement operations such as create, edit, and approve as plain TypeScript procedures. Do not build a DDD type system first |
| [Electron: Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) | The preload exposes a limited API and gives that API type declarations | Declare the preload's public contract in one place. It is the contract of the communication entry point, not the master source of every type in the app |
| [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Avoid contradictory, duplicated, and needless derived state | In the renderer, keep received state distinct from in-progress input and selection state. Derive displayable values where needed |

The referenced electron-vite page is v5; Quuu depends on the v2 line. Only the entry-point structure is adopted here — no upgrade or v5-specific configuration is proposed.
The concrete directory names are decisions from applying the principles above to this product, not a claim that the sources publish the same tree.

## 3. Workspaces and layout

There are three workspaces: `apps/mac`, `apps/mobile`, and `packages/design-system`.
The two apps are separate distributables, and the Design System is a UI kit whose independence was explicitly required.
No source imports between apps.
Nor is `shared` renamed to `common`, `core`, `lib`, or the like to keep a dumping ground alive.

The main layout is as follows. Existing files move while keeping their owning feature; small features do not get empty scaffolding for symmetry.

```text
apps/mac/
  src/
    main/
      index.ts                    # Electron entry point
      bootstrap.ts                # Wires DB, features, communication, notifications
      windows.ts                  # Window creation, teardown, OS display areas
      menus.ts                    # Connects native menus to operations
      ipc/                        # main-side reception, validation, responses, notifications
      taskApi.ts                  # Socket API reception for the existing CLI
      tasks/
        operations.ts             # Create, edit, hold, approve, send back, etc.
        conditions.ts             # Decisions the operations need. Public operations always go through these
        types.ts                  # Task information used inside main
      execution/
        scheduler.ts              # Coordinates candidates, execution slots, retries
        runner.ts                 # Launch, cancel, observation of external processes
        recovery.ts               # Re-adoption after restart and applying results
      automation/                 # Automations and cron. Validation and next-run queries
      agents/                     # Agent definitions, configuration and compatibility
      agent-clis/                 # Native CLI syntax and invocation defaults, per CLI
      agent-adapters/             # Provider errors, sessions and logs translated for Quuu
      projects/                   # Project settings and operations
      settings/                   # Settings, identity resolution
      session/                    # Session-log parsing and subscription
      import/                     # Importing external sessions
      review/                     # Fetching review information from Git and the like
      terminal/                   # Terminal operations and lifetimes
      mobile-sync/
        exportSnapshot.ts         # Converts Mac state to the wire format and writes it out
        importIntent.ts           # Validates requests and hands them to the matching app operation
        appPublisher.ts           # Serves the Web assets for the iPhone
      db/                         # DB connection, SQL, persistence and queries, migrations
      platform/                   # Concrete bindings to OS, files, processes, etc.
    preload/
      index.ts                    # contextBridge exposure
      api.ts                      # Types of the requests, responses, and notifications promised to the renderer
      channels.ts                 # Channel names used by this bridge
    renderer/
      index.html
      src/
        main.tsx
        App.tsx
        views/
        components/
        state/                    # Received state, selection, drafts, subscriptions
        interaction/              # Connects user input to operations
        model/                    # Display wording, filtering, display computations
        ui/                       # Design System composition and assignment of meaning
apps/mobile/
  src/
    views/
    components/
    state/
    model/
    ui/
    sync/
      readSnapshot.ts             # Validates and reads the received information it needs
      writeIntent.ts              # Builds and writes out the user's requests
      receipts.ts                 # Imports the results of applied requests
      projection.ts               # Overlays not-yet-applied operations onto the display
      appUpdates.ts               # Interprets information about the served Web assets
    bridge/                       # Communication with Swift, plus the browser-testing stand-in
  ios/                            # iCloud OS APIs, coordinated reads/writes, WebView
packages/
  design-system/
tests/
  mobile-sync.compat.test.ts      # Compatibility check wiring both ends' implementations together
  fixtures/mobile-sync/           # Pinned examples of the existing formats kept compatible
```

## 4. Owner of the public contract inside the Mac app

`preload/contract.ts` defines the requests, success responses, and failures of the public operations with oRPC.
The wire types are derived from the Zod schemas in `api/`, and `api.ts` exposes the generated client's types.
Rather than main's operations depending on the preload, main's IPC reception uses `implement(contract)` to
connect the public operations to their owning features. No home-grown channel mapping table or argument validators.

The renderer uses client types derived from this contract. The preload passes the main frame's
MessagePort to main, and main verifies the sender before connecting it to the official adapter.
Node, Electron, and main's business implementation are never handed to the renderer.
Notification senders and subscribers likewise derive their types from the definitions in `preload/events.ts`.
Business-level operation failures come back as errors carrying a reason, and the View displays the operation name and the reason.
Input and persistence state are tied together with TanStack Query mutations; failure does not discard the input.

What is adopted: [oRPC's contract-first](https://v1.orpc.dev/docs/contract-first/implement-contract),
the [official Electron adapter](https://v1.orpc.dev/docs/adapters/electron),
[Electron's sender validation](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages),
and [TanStack Query mutations](https://tanstack.com/query/v5/docs/framework/react/guides/mutations).
Placing this in `preload/` is a Quuu-specific decision that makes this public opening the owner.

Mocks implement the same contract, verifying that the generated client can receive both success and failure.
On top of that, verify that screen input reaches persistence and display, and that on failure the input and a way back remain.
Conforming to the wire format and business operations producing the expected result are guaranteed by their respective responsibilities.
The concrete layout and inspection targets are encoded in the architecture check (`scripts/architecture/policy.mjs`).

## 5. Mac and iPhone are connected by a protocol

The Mac finalizes state. The iPhone displays the received state plus operations waiting to be sent.
What ties them together is a contract of versioned JSON and file layout, not each other's internal source or a Task type.
The public spec is [mobile-sync.md](mobile-sync.md). The Mac's mobile-sync owns it, and compatibility tests bind the fields and operations the iPhone uses to that spec.

The Mac defines the export format and the requests it accepts.
The iPhone defines the information it reads and the requests it sends.
Only the iPhone reflects pending operations into the display; only the Mac's owning operations make the business decision to apply them.
The folder permission, coordination, fetching, and change notification done by Swift stay on the far side of the current bridge.

The references are [Fowler's Tolerant Reader](https://martinfowler.com/bliki/TolerantReader.html) and
[Ian Robinson's Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html).
The idea used: keep reading closed inside the receiving end, and hold the consumer's needs as tests that are checked whenever the provider changes.
These are originally about service integration, not sources that prescribe an Electron project layout.
They apply because this communication too runs between apps updated at different times and must handle messages that arrive late.

Tolerance on receipt is limited to things like unneeded extra fields.
Unknown operations, missing required fields, states it cannot understand, and unsupported versions are never reinterpreted into some other meaning and applied.

### Cost of the chosen approach, and alternatives

Some of the wire types and read/write code exists on each end. Changing a single TypeScript type is no longer the whole job.
The existing wire formats are kept as pinned examples, and the Mac's actual writer → the iPhone's reader and
the iPhone's writer → the Mac's reader are checked. Tests that pass only because both current ends changed together are not enough.

| Option | Cost and decision |
|---|---|
| Independent package for types and codecs | Keeps the declaration in one place, which is a benefit. But maintaining a Quuu-specific wire protocol as an extra package is a design not chosen this time |
| Import the other app's source | Fewer files, but app-internal dependencies cross the boundary. Not adopted |
| Build a general-purpose icloud-sync | Could become an independent capability, but would require redesigning the current API and OS implementation. Too large for this round's fixability improvements |
| Each app implements its own protocol end, with compatibility checks | Adopted. Explicitly pays the cost of a small duplicated wire definition plus verification, and exposes no internal models or rules to the other app |

A shared package would still need version-compatibility verification.
This choice is not held up as the one universally correct form; it is a decision for the current two protocol ends and maintenance scope.

## 6. Contracts between operations, execution, and persistence

`tasks/operations.ts` holds the entry points that change tasks and delegates the conditions for state changes to `conditions.ts`.
Operations proceed through the DB's persistence and query contracts. This is not called a domain.
SQL stays closed inside db; arbitrary status rewrites are not scattered across callers.
The persistence contracts needed are defined from the demands of the operations that use them; no generic Repository shared by every feature.

IPC, the CLI, and sync each convert their input format into a request to the owning operation.
Even when they attach latency or duplication information, the conditions of a business operation with one meaning are not implemented in several places.
execution asks tasks' operations to record run starts and ends; tasks knows nothing of the scheduler's concrete implementation.
Waking the scheduler and notifying the screen are wired in bootstrap.
External-session import does not masquerade as normal creation; it uses an explicit import operation.

The flow of the done operation:

```text
renderer → preload → main/ipc → done operation in tasks → db
CLI      → taskApi ──────────→ the same done operation
iPhone   → mobile-sync ──────→ the same done operation
```

- Handle which paths may request done and which run is the one being approved. A bare actor string is not proof of a human.
- Guard with a transaction or a conditional update so that the decision and the write apply to the same valid state.
- Rejection is returned as distinct from success. Notify of updates only after the write is committed.
- Run start distinguishes request acceptance, launch preparation, and starting the real process. spawn cannot form one atomic operation with the DB.
- Keep acquiring an execution slot consistent with recording launch preparation, and recover from the records and process evidence when stopped partway.
- Applying a sync operation and recording its applied ID live in the same local transaction. A failed receipt-file write is recovered by resending.

These are not demands to introduce a new framework; they are conditions the existing critical operation paths must guarantee.
A passing unit test is not treated as proof of guarantees that extend to the OS and crashes.

## 7. Lifetimes and display

| Owner | State and resources owned | Handling at shutdown |
|---|---|---|
| App-startup assembly | DB, scheduler, sync, import | Closed and released at app exit |
| App session index | Incremental log ingestion, durable conversation pages and review evidence | Timers and parsing are stopped at app exit |
| Window / subscription | Conversation page range and index notification targets | Released on window teardown or unsubscribe |
| renderer | Selection, in-progress input, display state | Follows the UI's lifetime. Drafts that matter are saved |
| Execution management | Mapping between Runs and external processes | Re-adopted after app restart |
| External agents | Detached processes, output to files | Not canceled by app exit |

Even among main's possessions, a subscription needed only by one window does not become an app-wide singleton.
Avoid long blocks of main. Heavy work goes async or to a worker as measurement dictates, but
agents that run across restarts are never replaced with child processes that die with the app.
[Electron: Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model),
[Performance](https://www.electronjs.org/docs/latest/tutorial/performance#3-blocking-the-main-process).

The mapping from View state to wording, color, and shape lives in the renderer's display model and ui.
Native menu display is owned by main/menus.
The same product terms stay consistent, but no business layer or new UI package is created to achieve that.
The current explicit requirements around Design System parts, tokens, and composition are kept.

## 8. Where the current code goes

| Current | Owner and how it moves |
|---|---|
| packages/domain | Split into task operation conditions, execution run conditions, automation evaluation, and so on. Wire types and display constants are declared where each is used |
| packages/contracts | Split into main-internal launch/persistence information and the preload public API. No wholesale re-export |
| packages/review | Fetching and Git interpretation go to main/review, display trees and selection conversion to renderer/model, wire types to preload/api |
| packages/sync | Export and import go to the Mac's mobile-sync, projection to mobile/sync. Split into per-end codecs and compatibility tests |
| main/app.ts | Startup assembly to bootstrap, operations to their owning features. Not just relocating a giant facade |
| main/db/repo.ts | Keeps the SQL. Business decisions return to their owning operations. Split into per-entity files as needed |
| shared/cron.ts | main/automation. The screen's next-run preview uses automation's query API |
| shared/agentCli.ts, agentCatalog.ts, agentDefaults.ts | main/agents. Screens that need CLI names, resume methods, or initial settings receive purpose-fit information through the API |
| shared/commitIdentity.ts | main/settings. Owns identity resolution and settings validation; the screen preview connects to a query API |
| shared/projectDefaults.ts | Defaults at project creation go to main/projects, display of color candidates to the renderer. Do not conflate the saved color with the screen's candidates |
| shared/planSummary.ts | Interpreting plans in logs goes to main/session, the display summary text to renderer/model. Parsed items are passed as wire data |
| shared/presentation.ts | The used parts move to the React display models and main/menus. Business operations do not depend on it |
| shared/window.ts | OS button positions and occupied areas are owned by main/windows and passed through the API. The renderer owns laying out the display to avoid those areas |

The preview query APIs carry request correlation so a stale reply cannot overwrite the latest input.
The in-progress input and loading states needed to make the display work are owned on the React side.

## 9. Checks and migration order

Structural checks are confined to concrete boundaries.

- No Design System → Quuu dependency.
- No source imports between apps.
- No renderer → main-implementation or preload → business-implementation dependencies.
- Nothing crosses processes as a direct import except the preload API types, the IPC reception contract, and the connection channels.
- tasks / execution / db do not depend on Electron's public API declarations or on Views.
- No references to the shared directory/alias or to the retired packages.
- Type checking matched to the runtime environments of main, preload, and renderer, dependencies included.
- Compatibility checks between the existing sync formats and both ends. No new dependencies or code generation.

First pin the existing entry points, behavior, and old wire formats with tests; then move the owning operations and the API layout.
Only after confirming both sync ends work with the existing formats are the references to sync/domain/contracts/review and shared deleted.
Verify display, launch, and subscriptions, then align AGENTS and the boundary rules with the adopted structure.
Each implementation task completes in the order check → commit → app:restart.

The current code shows the following spec differences. Do not silently settle on one side while moving code.

- The Mac's markDone writes done directly, while the sync side checks status and run count.
- The Mac's instruction editing rejects running, while the sync side restricts editing to not-yet-sent states.
- The Mac's unqueue goes to draft; sync's task.unqueue goes to held.
- Manual run and automatic pickup differ in their conditions.

Make explicit whether these are the same operation or operations with different intent before changing them.
Do not mix structural change and undecided product-spec change into one "cleanup".

## 10. Implementation and what was verified

The workspaces were consolidated to three: Mac, iPhone, and Design System.
Each operation, run condition, and persistence concern moved to its owning feature inside main, and the preload's public API is bound to the implementation contract at the reception point.
The Mac and iPhone each hold their own protocol end, with tests wiring the pinned old formats to the actual writers and readers.

Existing tests were kept, and the following guarantees added.

- From recovering a Codex session ID that appears after a long launch instruction, through to the expand/collapse display of conversation, thinking, and tools. A continuation run that failed by inheriting a wrong ID is also repaired, using the first log of the same conversation as evidence.
- Simultaneous persistence of the execution slot and the preparing Run, cancellation while preparing, and no late launches from an app that has exited.
- When the cancellation write is rolled back, the real process, state, and notifications are preserved (across restart, both before and after).
- Per-window session and terminal notifications, rejection of operations from other windows, and release when the window closes.
- Validation of sender and request values, plus type checking of the public API against main's responses.
- Old sync formats, resends, atomicity of a change with its applied ID, notification failure after a write, and the required information for the approval target.
- In previews, a reply to old input does not overwrite the current input.

With real Electron test data, chat display and expansion, task creation, editing, and state changes, and the settings screen were verified.
Verification runs with `npm run check` and `npm run build`. App updates follow the order check → commit → app:restart.
These verify the paths listed; they are not an exhaustive proof over every failure mode including the OS and iCloud delivery.
