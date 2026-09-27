# Tasks

A task is a request to an agent inside one project. Its states:

`draft` (still being written) → `queued` → `running` → `review` (the run ended normally) or
`failed` (error or Limit) → `done` (**only a human**). `held` is "written, but not now": it
leaves the queue until someone queues it again.

```sh
quuu tasks list --project /abs/path --status review --query 'tasks[].{id:id,title:title}'
quuu tasks get TASK_ID_OR_PREFIX
```

Task commands accept an ID or a unique ID prefix; `--project` accepts an exact ID, name or path.

## Use cases

### Add a task

```sh
quuu tasks create --project /abs/path --title 'Short title' --priority 2 --prompt-file - <<'EOF2'
The complete instruction.
EOF2
```

- Queued by default. `--status draft` for an unfinished instruction, `--status held` to keep
  it out of the queue.
- `--scheduled-at 2026-10-01T09:00:00+09:00` delays it; `--agent AGENT_ID` binds that agent
  and its fallback chain (a busy agent makes the task wait - no other agent stands in).
- Priority 0 is highest and also keeps its run slots until the task is done; use it only
  when asked.
- Several tasks in the same project with an order: create them with `dependsOn` (below).

### Run one task after another

```sh
quuu tasks create '{"projectId":"PROJECT_ID","title":"Deploy","prompt":"…","dependsOn":[{"taskId":"TASK_ID","mode":"done"}]}'
quuu tasks update '{"id":"TASK_ID","patch":{"dependsOn":[{"taskId":"OTHER_ID","mode":"finished"}]}}'
```

`mode`: `done` waits for human approval, `finished` waits for the run to end. The patch replaces
the whole list. Cycles are rejected.

### Edit a task

`quuu tasks update TASK_ID --title … --prompt-file - --priority 1 --agent ID --clear-agent
--scheduled-at … --clear-schedule --review-note …`. Moving to another project:
`{"patch":{"projectId":"…"}}` (refused while the task owns a worktree).

### Change its state

| Request | Command |
|---|---|
| queue it | `quuu tasks enqueue ID` |
| take it out of the queue / keep it for later | `quuu tasks unqueue ID` / `quuu tasks hold ID` |
| run it now, ahead of the queue (during a Limit it probes whether the Limit lifted) | `quuu tasks run ID` |
| continue the conversation | `quuu tasks send ID --message-file -` |
| return reviewed work with a note | `quuu tasks send-back ID --message-file -` |
| stop a running task | `quuu tasks cancel ID` |
| archive / restore | `quuu tasks archive ID` / `quuu tasks unarchive ID` |
| reopen a done task (fresh conversation) | `quuu tasks reopen ID` |
| approve as done | `quuu tasks done ID` - only when the human asks for exactly that |
| delete | `quuu tasks delete ID` - only on explicit request |

`send` on a running task reserves the message for after the run;
`quuu tasks clear-reserved FULL_TASK_ID` drops it. Exit status 2 from `run`/`send` means Quuu accepted the command but could not act
now (a Limit, a busy slot); read the JSON `run` / `result` reason and report it rather than
retrying.

### Review a finished task

`quuu tasks get ID` (prompt, follow-ups, runs), `quuu review snapshot FULL_TASK_ID` (commits,
files, Pull Requests), `quuu report get FULL_TASK_ID` (change report), and the conversation through
[history](history.md).

## Never

- mark a task done, delete or cancel it unless that operation was requested for that task;
- change a task's CLI by hand: a task stays with the CLI that first read it;
- create tasks in bulk to "try" something - each queued task spends an agent run.
