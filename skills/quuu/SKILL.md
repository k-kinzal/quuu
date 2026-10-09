---
name: quuu
description: Operate Quuu through its CLI or MCP server - projects, agents and groups, tasks, automation rules, lifecycle hooks, app settings, reports and session history. Use for requests about Quuu's configuration or its live task data, including tasks in Quuu's built-in QuuuAI project; not for editing the Quuu application's source alone.
---

# Quuu

Use `quuu` to operate the running Mac app. It talks to Quuu over a private local gRPC
connection it discovers by itself. Everything the desktop app can change goes through the
same operations, so **never edit Quuu's SQLite database or data directory by hand**.

## Pick the reference for the request

Read the one that matches the request before acting; each is organized by use case.

- [projects](references/projects.md): add, rename, disable or configure a project - run target, priority, concurrency, worktrees, editor, identity, Pull Request prompts
- [tasks](references/tasks.md): create, edit, queue, hold, run, follow up, order and archive tasks; what an agent must never do to a task
- [agents](references/agents.md): agent definitions and groups - enable a CLI, change a model, fallback chains, concurrency, Limits and cooldowns
- [settings](references/settings.md): app-wide settings - scheduler, notifications, worktrees, import, iPhone sync, theme, GitHub identity, connections, updates
- [automation](references/automation.md): recurring or conditional tasks (rules) - daily analysis, cron, "when the queue is idle"
- [hooks](references/hooks.md): lifecycle hooks - commands or AI runs on task events, globally or per project
- [history](references/history.md): read past sessions, find repeated failures, cite evidence; reports and review data
- [troubleshooting](references/troubleshooting.md): the CLI cannot connect, exit codes, operations that need a person at the Mac

## Ground rules

- **Resolve before you mutate.** Look the target up and use its full ID. When the wording
  matches more than one project, task, agent or rule, stop and report the candidates.
- **Change only what was asked.** `update` operations take a patch; send only the fields the
  request is about. A request to look at something does not authorize changing it.
- **Done is a human decision.** Never run `tasks done` on your own work, and never mark a task
  done because it "looks finished". Run `done`, `delete`, `cancel` or `remove` only when the
  request names that operation for a resolved target.
- **Do not cut your own line.** Turning off `httpEnabled` stops the CLI you are using; turning
  off the scheduler or a project stops the work you were started by. Do these only when asked,
  and say what they stop.
- **Report precisely.** End with what changed (with IDs and old → new values), what you left
  alone and why, and anything that needs the human.

## Find operations and their inputs

```sh
quuu api                                   # every operation
quuu describe projects.update              # JSON input and output schema of one operation
quuu projects list --query 'projects[].{id:id,name:name,path:path,builtIn:builtIn}'
quuu snapshot --query 'keys(@)'            # everything the desktop screen shows, in one call
```

Every operation is `quuu RESOURCE ACTION [json]` (also `quuu call RESOURCE.ACTION json`).
`quuu RESOURCE ACTION --help` works without the app. Task commands also have flag shortcuts
(`quuu tasks create --project … --title …`); other resources take JSON input:

```sh
quuu settings set '{"notifyOnReview":true}'
quuu projects update '{"id":"PROJECT_ID","patch":{"maxConcurrent":2}}'
quuu rules create @/tmp/rule.json          # JSON from a file
quuu tasks create --project /path --title T --prompt-file - <<'EOF'
Multi-line instruction.
EOF
```

An operation that takes a single ID reads it bare (`quuu agents reset-limit AGENT_ID`,
`quuu rules enqueue RULE_ID`). `--json` / the positional argument is operation **input**. Output is JSON for agents and pipes
(`--output json|table` overrides it). `--query` applies a
[JMESPath](https://jmespath.org/tutorial.html) expression to the whole result. Quote it with
single quotes so backticks and `&` survive the shell:

```sh
quuu tasks list --query 'tasks[?status==`review`].{id:id,title:title}'
quuu agents list --query '[?enabled].{id:id,name:name,command:command}'
```

Shortcut roots are `{projects:[…]}` and `{tasks:[…]}`; `agents list`, `groups list`,
`rules list` and `call projects.list` return plain arrays.

## The built-in QuuuAI project

QuuuAI (`id: prj_quuu`, `builtIn: true`) is the project whose tasks operate Quuu itself. Its
directory is inside the app and holds this skill. It cannot be deleted, moved, or given
worktrees; everything else (agent, priority, concurrency, enabled) is configurable. When you run
there, do not write files in the working directory, and turn a request that needs code changes
into a task for the project that holds that code.

Proposed work has two independent operations. `assistant.react` records feedback only
(`approve` = like, `dismiss` = dislike, `clear` = remove); none approves or creates work.
The user creates a proposal's task through its **Create task** button, backed by
`assistant.createTask {taskId}`. During proposal research or discussion, never call either
operation on the user's behalf or turn a reaction into a `tasks.create` call.
