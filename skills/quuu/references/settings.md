# App settings

App-wide preferences. Read them, then send only what changes:

```sh
quuu settings get
quuu settings set '{"notifyOnReview":true,"notifyOnFailure":true}'
quuu describe settings.set
```

A project-level setting overrides the app's for that project ([projects](projects.md)).

## Use cases

| Request | Fields |
|---|---|
| pause / resume all execution now | `quuu scheduler pause` / `quuu scheduler resume` (running agents continue) |
| start paused after launch | `autoStartScheduler` |
| keep running with the window closed | `keepRunningInBackground` |
| notifications | `notifyOnReview`, `notifyOnFailure` |
| isolate new tasks in Git worktrees | `worktreeEnabled` (projects can override with `worktreeMode`) |
| import sessions started outside Quuu | `importExternalSessions`, `importHistoryDays` (0 = all), `importCreateProjects`; `quuu importer sync` imports now |
| how long recorded history is kept | `retentionDays`: conversations, the review each run left, replaced report pages (0 = forever, the default) |
| iPhone sync over iCloud Drive | `mobileSyncEnabled`; `quuu mobile status`, `quuu mobile sync-now` |
| appearance | `theme`: `dark`, `light`, `system` |
| default IDE | `editorApp` (absolute `.app` path; `quuu open editors` lists them) |
| change reports and daily assessments | `reportEnabled`, `reportTargetKind` (`agent`/`group`), `reportTargetId`, `reportInstructions`, `projectReportInstructions` |
| send tasks back over Pull Requests | `pullRequestFailurePrompt` / `…PendingPrompt` / `…ConflictPrompt` and their `…Enabled` switches |
| scheduler tick | `tickIntervalMs` - leave it unless asked |
| lifecycle hooks | `taskHooks` - see [hooks](hooks.md) |

Reports cost one agent run per review; turn them on only when asked, and name the writer.

## GitHub identity

- `commitIdentityEnabled` hands agents the GitHub App identity for commits, pushes and `gh`.
- `quuu settings set-identity '{…}'` sets the default identity; preview with
  `quuu settings preview-identity '{"identity":{…}}'`.
- Creating or updating the GitHub App (`quuu settings create-git-hub-app`) opens a browser on the
  Mac and needs the person to approve it there. Start it only when asked, and tell them.

## Connections

`httpEnabled` / `httpPort` (the CLI) and `mcpEnabled` / `mcpPort` (MCP clients); port 0 picks
a free port each launch. `quuu servers status` shows what is listening and binding errors.
**Turning `httpEnabled` off disconnects this CLI**; only the desktop app (or MCP, if on) can turn
it back on. Do it only when asked, and last.

## Multiple computers

`quuu network status` shows whether this Quuu hosts other computers (`host`) or follows a host
(`satellite`). Pairing needs a person at both computers — the host shows a code
(`network open-pairing`) that is typed into the other one — so start it only when asked.
`network remove-device ID` ends a paired computer's access. These settings always act on the Quuu
that receives them.

## App information and updates

```sh
quuu app info                  # version, data directory, whether updates are available
quuu app check-for-updates     # the menu's "Check for Updates…"; any dialog appears on the Mac
```

## OpenTelemetry export

Off unless asked. `app.*` acts on the computer that receives it, and a change applies at once.
Send only the fields the request is about; `headers` and `resourceAttributes` replace the whole map.

```sh
quuu app telemetry
quuu app set-telemetry '{"enabled":true,"endpoint":"http://HOST:4318"}'
quuu app set-telemetry '{"enabled":false}'
```

`active` says whether it is exporting now; `override` names an environment variable (`QUUU_OTEL`,
`OTEL_SDK_DISABLED`) deciding instead of `enabled`. Header values are never read back. What is
recorded is in the repository's `docs/telemetry.md`.

Language follows macOS and is not a setting.
