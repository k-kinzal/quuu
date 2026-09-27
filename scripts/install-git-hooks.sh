#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
# Source archives have no Git metadata. Do not configure a containing repository.
if [ ! -e .git ]; then
  echo "Skipping Git hooks: this directory is not a Git checkout."
  exit 0
fi

current=$(git config --get core.hooksPath || true)
if [ -n "$current" ] && [ "$current" != .githooks ]; then
  echo "Cannot install Quuu hooks: core.hooksPath is already '$current'. Integrate the existing hooks before changing it." >&2
  exit 1
fi

# Changing hooksPath also hides default-directory hooks, so preserve those too.
for previous in "$(git rev-parse --git-common-dir)"/hooks/*; do
  case "$previous" in *.sample) continue ;; esac
  if [ -f "$previous" ] && [ -x "$previous" ]; then
    echo "Cannot install Quuu hooks: $previous already exists. Integrate it first." >&2
    exit 1
  fi
done

chmod +x .githooks/pre-commit .githooks/pre-push
git config --local core.hooksPath .githooks
echo "Quuu secret checks enabled for commits and pushes (Gitleaks required)."
