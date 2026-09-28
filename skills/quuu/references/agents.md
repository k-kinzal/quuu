# Agents and groups

An **agent** is one runnable definition of a CLI: command, argument templates, environment,
parallelism, fallback, Limit detection and timeout. A **group** picks among agents. Projects,
tasks, rules, hooks and reports point at an agent or a group.

```sh
quuu agents list --query '[].{id:id,name:name,command:command,enabled:enabled,concurrency:concurrency,fallback:fallbackAgentId}'
quuu groups list
quuu scheduler status --query 'agents'    # slots in use and any Limit cooldown per agent
quuu describe agents.update
```

## Use cases

### Start using a CLI that is installed but disabled

Quuu adds definitions for installed CLIs disabled, so nothing runs or bills until chosen.

```sh
quuu agents update '{"id":"AGENT_ID","patch":{"enabled":true}}'
```

Then point a project or group at it ([projects](projects.md)). Check the command exists
first (`command -v codex`) and say so if it does not.

### Add a definition for another model of the same CLI

Duplicate the closest definition and change only what differs:

```sh
quuu agents duplicate AGENT_ID
quuu agents update '{"id":"NEW_ID","patch":{"name":"Claude Haiku","argsTemplate":[…],"resumeArgsTemplate":[…]}}'
```

The model is part of `argsTemplate` / `resumeArgsTemplate` (for Claude,
`--model <name>` appears in both; keep them consistent). Do not remove `{{prompt}}`,
`{{sessionId}}` or the flags that keep the run non-interactive; a run without them never
finishes or cannot be continued. `agents create` needs every field; duplicating is safer.

### Run more at once

`concurrency` is the number of parallel runs of that definition across all projects.

### Fall back to another agent on a Limit

`fallbackAgentId` names the next agent in the chain (`null` ends it). A task only falls back
to an agent of the **same CLI** once its conversation has started; a new task may start on
any agent in the chain.

### A Limit is over but tasks still wait

```sh
quuu agents reset-limit AGENT_ID
```

Only when the human says the account is back (plan changed, credits bought). Otherwise the
cooldown ends by itself. `cooldownSeconds` sets how long an unrecognized Limit waits;
`limitPatterns` (regexes; empty uses `quuu agents defaults`) decide what counts as one.

### Stop runs that hang

`timeoutSeconds` (0 = unlimited) ends a run that takes longer.

### Environment variables for an agent

`env` replaces the whole object: read the current value first and send the merged object.
Never write secrets you were not given into it, and never print existing values in a report.

### Groups

```sh
quuu groups create '{"name":"Fast","description":"","strategy":"least-busy","memberIds":["A","B"],"sortOrder":0}'
quuu groups update '{"id":"GROUP_ID","patch":{"memberIds":["A","B","C"]}}'
quuu groups update '{"id":"GROUP_ID","patch":{"isDefault":true}}'   # used by new projects
```

`strategy`: `priority` (member order), `round-robin`, `least-busy`.

### Remove a definition or group

`agents remove` / `groups remove` only on explicit request. Check first that no project,
rule, hook or report writer points at it (`quuu projects list`, `quuu rules list`,
`quuu settings get`), and report what did.
