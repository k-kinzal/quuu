#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$APP_DIR/native/quuu-pty.c"
OUTPUT_DIR="$APP_DIR/build/pty"
OUTPUT="$OUTPUT_DIR/quuu-pty"

mkdir -p "$OUTPUT_DIR"
xcrun clang \
  -std=c11 \
  -Wall \
  -Wextra \
  -Werror \
  -O2 \
  -arch arm64 \
  -arch x86_64 \
  "$SOURCE" \
  -o "$OUTPUT"
chmod 755 "$OUTPUT"
