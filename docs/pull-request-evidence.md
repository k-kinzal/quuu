# Pull request evidence and verification

## Incident and failed assumption

On 2026-10-03, task `tsk_21d7e93923ef4afe84f5` (ztd-query-php,
deliver feedback 3), run `run_95545cfbab5a422cbd3f`, created PR #584 but
its review contained no PR. The structured messages retained the evidence:

- `codex_97`: one exec first applied a patch, then started `gh pr create`.
  Its display name was `apply_patch`; its output returned process session 44641.
- `codex_98`: a later `write_stdin` batch printed four JSON result envelopes.
  Session 44641 returned exit code 0 and the URL of PR #584.

Three independent assumptions failed: the first tool's display name described
the entire execution; command and receipt appeared in the same message; a result
body contained one JSON document. A previous multiline-command regex fix did not
address any of these boundaries.

`tests/fixtures/sessions/codex-async-pr.jsonl` is a minimized, anonymized replay of
that structure. It retains the mixed call, session IDs, JSONL and mixed exit codes;
it excludes the user's prompt, source changes and unrelated output.

## Contract

Session logs are observations, not an authoritative record of effects. In
particular, an arbitrary JavaScript program can compute commands, print someone
else's URL, omit output or print results in any order. Static inspection of that
program cannot guarantee which command produced a value. Quuu does not execute
logged programs, infer associations by adjacency, or treat a display target as an
execution contract.

The PR pipeline now separates three records:

| Record | What it establishes | Persisted evidence kind |
| --- | --- | --- |
| Candidate URL | A supported result envelope contained a PR-shaped URL | `pull-request` (legacy storage name), exposed internally as `pullRequestCandidates` |
| Observed commit | This checkout's reflog recorded a commit-creating action during a task run, excluding the baseline | `observed-commit`: repository and full SHA |
| Verified PR association | GitHub returned a PR whose head repository and full head SHA exactly matched an observed commit | `verified-pull-request`: canonical URL, repository and full head SHA |

The association means the PR carries this task's work at its head. It does not
prove which person or process pressed Create. PR titles, authors, dates, branch
names, arbitrary commit mentions, and a baseline-to-HEAD fallback range do not
establish ownership. A stacked descendant merely containing an owned commit does
not qualify. A confirmed association remains valid evidence of the task's work
when the PR later advances or its branch is deleted.

## Owners and data flow

1. Provider adapters keep their existing structured `SessionMessage` contract.
   Raw inputs and results remain available; a lossy display label cannot affect
   PR extraction.
2. `review/output.ts` decodes plain stdout, JSON, JSONL, arrays, nested JSON strings
   and the result fields `output`, `stdout`, `result`, `value`, `content`, `text`,
   `url` and `html_url`. Error/rejected envelopes cannot contribute PR candidates.
   Inputs, labels and PR bodies are not traversed. Recursion is bounded. Unknown
   formats are not evidence of absence.
3. `review/evidence.ts` extracts candidates from successful tool output regardless
   of tool name. It reads no input program and needs no state from previous pages.
   The index persists candidates with their messages; derivation v5 replays
   durable pages even when the provider has removed the source.
4. `review/ownership.ts` returns reflog-attributed commits separately from the
   broader fallback used for displaying historical changes. `review/service.ts`
   joins those full SHAs to the checkout's GitHub remote and retains the result.
5. `review/reconcilePullRequests.ts` asks GitHub for PRs associated with these
   commits, with pagination. It also resolves candidates absent from discovery,
   including upstream fork PRs and closed unmerged PRs. Responses are structurally
   validated; canonical URL, PR number and base repository must agree. The exact
   head repository and SHA decide ownership.
6. Only verified associations enter the review, reports and automatic PR follow-up.
   The renderer remains a reader. Runner inspection returns the same proofs to
   the host for persistence.

GitHub discovery uses the documented
[commit-associated PR endpoint](https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit).
It returns merged PRs introducing a default-branch commit, and open/merged
associations for commits outside the default branch. It is not an exhaustive
history of closed unmerged PRs; candidates supply a separate lookup path.

## Failure, retention and upgrades

Network failures, malformed responses and exhausted discovery time are reported
as incomplete verification, not a successful empty lookup. A candidate without
commit provenance is reported as unverified. Previously confirmed PRs remain
visible through temporary GitHub failure. Discovery uses at most four concurrent
requests and stops scheduling further batches after twenty seconds; in-flight
requests retain their own timeout. These limits do not claim total completeness.

Schema v38 moves URLs from old current projections into candidates and clears
their PR arrays for verification. An earlier heuristic receipt or metadata fetch
is not retroactively called proof. Commits, diffs, tasks and immutable run-history
snapshots are preserved. New proofs survive restart, log retention and candidate
rederivation. No production DB is patched outside these normal operations.

## Guarantees and their limits

The tested positive guarantee is conditional: given an attributed commit and a
successful GitHub response naming it as the exact PR head in that repository,
the PR is associated even with no log receipt. Given the supported result
envelopes, candidate extraction is invariant under session page boundaries,
replay and display names. A failed sibling in a batch cannot suppress another
result, and metadata cannot become output by recursive scanning.

There is no claim of complete arbitrary-program analysis. A PR with no new task
commit, an expired reflog before provenance was retained, a task that worked in an
unobserved checkout, or a rewritten head before the first verification may remain
unverified. Reflog attribution also assumes the existing task run-window model:
simultaneous actors creating commits in the same checkout cannot be distinguished
by a reflog alone. Guaranteed attribution in that setting requires an execution
receipt producer carrying task/run IDs, or exclusive task checkouts. Inferring
more facts from prose would not remove that limit.

## Quality gate

- `pullRequestEvidence.test.ts`: minimized incident replay at every record
  boundary; combinations of envelopes; mixed success/failure; no-log discovery;
  exact repository/SHA checks; referenced and stacked PR rejection; fork lookup;
  malformed responses and offline recovery.
- `sessionIndex.test.ts`: a wait arriving after hundreds of messages, durable
  rederivation after restart/source deletion, and preservation of verified proof.
- `workbench.test.ts`: real isolated Git repositories distinguish locally created
  commits, pulls, baseline commits and historical fallback ranges.
- `migration.test.ts`: v37 upgrade demotes observations without changing tasks or
  local review data, and new proofs survive reopening.
- Existing review, report, Runner and automatic-follow-up suites guard consumers.
  The root `npm run check` is required before committing.

New provider fixtures must describe which observations are promised, include
negative examples and replay across ingestion boundaries. A fixture that only
asserts a final URL after a regex match does not test the ownership contract.
