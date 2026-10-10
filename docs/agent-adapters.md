# Agent integration

Quuu's launch path is **Agent definition → provider Adapter → CLI driver**.
The adapter interprets that provider's errors, session identity, conversation
records, external-session metadata and liveness evidence.

| Owner | Responsibility |
|---|---|
| `main/agents/` | User definitions, compatible CLI identity, settings and interactive-resume queries |
| `main/agent-clis/<provider>.ts` | Native command, initial/resume argument defaults, interactive resume and prompt syntax. No Quuu state or persistence |
| `main/agent-adapters/<provider>/` | Convert provider evidence into Quuu classifications and messages; locate/recover sessions; discover and probe external sessions |
| `main/agent-adapters/types.ts` | Invocation, classification, retry evidence, parser and session capabilities |
| `main/execution/` | Process lifetime, detached execution, slots, retry/fallback policy, task transitions and restart recovery |
| `main/session/` | Attach normalized identities to runs, index/watch messages, delivery evidence and window subscriptions |
| `main/import/` | Decide which normalized external sessions to import and apply task operations |

There is one adapter per supported CLI, plus the generic stdout adapter.
The registry is the entry into provider implementations from Quuu flows.
Parsers expose streaming or whole-store capabilities and optional image access;
the index and iPhone exporter do not test concrete parser classes.
The architecture check rejects provider imports from Quuu flows, CLI dependencies
on Quuu, and adapter dependencies on task operations or Quuu persistence.

The Runner still owns `spawn`, detached process groups, log descriptors and exit
files. These lifetime guarantees are independent of the CLI and are not copied
into every driver. Report launches use adapter invocation too.
Custom commands, wrappers, argument templates, environment and permission flags
remain explicit configuration; the adapter does not rewrite them at launch.

## The structured session log

A parser turns the provider's file into `SessionMessage` records (`main/session/types.ts`),
incrementally where the file is appended to and as a whole where it is rewritten (Cursor,
opencode). That record is the only thing the rest of Quuu reads about a conversation:

| What is read off it | Owner | Kept in |
|---|---|---|
| Pages of the conversation | `session/index.ts` | `session_messages` |
| Commit receipts and PR candidate URLs | `review/evidence.ts` | `task_review_evidence` |
| Where the agent worked (`cwd`, `cd`, `git -C`, `git worktree add`) | `session/workplace.ts` | `session_workdirs` |

The last two are `SessionDerivation`s (`session/derive.ts`). The index applies them inside the
transaction that persists each page, so the screen and what was derived from it never
disagree; when a rule changes, `DERIVATION_VERSION` is bumped and the durable pages are handed
back to every derivation without parsing a log again. When a parser starts reading something
new, its `parserVersion` is bumped instead: at startup the pages under the old version move to
the new key with an empty stamp, so a session whose file still exists is read again under the
new parser, and one whose file the CLI already deleted keeps the pages it has - they are the
only copy left. Pages leave only through retention (`retentionDays`, off by default), which
empties a session that has not changed within the period but keeps its row, its working
directories and everything it filed against the task.

PR candidates are not ownership facts. Git reflog provenance and GitHub's exact
head repository/SHA establish a durable association in `review/reconcilePullRequests.ts`.
Neither tool display labels nor JavaScript command matching can promote a candidate.
The incident, supported envelopes, replay guarantees and remaining limits are in
[Pull request evidence and verification](pull-request-evidence.md).

Whatever a rule needs has to arrive on the record. The working directory is the example: it
used to be scanned out of the raw file with a regular expression, which matched Claude's
`"cwd"` and a `cd` inside a command but not the `workdir` Codex names on each command instead
of moving, so a Codex task that did all its work in a worktree opened its terminal on `main`.
Now Claude stamps `cwd` on every message, Codex on every message with the command's own
`workdir` first, Copilot with the directory its session started in, and the rule reads only
that and the commands the agent ran.

Run classification (a limit, a failure, a cancel) stays where it was: the adapter reads the
CLI's output at exit (`classify`) and the runner hands the result to the scheduler as one
`finished` event.

## Fable and diagnostics

Fable uses the Claude CLI driver and Claude adapter. Its model selection remains
in the existing argument templates; it needs neither a second session format nor
a new agent kind. A separately named Fable definition still owns its concurrency,
fallback and cooldown. The existing adapter selector and custom limit patterns
cover wrappers that cannot be identified by command name.

