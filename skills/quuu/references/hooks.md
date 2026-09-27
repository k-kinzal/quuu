# Lifecycle hooks

A hook runs a shell command or a fresh AI session when a task reaches an event. Hooks are
defined app-wide in `settings.taskHooks` and adjusted per project in `project.taskHooks`: a
project entry with the same `id` overrides only the fields it sets; a new `id` is a
project-only hook.

```sh
quuu hooks resolve '{"projectId":"PROJECT_ID"}'   # the effective hooks for a project
quuu settings get --query 'taskHooks'
quuu hooks list '{"projectId":"PROJECT_ID","limit":20}'
quuu hooks log HOOK_RUN_ID
```

Hook fields: `id` (not starting with `system:`), `name`, `enabled`, `events`, `kind`
(`command` or `agent`), `command`, or `targetKind`/`targetId` + `prompt`, `timeoutSeconds`.
Events: `created`, `queued`, `held`, `started`, `stopped`, `review`, `failed`,
`beforeComplete`, `completed`, `reopened`, `archived`, `restored`, `deleted`.

`taskHooks` is replaced as a whole: read it, change the one entry, send the full array back.

## Use cases

### Commit before a task can be approved

A `beforeComplete` hook runs before worktree integration; its failure keeps the task in
review. Prompts are sent literally - Quuu adds no diff or task text.

### Run a command when work reaches review

```json
{"id":"notify-review","name":"Notify","enabled":true,"events":["review"],"kind":"command","command":"say 'review ready'"}
```

Commands get `QUUU_TASK_ID`, `QUUU_PROJECT`, `QUUU_RUN_ID`, `QUUU_HOOK_ID` and
`QUUU_HOOK_EVENT`, and run in the task's working directory.

### Turn a global hook on for one project only

Keep the app-wide hook `enabled:false`, then add `{"id":"SAME_ID","enabled":true}` to that
project's `taskHooks`.

### A hook failed or is stuck

`quuu hooks retry HOOK_RUN_ID` / `quuu hooks cancel HOOK_RUN_ID`. Hooks are never retried
automatically.
