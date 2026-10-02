# Telemetry (OpenTelemetry)

Quuu can export traces, logs and metrics over OTLP. **Off by default.** The data serves
two readers:

1. **Fixing bugs.** Every failure Quuu sees, with its stack, its cause chain and the
   operation or screen it happened in.
2. **Reading how kinzal uses Quuu.** What he does, where he stalls, and what he never
   touches: operations, screens, shortcuts, task lifecycles and agent runs.

The code lives in `apps/mac/src/main/telemetry/`. Every attribute and event name is listed
in `attributes.ts`.

## Turning it on

Use the CLI (or any caller of the operation contract). A change applies at once; no restart:

```sh
quuu app set-telemetry '{"enabled":true,"endpoint":"http://192.168.10.4:4318","resourceAttributes":{"host.name":"kinzal-mbp"}}'
quuu app telemetry          # saved choice, environment override, whether it is exporting, and each signal's last export
quuu app set-telemetry '{"enabled":false}'
```

| Field | Effect |
|-------|--------|
| `enabled` | Turns export on or off. `QUUU_OTEL=1`/`0` or `OTEL_SDK_DISABLED=true` in Quuu's environment win over it; `override` names the one deciding |
| `endpoint` | OTLP/HTTP base URL (`http`/`https`); `/v1/traces`, `/v1/metrics` and `/v1/logs` are appended |
| `headers` | Sent with every export (e.g. an auth token). Replaced whole; only the names are ever read back (`headerNames`) |
| `resourceAttributes` | Added to the resource, e.g. to tell two Macs apart. Replaced whole |

`lastExports` holds each signal's latest export since export started: when, whether the
collector took it, and its error. It is the place to look when nothing arrives; the
exporters report failures nowhere else.

