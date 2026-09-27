#!/bin/sh
set -eu

# GUI Git clients and agents may not inherit the interactive shell's Homebrew PATH.
PATH="${PATH:-/usr/bin:/bin}:/opt/homebrew/bin:/usr/local/bin"
export PATH
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "Secret scan blocked: Gitleaks is required. Install it with: brew install gitleaks" >&2
  exit 1
fi

root=$(git rev-parse --show-toplevel)
cd "$root"
if ! gitleaks git --config="$root/.gitleaks.toml" --redact=100 --verbose --no-banner --no-color "$@"; then
  echo "Secret scan blocked the operation. Remove the reported secret from the staged changes or outgoing commits, or fix the scanner error, then retry." >&2
  exit 1
fi
