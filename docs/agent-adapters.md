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
Normal completion and restart recovery call the same adapter. Claude model limits
without a reset time retain the existing observed-week estimate, now owned by the
Claude adapter. Without evidence, the configured cooldown remains the fallback.

The [Claude CLI documentation](https://code.claude.com/docs/en/headless) describes
text, JSON and stream-JSON outputs. The diagnostic above is local observed evidence,
not a promised universal message format.

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