A collector on the LAN needs macOS **Local Network** access for Quuu (System Settings ›
Privacy & Security › Local Network). Until it is allowed, every export fails and
`lastExports` shows `connect EHOSTUNREACH <collector>`, while the same address works
from a terminal (which carries the terminal's own access).

Only the fields a patch names change. The choice is this computer's own: it is kept in
`telemetry.json` in the data directory (mode 0600, written by the operation; do not edit it
by hand), not in the app settings a satellite reads from its host, and `app.*` operations
are always answered by the computer that receives them.

Without `endpoint`, the exporters fall back to the standard `OTEL_EXPORTER_OTLP_*`
variables. An `OTEL_EXPORTER_OTLP_ENDPOINT` left in a shell does **not** turn export
on: a stray variable is not consent. While export is off, the SDK is never loaded.
Transport is OTLP/HTTP with protobuf.

## What is never exported

Values describe **shape, not content.** Task titles, prompts, follow-ups, review notes,
file contents and agent output never leave the Mac. An operation records **which** fields
it received (`patch.fields: ["prompt"]`), never their values. A settings string is reported
only as whether it is set. The exceptions are deliberate: project and agent **names**
(chosen by kinzal, low cardinality, needed to read a dashboard), Quuu's own ids, and error
messages and stacks, which the bug-fixing reader needs.

## Resource

| Attribute | Value |
|-----------|-------|
| `service.name` | `quuu` |
| `service.version` | the app version |
| `service.instance.id` | random per launch, so one sitting can be told from the next |
| `deployment.environment.name` | `production` (packaged), `development` (`npm run dev`), `verification` (`QUUU_USER_DATA` set, i.e. fixtures) |
| `os.type`, `os.version`, `host.arch`, `process.runtime.*` | the machine |

**Filter on `deployment.environment.name="production"` when reading usage.** Verification
instances run fixtures, and a development build is someone working on Quuu.

## Traces

### Operation spans: one per operation call

Every call through the operation contract (window, CLI, MCP, satellite) is a `SERVER`
span named after the operation (`tasks.create`, `review.approve`, …).

| Attribute | Meaning |
|-----------|---------|
| `quuu.operation`, `quuu.operation.group` | `tasks.update`, `tasks` |
| `quuu.caller.kind` | `window` (a person at the Mac), `cli`, `mcp`, `satellite` (another paired computer) |
| `quuu.caller.agent_run`, `quuu.run.id` | true when the CLI was run by an agent Quuu launched (`QUUU_RUN_ID`) |
| `quuu.operation.route` | `local`, or `host` when a satellite forwarded it |
| `quuu.operation.input.fields`, `quuu.operation.patch.fields` | field names received |
| `quuu.operation.target_id`, `quuu.task.id`, `quuu.project.id` | Quuu ids in the input |
| `quuu.operation.result` | boolean outputs, e.g. whether a `system.confirm` was accepted |
| `error.type` + an `exception` event | on failure: the oRPC code and cause class (`OPERATION_FAILED:Error`, `BAD_REQUEST`), with message and stack |

Screens poll (the review refreshes every second), so **a successful call identical to
one the same caller made in the last minute is not traced again.** Failures are always
traced. The `quuu.operation.duration` metric still counts every call.

Logs emitted while an operation runs carry its trace id. A lifecycle event or a console
error therefore links to the call that caused it.

### Run spans: `quuu.run`

One span per finished agent run, from its real start to its real end. That includes runs
that ended while Quuu was closed, which are reported when recovery settles them. Each is
the root of its own trace. The status is `ERROR` for `failed` and `timeout`, with the
error message.

`quuu.run.id`, `.kind` (`initial`/`followup`), `.status`
(`succeeded`/`failed`/`limited`/`canceled`/`timeout`), `.attempt`, `.fallback`,
`.error_kind`, `.exit_code`, `.remote`, `.source`, `quuu.agent.id`, `.name`, `.adapter`
(`claude`, `codex`, …), `.group_id`, plus the task attributes below.

## Logs (events)

Every record has `event.name` (the OTel `EventName` field, and also an attribute for
backends that do not index the field yet).

| `event.name` | When | Attributes |
|--------------|------|------------|
| `quuu.app.started` | launch | `quuu.inventory.*`: projects, agents (enabled, adapters, with fallback), groups, rules, tasks per status |
| `quuu.settings.profile` | launch and every settings change | `quuu.settings.<key>`: booleans and numbers as-is, strings as `.set`, lists as `.count` |
| `quuu.app.focus` | a window gains or loses focus | `quuu.ui.focused` |
| `quuu.app.quit` | quit | none |
| `quuu.task.lifecycle` | after each committed task fact | `quuu.task.lifecycle` (`created`, `queued`, `held`, `started`, `stopped`, `review`, `failed`, `completed`, `reopened`, `archived`, `restored`, `deleted`), `quuu.task.id/.status/.priority/.source/.automated/.agent_pinned/.dependencies/.age_seconds`, `quuu.project.id/.name`, and the run attributes when a run is involved. `review`/`failed`/`completed` add `quuu.task.run_count` and `.followup_count` |
| `quuu.ui.screen` | the window shows a different place | `quuu.ui.screen` (`quuuAI`, `quuuAI/task`, `all`, `review/task`, `project/dashboard`, `settings/agents/agent`, …), `quuu.ui.previous_screen`, `quuu.ui.previous_duration_ms`, ids |
| `quuu.ui.action` | a UI-only change, settled for 1s | `quuu.ui.action` (`table`, `filters`, `layout`, `palette.open`), `quuu.ui.fields` |
| `quuu.ui.command` | a native-menu command | `quuu.ui.command` (`task.runNow`, `view.back`, …), `quuu.ui.trigger` (`shortcut`, `menu`, `notification`, `gesture`, `app`) |
| `quuu.notification` | a toast or OS notification | `quuu.notification.kind`, `.level` (never the text) |
| `quuu.error` | an uncaught error, unhandled rejection, a renderer render crash, or a renderer/helper process that died | `quuu.error.origin` (`main.uncaught`, `main.unhandled_rejection`, `main.render_process_gone`, `main.child_process_gone`, `renderer.uncaught`, `renderer.unhandled_rejection`, `renderer.render`), `exception.*`, `quuu.ui.screen` |
| `quuu.log` | every `console.warn` / `console.error` in main | `quuu.log.label` (the fixed leading text, for grouping), `exception.*` when an Error was logged |

## Metrics

| Instrument | Attributes |
|------------|------------|
| `quuu.operation.duration` (histogram, s) | `quuu.operation`, `quuu.caller.kind`, `quuu.caller.agent_run`, `error.type` |
| `quuu.run.duration` (histogram, s) | `quuu.agent.adapter`, `quuu.run.status`, `quuu.run.kind` |

## Reading it

Fixing bugs:

- Failed operations: `{ resource.service.name = "quuu" && status = error }`, grouped by
  `span.quuu.operation` and `span.error.type`.
- Crashes and complaints: `event_name` in `quuu.error`, then `quuu.log` at `ERROR`
  grouped by `quuu.log.label`. Follow the trace id to the operation that raised it.
- Runs that fail: `quuu.run` spans with status error, by `quuu.agent.adapter` and
  `quuu.run.error_kind`.

How Quuu is used (always restrict to `production` and `quuu.caller.kind = "window"`, or
`quuu.caller.agent_run = false` for the CLI):

- **What he does:** the operation-duration count per `quuu.operation`; screens by summed
  `quuu.ui.previous_duration_ms`; commands per `quuu.ui.command`.
- **Where he stalls:** failed `window` operations; `system.confirm` with
  `quuu.operation.result = false` (started, then backed out); tasks whose `completed`
  event has a high `quuu.task.followup_count` or `age_seconds`; `reopened` tasks;
  `limited` runs and `quuu.run.fallback = true`; the same screen pair flipping back and
  forth; `view.back` commands; `BAD_REQUEST` from agents (the CLI or skill misleads them).
- **What he never touches:** every operation in `apps/mac/src/api/contract.ts`, every
  screen, and every menu command with zero events over a window of time.
  `quuu.ui.trigger = "menu"` for a command that has a shortcut means the shortcut is
  not known. `quuu.settings.profile` and `quuu.inventory.*` show features that were never
  configured.

## Adding to it

- Add new names to `telemetry/attributes.ts` and to this document. Reuse a semantic
  convention key when one exists.
- Shape, not content. If a value might be something a person wrote, report its presence
  or its length.
- A feature reports a fact by calling `emitEvent` (or `recordError`) from
  `main/telemetry`. While telemetry is off these return immediately; anything costly to
  compute belongs behind `telemetryActive()`.
- Prefer an existing seam: operations are covered by the router, task facts by
  `repo.observeLifecycle`, and window state by `renderer/src/state/usage.ts`.
