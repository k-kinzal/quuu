# Quuu Runner

Run a project's agents and builds on another Linux machine while the Quuu desktop
app owns its queue, hooks, reports, cancellation and review. The Runner makes outbound
HTTPS requests to Quuu; it needs no published container port. Images are built locally
for now.

## Build

From the repository root:

```sh
docker build -f containers/runner/Dockerfile -t quuu-runner:local .
docker build -f containers/runner/Dockerfile.agents -t quuu-runner-agents:local .
```

The first image includes Node.js, Git, GitHub CLI and the Runner entrypoint. The second
adds Codex, Claude Code and Cursor CLI. Extend either image to install your project's
compilers, package managers and system dependencies. The runtime user is `node`
(UID/GID 1000). Restore `USER node` after installing packages as root.

```dockerfile
FROM quuu-runner-agents:local
USER root
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
USER node
```

SSH configuration and project-specific dependencies are configured by the image's user.
Never put credentials in a Dockerfile or image layer. Agent sign-in is handled from Quuu
(see [Agent sign-in](#agent-sign-in)). Persist each agent's home directory, so
follow-ups and Runner-owned logins survive container replacement.

### Rust environment

The Rust Dockerfile is kept at [`.runner-private/Dockerfile.rust`](../../.runner-private/Dockerfile.rust).
It extends the agent image with Rust 1.92.0, rustfmt, Clippy, native build tools,
OpenSSL development headers, and advertises `rust,linux`. The compiler
version can be changed with `--build-arg RUST_VERSION=...`.

```sh
DOCKER_HOST=tcp://gpu.internal:2375 DOCKER_BUILDKIT=0 \
  docker build -t quuu-runner-rust:local - < .runner-private/Dockerfile.rust
```

Build the base and agent images on the same Docker daemon first. Start the Rust
image using the pairing steps below, with its own persistent data and agent-session
directories. Keep private environment files and authentication outside Git.

## Pair

1. In Quuu, open **Settings → Connections → Runners**, enable Runner connections and
   create a pairing PIN. The PIN is single-use and expires after five minutes.
2. Allow inbound TCP on Quuu's selected port (default `47833`) in the desktop's firewall.
3. Copy the **Start command** Quuu shows and run it on the Runner computer. It fills in the
   LAN URL, certificate fingerprint and PIN, and creates named volumes for the Runner data,
   `~/.codex`, `~/.claude` and `~/.config/cursor`. Replace the image with your toolchain image if needed.
   Because the PIN is spent by pairing, it is harmless once the Runner has connected.

To manage the values yourself instead, create a private environment file and start the
container with it:

```dotenv
QUUU_CONTROLLER_URL=https://YOUR_QUUU_LAN_ADDRESS:47833
QUUU_CONTROLLER_FINGERPRINT=THE_SHA256_FINGERPRINT_SHOWN_BY_QUUU
QUUU_RUNNER_PIN=THE_EIGHT_DIGIT_PIN
QUUU_RUNNER_NAME=Build machine
QUUU_RUNNER_CAPACITY=2
QUUU_RUNNER_LABELS=rust,linux
```

```sh
chmod 600 runner.env
docker run -d --name quuu-runner --restart unless-stopped \
  --env-file runner.env \
  --mount type=volume,source=quuu-runner-data,target=/var/lib/quuu-runner \
  --tmpfs /run/quuu-runner:uid=1000,gid=1000,mode=0700 \
  quuu-runner-agents:local
```

Mount `/home/node/.codex`, `/home/node/.claude` and `/home/node/.config/cursor` as well to keep Runner-owned logins and
agent sessions. Bind-mounted data directories must be writable by UID 1000. `/var/lib/quuu-runner` holds the pairing grant, independent checkouts and job
journal. Keep it across container updates. Once paired, remove the PIN from the environment
file and recreate the container with the same data volume. The saved grant handles reconnects.
Revoke an idle Runner in Quuu to invalidate that grant. Re-pairing requires removing its
`connection.json` and creating a fresh PIN.

## Agent sign-in

Every agent is signed in the same way: on the Runner's row in **Settings → Connections →
Runners**, click **Sign in to <agent>** and approve in the browser that opens. Quuu runs that
agent's own sign-in on the Quuu computer, inside a throwaway home, hands the result to that
one Runner and deletes it. The Runner owns the credential from then on; Quuu keeps no copy.
Repeat for each Runner and agent you use. A Runner must run an image that reports sign-in
state; older Runners show "sign-in not reported" until they are updated.

Never copy the Quuu computer's own agent logins to a Runner. Claude Code, Codex and Cursor
rotate refresh tokens, so two machines holding one login sign each other out, and the copy
fails with `OAuth session expired and could not be refreshed`. Each Quuu sign-in is a new,
separate session, so Runners never interfere with each other or with the Quuu computer.

| Agent | What the sign-in produces | Where the Runner keeps it |
| --- | --- | --- |
| Codex | A ChatGPT login | `~/.codex/auth.json` (`$CODEX_HOME`); the Runner refreshes it |
| Claude Code | A one-year token that can only make model requests (`claude setup-token`) | `$QUUU_RUNNER_DATA/credentials/claude-oauth-token`, given to jobs as `CLAUDE_CODE_OAUTH_TOKEN` |
| Cursor | A Cursor login | `~/.config/cursor/auth.json` |

The credential crosses only the pinned connection to the paired Runner it was made for, never
enters an instruction, the job journal or Quuu's database, and is written with mode 0600. To
withdraw a Runner, revoke it in Quuu and sign its sessions out in each provider's account
settings. Each agent row reports its own authentication state. Empty, malformed or expired
credentials and authentication rejected by a run show **authentication expired**, with a
sign-in-again action and an explanation that tasks need reauthentication. Failed credentials
are excluded from scheduling, including follow-ups on that Runner. The failure survives
heartbeats and restarts until the credential is replaced through sign-in.

**Signed in** requires a completed provider sign-in delivered to this Runner or a successful
agent run using that credential. Existing credentials and older workers that only report file
presence show **authentication not verified**; they may attempt a run, but are not described as
signed in. A renewable token whose access token expired also awaits confirmation after the CLI
refreshes it. An absent credential shows **not signed in**. Authentication facts are bound to
the credential's digest, so an old run cannot invalidate a replacement login. Per-job account
overrides do not change the Runner's own sign-in state. Revocation is detected when the provider
rejects a request; no background model requests are made just to update this display.

TLS certificate pinning verifies the controller before sending the PIN, bearer grant or
job results. Treat the Runner as a trusted machine: it can execute project instructions
and receives the project credentials needed by active jobs. Reachability alone grants
no access.

## Project routing and Git

Enable **Prefer Runner for new tasks** in the project's settings. Quuu detects the Git
remote from `origin`, or the only remote if there is no `origin`. You may set a different
credential-free HTTPS or SSH clone URL. A project inside a Git subdirectory keeps that
subdirectory inside its Runner checkout.

- Set **Required Runner labels** in the project to select its build environment,
  for example `rust, linux`. Labels are case-sensitive; every requested label must
  be advertised by the Runner. Empty accepts any Runner. Labels use letters,
  digits, `.`, `_` and `-`, begin with a letter or digit, and are limited to 32
  entries of at most 64 characters. The CLI/API project field is `runnerLabels`.
- A new task prefers an online Runner with matching labels, capacity and the configured task agent.
  Every enabled AI hook and task-report writer must also have an available agent on that
  Runner. Group targets need at least one supported member. CLI executable names match
  across platforms; machine-specific absolute paths are replaced by the advertised command.
- If no suitable Runner exists, a new task can run locally. Existing local conversations
  stay local. An existing Runner conversation stays on its original Runner and waits if
  that Runner is unavailable. There is no automatic replay on a second machine.
  Label changes affect new workspaces only; existing conversations and their hooks
  and reports keep the original Runner. Workers without labels remain compatible
  with projects whose selector is empty.
- Each task clones the remote's default branch into `workspaces/<task-id>` and creates
  `quuu/<task-id>`. Commit and push the local input you want to use before dispatching.
  Uncommitted files and local-only branches are not transferred.
- Task hooks execute in that checkout when instructed by Quuu. Task report generation
  also executes there and returns its HTML to Quuu. Project-wide daily reports still
  assess the desktop project's checkout.
- Review diffs, files, GitHub PR inspection and PR comments use the Runner checkout.
  Use Git/PRs to bring work back to your local repository. Marking a task Done does not
  merge a Runner branch into the desktop checkout. Checkouts are retained after Done
  and task deletion; clean up unused Runner data after preserving the work you need.

When GitHub App authentication is configured for a project, Quuu issues a short-lived
installation token restricted to that repository and refreshes it while the job is active.
The Runner exposes it through Git's credential helper and `gh`, so the agent can clone,
push and create PRs within the App's installed permissions. The App's private key stays
in the desktop Keychain. Tokens travel separately from the job journal and are removed
after completion is acknowledged. `/run/quuu-runner` should be a tmpfs. Git operations
that need a refreshed token wait for Quuu to reconnect after a long outage.

For other Git hosts, configure SSH keys/known hosts or a credential helper in the Runner.
Never embed tokens in the project's clone URL.

## Operation

```sh
docker logs --tail 100 quuu-runner
docker stop quuu-runner
docker start quuu-runner
```

Quitting/restarting Quuu leaves remote processes running; the Runner buffers their output
until Quuu reconnects. Cancellation is delivered when the Runner next connects. Stopping
the container stops its processes. Its journal reports interrupted work after restart
without replaying the instruction. Keep both controller data and Runner data backed up.

Additional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `QUUU_RUNNER_DATA` | `/var/lib/quuu-runner` | Persistent checkouts, journal and pairing grant |
| `QUUU_RUNNER_SECRETS` | `/run/quuu-runner` in the image | Temporary GitHub credentials |
| `QUUU_RUNNER_PIN_FILE` | unset | Read initial PIN from a mounted secret instead of an environment variable |
| `QUUU_RUNNER_AGENTS` | `codex,claude,cursor-agent` | Comma-separated CLI names to probe with `--version` |
| `QUUU_RUNNER_LABELS` | empty | Comma-separated environment labels, advertised at pairing and on every poll; restart the container after changing them |
| `QUUU_RUNNER_CAPACITY` | `2` | Concurrent remote jobs, 1–64; fixed at pairing |

`--version` proves installation. Authentication status is reported separately for each agent.
Arbitrary command hooks need their tools
installed too. Codex and Claude structured session logs are mirrored; agents whose native
history is a database currently show their stdout in Quuu.

Upgrade the controller before starting a worker that advertises labels. Older
controllers reject unknown pairing and polling fields.

## Development

`npm run build:runner` builds the standalone Node 24 entrypoint. `npm test` builds it before
testing HTTPS pairing, Git isolation, output delivery, recovery, cancellation and auxiliaries.
Run manual checks against a temporary `QUUU_USER_DATA`; never create test tasks in the
production application.