Claude-specific diagnostics and failed JSON result envelopes are interpreted in
`agent-adapters/claude/result.ts`. Native limits are recognized independently of
custom patterns. Successful output discussing a limit remains successful.
Cancellation and timeout retain precedence. Other adapters retain their previous
generic classification until there is provider-specific evidence to translate.

The observed Fable failure on 2026-09-23 was:

```text
You've hit your session limit · resets 10:40pm (Asia/Tokyo)
```

Its reset time reaches the scheduler, which applies cooldown and parks the task.
Weekly limits also join a date to the clock with `at`, for example
`You've hit your weekly limit · resets Sep 28 at 7pm (Asia/Tokyo)`.
This waits until September 28 at 19:00, without adding the configured cooldown.
On restart, queued limited runs with a matching saved cooldown are checked against
their recorded diagnostic. A newly readable reset extends a shorter guessed wait;
relative times are anchored to the run's end, and later human schedules are kept.
Normal completion and restart recovery call the same adapter. Claude model limits
without a reset time retain the existing observed-week estimate, now owned by the
Claude adapter. Without evidence, the configured cooldown remains the fallback.

The [Claude CLI documentation](https://code.claude.com/docs/en/headless) describes
text, JSON and stream-JSON outputs. The diagnostic above is local observed evidence,
not a promised universal message format.

## Pi

Pi uses its JSON event stream for run classification and its persisted v3 JSONL session
for conversation history. The defaults require Pi 1.1+ (`--session-id` for a new run,
`--session` for follow-ups). `--approve` trusts project resources in unattended runs.
Pi may exit zero after an assistant error in JSON mode, so the adapter reads terminal
assistant events, including recovered exits, and lets a later successful retry supersede
an earlier error. Different Pi definitions can select different providers, so an error
does not establish a shared account allowance across those definitions.

Logs have a timestamped filename under an encoded working-directory folder; the header
supplies the exact ID and cwd. Discovery validates that cwd because directory encoding is
lossy. The parser preserves human input, thinking, tools/results, images and cwd; summaries
and displayed extension context are system messages. External-session liveness uses mtime
because the file has no process-lifetime marker. Pi treats an argument starting with `@`
as a file reference even after `--`; the defaults retain that native CLI behavior.

Verified against installed Pi 1.1.0 with an isolated configuration and a local simulated
OpenAI-compatible endpoint: initial execution, a real file-writing tool call, session
resume with both human messages retained, and an authentication error with exit code zero.
No real provider credentials or production tasks are used for this verification.
References: [CLI integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md),
[session format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md).

## Durable identity and compatibility

Schema v27 records `log_adapter` and `limit_patterns` on each Run. Editing the
Agent definition changes future runs only. Old conversations and detached results
use the adapter and patterns recorded at launch.
The migration preserves tasks and runs, freezes available configuration, and uses
recorded external provenance/CLI when a definition already names another CLI.
Historical custom settings that were never recorded cannot be reconstructed;
this limitation applies to migration from older versions.

Session recovery is scoped to the provider's storage. Grok and Cursor cannot adopt
a Claude session just because it appeared in the same working directory.
Task CLI lineage, continuation eligibility, delivery deduplication, injected-message
attribution, ordering and human-only completion policies keep their existing owners.

## Verification sequence

Before moving implementation, `npm run check` passed 1,672 tests. Added boundary
characterization tests lock resume, prompt spelling, established classification and
human-vs-injected messages. With structural changes alone, the gate passed all
1,691 tests.

Then `agentAdapterRegression.test.ts` reproduced eight failures before fixes:
Fable detection, custom-pattern interaction, JSON result failure, live/recovered
automatic waiting, mutable historical adapter selection, and Grok/Cursor adopting
Claude sessions. These are explicit behavior repairs, separate from the move.
Two further failing display tests exposed the same initial instruction being labeled
unsent after failure or automatic requeue despite session delivery evidence. The
display now applies the same evidence as follow-ups.
Migration tests verify preservation and reopening. Existing integration tests
exercise real local processes, restart survival, cancellation, native log formats
and continuation policy.

Tests use isolated directories and stub CLIs. They spend no provider quota and
create no tasks in production.
