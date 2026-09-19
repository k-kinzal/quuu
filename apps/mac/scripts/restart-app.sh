#!/usr/bin/env bash
#
# Rebuild Quuu and relaunch it.
#
#   1. Quit the running Quuu gracefully (SIGTERM → before-quit → close the DB)
#   2. Rebuild the .app
#   3. Relaunch
#
# Running agents live in detached process groups with stdout wired straight to
# log files, so this procedure does not stop them. Exit codes land in
# `logs/<runId>.exit`, and reconcile() settles the results after startup.
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Target only the main process (Helper command lines carry the same path).
# pgrep never matches its own ancestors. This script is run by an agent that
# Quuu launched — Quuu is an ancestor — so use ps instead of pgrep.
#
# Also match the old names (QUUUU / taskd). If a pre-rename build is still
# running when the new name launches, the single-instance lock silently kills
# the new one.
running_pids() {
  ps -ax -o pid=,command= |
    awk '$0 ~ /(Quuu|QUUUU|taskd)\.app\/Contents\/MacOS\/(Quuu|QUUUU|taskd)([ ]|$)/ && $0 !~ /Helper/ { print $1 }'
}

quit_running() {
  local pids
  pids="$(running_pids || true)"
  [ -z "$pids" ] && return 0

  echo "==> Quitting running Quuu (pid: $(echo "$pids" | tr '\n' ' '))"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true

  local waited=0
  while [ -n "$(running_pids || true)" ] && [ "$waited" -lt 50 ]; do
    sleep 0.2
    waited=$((waited + 1))
  done

  pids="$(running_pids || true)"
  if [ -n "$pids" ]; then
    echo "==> Still running; force-killing"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.5
  fi
}

quit_running

echo "==> Build"
npm run dist

APP="$(ls -d "$ROOT"/release/mac-*/Quuu.app 2>/dev/null | head -n 1 || true)"
if [ -z "$APP" ]; then
  echo "Quuu.app not found under release/" >&2
  exit 1
fi

echo "==> Launch: $APP"
open -a "$APP"

# Watch the launch (the single-instance lock can kill it silently)
waited=0
while [ -z "$(running_pids || true)" ] && [ "$waited" -lt 50 ]; do
  sleep 0.2
  waited=$((waited + 1))
done
if [ -z "$(running_pids || true)" ]; then
  echo "Could not confirm the launch" >&2
  exit 1
fi
echo "==> Launch confirmed (pid: $(running_pids | tr '\n' ' '))"
