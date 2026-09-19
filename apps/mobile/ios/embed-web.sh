#!/usr/bin/env bash
#
# Bakes the web UI (the Vite output from apps/mobile) into the .app.
#
# Called from an Xcode build phase. If npm is on PATH, rebuild before embedding;
# otherwise embed the existing `dist/` (Xcode launched from the GUI does not have
# node installed via nvm etc. on its PATH).
#
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$WEB_DIR/dist"

# Xcode launched from the GUI usually has no node on PATH.
# Re-read the login shell's PATH before looking (same situation as shellEnv.ts on the Mac side)
if ! command -v npm >/dev/null 2>&1; then
  PATH="$(/bin/zsh -lc 'printf %s "$PATH"' 2>/dev/null || printf %s "$PATH")"
  export PATH
fi

if command -v npm >/dev/null 2>&1; then
  echo "==> Rebuilding web UI"
  ( cd "$WEB_DIR" && npm run build )
elif [ ! -d "$DIST" ]; then
  echo "error: npm not found and $DIST is missing. Run npm run build -w @quuu/mobile first" >&2
  exit 1
else
  echo "==> npm not found; using existing dist"
fi

TARGET="${BUILT_PRODUCTS_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/web"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -R "$DIST"/. "$TARGET"/
echo "==> Embedded: $TARGET"
