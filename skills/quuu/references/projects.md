# Projects

A project is a working directory plus how its tasks run: which agent or group, how many at
once, and in what order against other projects. Configuration that affects one project lives
on the project, not in app settings.

```sh
quuu projects list --query 'projects[].{id:id,name:name,path:path,enabled:enabled,target:[targetKind,targetId]}'
quuu describe projects.update
```

`projects update` takes the full `id` and a `patch` with only the fields to change. Deleted
projects are not listed.

## Use cases

### Add a project for a directory

```sh
quuu projects create '{"name":"api","path":"/Users/me/src/api"}'
```

- `path` must be an absolute path to an existing directory. Check it (`test -d`) first.
- Without `targetKind`/`targetId` the project runs on the default group, if one is marked.
- Choosing the directory of a deleted project brings that project back with its settings.
- Optional on create: `color` (`#RRGGBB`), `priority` (0 first, default 2), `maxConcurrent`
  (default 1), `enabled`, `worktreeMode`, `editorApp`, `reportEnabled`, identity and Pull
  Request fields below.

### Choose which AI runs the project's tasks

```sh
quuu agents list --query '[].{id:id,name:name,enabled:enabled}'
quuu groups list --query '[].{id:id,name:name,isDefault:isDefault}'
quuu projects update '{"id":"PROJECT_ID","patch":{"targetKind":"group","targetId":"GROUP_ID"}}'
```

`targetKind` is `agent` or `group`. A disabled agent never runs; enable it first
([agents](agents.md)). Tasks that already opened a conversation stay with their CLI: a
changed target applies to tasks that have not started.

### Run more (or fewer) of its tasks at once, or ahead of other projects

- `maxConcurrent`: parallel runs inside this project (the agent's own `concurrency` still
  caps it).
- `priority`: project order when capacity frees up. Lower runs first. Task priority
  (P0-P3) only orders tasks inside the same project order.

### Stop a project for now

`{"enabled":false}` keeps its tasks but starts none of them. `true` resumes. Prefer this to
deleting.

### Rename, recolor, open in a different IDE

`name`, `color`, `editorApp` (absolute path of a `.app`; `""` follows the app setting). List
installed editors with `quuu open editors`.

### Isolate each task in its own Git worktree

`worktreeMode`: `inherit` (the app's `worktreeEnabled`), `on`, `off`. Applies to tasks that
have not started. Requires a Git repository with at least one commit. A project whose tasks
own worktrees cannot change `path`.

### Commit identity and GitHub App

`commitIdentityMode`: `inherit` (the app's identity), `off` (the machine's own Git/gh
identity), `custom` (`commitIdentity` object; inspect `quuu describe settings.setIdentity`).
Preview the result with
`quuu settings preview-identity '{"identity":{…},"projectId":"PROJECT_ID"}'`.

### Send tasks back when their Pull Request is failing, pending or conflicting

`pullRequestPromptMode`: `inherit` (app prompts), `off`, `custom`. With `custom`, set
`pullRequestFailurePrompt` / `pullRequestPendingPrompt` / `pullRequestConflictPrompt` and
their `…Enabled` switches. `{{url}}`, `{{number}}`, `{{title}}`, `{{branch}}` and `{{base}}` are
filled in.

### Change reports

`reportEnabled: false` opts this project out of change reports and daily assessments. It
does nothing while reports are off app-wide ([settings](settings.md)).

### Delete a project

```sh
quuu projects remove PROJECT_ID
```

Only on an explicit request naming the project. It deletes every task, run history and rule
of the project and discards task worktrees, including uncommitted work. State that before
doing it. QuuuAI (`builtIn: true`) cannot be deleted - disable it instead.

## QuuuAI

The built-in project (`prj_quuu`). Its `path` and `worktreeMode` are fixed; updates that change
them are refused. It starts with reports, commit identity and Pull Request prompts off because
nothing it does is committed.
