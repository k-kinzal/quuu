---
name: quuu-tasks
description: Inspect and operate the local Quuu task queue with the quuu CLI. Use when the user asks to list Quuu projects or tasks, add or edit a task, change its queue state, run it, or send a follow-up. Do not use for editing the Quuu application source itself unless the request also concerns its live task data.
---

# Quuu Tasks

Use the `quuu` command. It talks to the running Quuu app through a local Unix socket and prints JSON. If it reports that Quuu is unavailable, ask the user to start the app; do not edit its SQLite database directly.

## Find the target

Resolve names before mutating existing data:

```sh
quuu projects list
quuu tasks list --project /absolute/project/path
quuu tasks list --status review
quuu tasks get <task-id-or-unique-prefix>
```

Project arguments accept an exact project ID, name, or path. Task arguments accept a full ID or a unique ID prefix. Prefer a project path when names may collide.

## Create and edit

Creating a task queues it by default:

```sh
quuu tasks create --project /path/to/project --title 'Short title' --prompt 'Full instruction' --priority 2
quuu tasks update <task-id> --title 'New title' --priority 1
```

Use `--status draft` for an unfinished instruction or `--status held` when the user wants it kept out of the queue. Use `--scheduled-at <ISO8601>` for delayed execution.

For multiline or shell-sensitive text, pass standard input instead of interpolating it into a shell argument:

```sh
quuu tasks create --project /path/to/project --title 'Short title' --prompt-file - <<'EOF'
The complete instruction goes here.
It may contain quotes, dollar signs, and multiple lines.
EOF
```

`tasks update` also accepts `--prompt-file -`, `--clear-schedule`, `--review-note`, `--agent`, and `--clear-agent`.

## State and conversation operations

```sh
quuu tasks enqueue <task-id>
quuu tasks unqueue <task-id>
quuu tasks hold <task-id>
quuu tasks run <task-id>
quuu tasks reopen <task-id>
quuu tasks send <task-id> --message-file -
quuu tasks send-back <task-id> --message-file -
quuu tasks archive <task-id>
quuu tasks unarchive <task-id>
quuu tasks cancel <task-id>
quuu tasks done <task-id>
quuu tasks delete <task-id>
```

`send` follows Quuu's composer semantics: while a task is running it reserves the message for after the run; otherwise it queues the initial instruction or follow-up. `send-back` explicitly places a follow-up and returns the task to the queue.

Before changing an existing task, inspect it when the user's wording does not identify one exact task. Never infer authorization for `done`, `delete`, or `cancel`: run those only when the user explicitly requests that operation for the resolved task. In particular, completion is a human decision; an agent must not mark its own work done.

An exit status of 2 from `tasks run` or `tasks send` means Quuu accepted the command but the requested immediate action could not proceed; read the JSON `run` or `result` reason before choosing a follow-up. Use `quuu help` for the complete flag summary.
