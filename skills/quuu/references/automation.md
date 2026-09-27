# Automation rules

A rule belongs to a project and enqueues an ordinary task when its conditions line up. There
is no separate execution path: the task it creates runs, fails and waits for review like any
other.

```sh
quuu rules list --query '[].{id:id,project:projectId,name:name,enabled:enabled,cron:cron,frequency:frequency,whenIdle:whenIdle,dueAt:dueAt}'
quuu describe rules.create
```

Fields: `projectId`, `name`, `prompt`, `priority` (0-3), `agentOverrideId` (or `null`),
`whenIdle`, `cron`, `frequency` (`none`, `daily`, `weekly`, `weekdays`), `blockStatuses`,
`enabled`, `sortOrder`. The gates combine: every condition that is set must hold.

- `frequency` / `cron`: when it may enqueue again. Use `frequency` for daily/weekly/weekdays,
  `cron` (`"0 9 * * 1-5"`) for anything else; leave the other empty (`cron:""`,
  `frequency:"none"`).
- `whenIdle: true`: only when the project has nothing queued or running.
- `blockStatuses`: skip while a task from this rule is still in one of these states. Include
  unfinished states (`["queued","running","review","failed"]`) so copies do not pile up.

Check a schedule before saving it:

```sh
quuu rules preview '{"whenIdle":false,"cron":"0 9 * * 1-5","frequency":"none","blockStatuses":[]}'
```

## Use cases

### Analyze the project's recent sessions every day

```sh
quuu rules create - <<'EOF2'
{"projectId":"PROJECT_ID","name":"Daily session review","priority":2,"agentOverrideId":null,
 "whenIdle":true,"cron":"","frequency":"daily","blockStatuses":["queued","running","review","failed"],
 "enabled":true,"sortOrder":0,
 "prompt":"Use the quuu skill to review this project's recent completed runs. Identify repeated failures and missing conventions, check each against the current code and AGENTS.md, and create focused follow-up tasks. Cite task, run and message IDs."}
EOF2
```

### Run it once now

`quuu rules enqueue RULE_ID` creates the task immediately, regardless of the schedule.

### Pause, change or remove a rule

`quuu rules update '{"id":"RULE_ID","patch":{"enabled":false}}'`; `rules remove RULE_ID` only on
explicit request.

A request to analyze something once is not a request for a recurring rule. Create rules only
when the request asks for repetition.
