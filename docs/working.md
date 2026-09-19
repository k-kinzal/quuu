# Working on Quuu

How an agent edits this repository. Read this before changing anything.

## Work on main

**Edit directly in the `main` working tree and commit to `main`.** No branches, no worktrees.

Fixing Quuu with Quuu runs at **concurrency 1**. With no tasks running in parallel there is
nothing for a worktree to protect — it only left merge conflicts to resolve on every
integration. (If the operation ever goes parallel again, bring this whole section back to
worktree + merge.)

```sh
git status                 # 1. look before you start (see the fifth bullet below)
# … edit …
npm run check              # 2. quality gate. Do not move on until it passes
git add -A && git commit   # 3. commit only after check passes
npm run app:restart        # 4. rebuild and relaunch. Verify on the real screen
```

- **The order matters.** A commit is the record that the quality gate passed; nothing that
  hasn't reached that point goes on `main`. The restart comes after the commit so that
  **the `.app` the user is running always corresponds to a committed state**. Never hand
  over an app whose state is not in history.
- If the relaunch shows something broken, **fix it with an additional commit**.
  Do not rewrite the previous commit.
- One piece of work = one commit. The summary is **one line of English stating what
  changes** (follow the existing history).
- Changes that don't reach the app (docs-only, etc.) have nothing to rebuild, so the
  restart may be skipped — but **state in your report that you skipped it**.
- If `git status` is dirty before you start, ask the user before sweeping anything up. It is
  **a sign the concurrency-1 premise has broken**, not something you may delete yourself.
- No `git push` (only when asked).
- Never rewrite history. Fix by adding commits.

## When work comes back, fix forward

When a task is sent back to you, **the previous round is already committed on `main`**.
Returned work is a **continuation**, not a redo. First read what has happened:

```sh
git log --oneline -10             # 1. how far things have progressed
git show <sha>                    # 2. what you changed last time
git diff <sha>..HEAD -- <path>    # 3. whether other changes landed since
```

- **Start from HEAD.** Other commits may have landed while you were away. Do not assume the
  state you saw last time.
- **Land fixes as additional commits.** No `git commit --amend` / `git rebase` /
  `git reset --hard` — rewriting the past breaks the mapping between history and the `.app`
  the user is running.
- To undo a previous commit entirely, use `git revert`. It rolls back while keeping history.
- After fixing, go through the sequence again (check → commit → restart).

Package and layer rules live in [scripts/architecture/policy.mjs](../scripts/architecture/policy.mjs);
`npm run check:architecture` enforces the dependency directions. The decisions behind
those boundaries are in [architecture.md](architecture.md).

## Definition of done — the quality gate

**Work whose quality gate has not passed is not "done."** The evidence of completion is the
command passing, not the feeling that the implementation is finished.

```sh
npm run check     # lint + check:architecture + typecheck + test. Always before reporting done
```

| Command | What it runs | When |
|---------|--------------|------|
| `npm run lint` | ESLint (type-aware). A single warning fails | always |
| `npm run typecheck` | `tsc --noEmit` (the node and web projects) | always |
| `npm test` | Vitest. Scheduler, lifecycle, parsers, import, restart | always |
| `npm run check` | the three above | **always, before reporting done** |
| `npm run storybook` | visual check of the design system | when you changed appearance |
| `npm run build` | typecheck + bundle | when you touched the main process or build config |

- Lint rules are in `eslint.config.js`, deliberately narrowed to **what type checking
  cannot catch but causes accidents** (swallowed Promises, `any`, `@ts-ignore`, React hook
  dependencies). Do not grow the rule set in a direction that makes people write
  `eslint-disable`.
- If you do write `eslint-disable`, **leave the reason in a comment**. An existing example
  is in `AgentSettings.tsx`.
- Silencing type errors with `any` or `@ts-ignore` does not count as passing the gate.
- If you change behavior, **add a test**. `apps/mac/tests/` shows the house style (the `it`
  name states, in plain English, what is being guaranteed).
- Do not `skip` a failing test to call the work done. If you cannot fix it, **report the
  failure and the reason**.
- Even when it takes a while, actually run the commands. "It should pass" is not done.

## Rebuild and restart

After committing, **rebuild and relaunch**. The user runs
`apps/mac/release/mac-arm64/Quuu.app`, not `out/`. `npm run build` alone changes nothing on
screen.

```sh
npm run app:restart    # quit → npm run dist → launch
```

What `apps/mac/scripts/restart-app.sh` does:

1. Sends `SIGTERM` to the running Quuu main process (`before-quit` → closes the DB)
2. Rebuilds `apps/mac/release/mac-*/Quuu.app` with `npm run dist`
3. Relaunches with `open -a`

### A restart does not stop running agents

Quuu launches agents in the following shape. It is **a structure built so that restarting
is routine**, not an accident. Do not make changes that break it.

| Mechanism | What it protects | Where |
|-----------|------------------|-------|
| `detached: true` | signals that kill Quuu do not propagate to agents | `execution/runner.ts` |
| stdout/stderr wired straight to the log file fd | no EPIPE death when the parent goes away; no lost output | `execution/runner.ts` |
| exit code recorded to `logs/<runId>.exit` | a run that ends while Quuu is gone can still be settled correctly | `execution/runner.ts` (the sh wrapper) |
| `shutdown()` does not kill agents | restarts never lose tasks | `execution/runner.ts` |
| `reconcile()` re-adopts on startup | still-running stays running; finished gets classified and settled | `execution/scheduler.ts` |

In other words, **it is fine to restart Quuu while you (the agent) are running**. After the
restart Quuu follows the pid, re-adopts your Run, and on exit classifies the exit code into
Review / Failed / Limit.

The flip side: **quitting Quuu does not stop agents.** To stop one, use task
**cancel** (`runner.cancel`), not app quit. Cancel takes down the whole process group, so
grandchildren (MCP servers etc.) are cleaned up too.

> Note: this does not apply to agents launched by builds older than this structure.
> Quitting an old-binary Quuu drops its agents with `SIGTERM`.

## Reporting

- Write what you did and which commands verified it. Always include the `npm run check`
  result.
- Never hide what you could not do or skipped.
- Decisions that need the user (destructive changes, design forks, new dependencies): ask,
  don't decide alone.
