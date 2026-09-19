#!/usr/bin/env bash
#
# Install onto the connected iPhone and launch.
#
#   1. Find a connected device (QUUU_IOS_DEVICE overrides)
#   2. Build for that device (the web embed runs too)
#   3. Install and launch
#
# **Enable Developer Mode on the device first**
# (Settings › Privacy & Security › Developer Mode → restart).
# Left off, the device cannot be picked as a build destination and this stops at "not found".
#
set -euo pipefail
cd "$(dirname "$0")"

BUNDLE_ID=net.kinzal.quuu.mobile

# Signing team. Team IDs differ per person, so never bake one into the repo
# (public repo; each person writes theirs into the gitignored Local.xcconfig).
XCCONFIG=Local.xcconfig
if [ ! -f "$XCCONFIG" ]; then
  cat >&2 <<'MSG'
apps/mobile/ios/Local.xcconfig is missing. Create it once with your own Team ID
(it stays out of git):

  echo 'DEVELOPMENT_TEAM = XXXXXXXXXX' > apps/mobile/ios/Local.xcconfig

The Team ID is the 10-character code that appears after adding your Apple ID in
Xcode › Settings › Accounts. A free Personal Team is fine (it expires after
7 days, so you will need to reinstall).
MSG
  exit 1
fi

# Connected device. Without an override, take the first available iPhone
device="${QUUU_IOS_DEVICE:-}"
if [ -z "$device" ]; then
  device="$(
    xcrun devicectl list devices 2>/dev/null |
      awk '$0 ~ /available/ && $0 ~ /iPhone/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-/) { print $i; exit } }'
  )"
fi
if [ -z "$device" ]; then
  echo "No connected iPhone found (check cable, trust, and Developer Mode)" >&2
  xcrun devicectl list devices >&2 || true
  exit 1
fi
echo "==> Device: $device"

echo "==> Building"
xcodebuild \
  -project Quuu.xcodeproj \
  -scheme Quuu \
  -sdk iphoneos \
  -configuration Debug \
  -destination "id=$device" \
  -xcconfig "$XCCONFIG" \
  -allowProvisioningUpdates \
  -quiet \
  build

APP="$(
  xcodebuild -project Quuu.xcodeproj -scheme Quuu -sdk iphoneos -configuration Debug \
    -showBuildSettings 2>/dev/null |
    awk -F' = ' '/ BUILT_PRODUCTS_DIR = /{d=$2} / FULL_PRODUCT_NAME = /{n=$2} END{print d "/" n}'
)"
[ -d "$APP" ] || { echo ".app not found: $APP" >&2; exit 1; }

echo "==> Installing: $APP"
xcrun devicectl device install app --device "$device" "$APP"

echo "==> Launching"
if ! xcrun devicectl device process launch --device "$device" "$BUNDLE_ID"; then
  # Installed, but the developer is not trusted yet.
  # Ending with only the raw CoreDeviceError leaves no clue what to do next
  cat >&2 <<'MSG'

The install went through, but the launch was refused.
Trust the developer on the device once (first time only).

  Settings › General › VPN & Device Management › Developer App
    → Apple Development: <your Apple ID> → Trust

Then tap Quuu on the home screen, or run this script again.
MSG
  exit 1
fi
