#!/usr/bin/env bash
#
# Build for the simulator to confirm it compiles.
# No signing needed, so this runs without an Apple Developer Program membership.
#
set -euo pipefail
cd "$(dirname "$0")"

xcodebuild \
  -project Quuu.xcodeproj \
  -scheme Quuu \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build "$@"
