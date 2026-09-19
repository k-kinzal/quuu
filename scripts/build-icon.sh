#!/usr/bin/env bash
#
# Regenerate the icon artifacts from brand/icon.icon. **This is the single source of truth.**
#
#   brand/icon.icon   ← the only source (Icon Composer package; images are SVG / PNG)
#     │
#     ├─ macOS ─ actool ──> apps/mac/build/Assets.car    layered icon for macOS 26+
#     │          ictool ──> apps/mac/build/icon.png      1024. Legacy grid (824 + 100 margin)
#     │                     apps/mac/build/icon.icns     legacy format built from ↑ (pre-26 and DMG)
#     │
#     └─ iOS ─── actool ──> apps/mobile/ios/Quuu/Assets.car        layered icon for iOS 18+
#
# **Never keep two pictures.** The same product must not wear a different face per device.
# When only one side gets redrawn, nobody notices until both are viewed side by side.
#
# The artifacts are committed. That keeps `npm run dist` / `ios:build` working in
# environments without Xcode, so this script is run by hand only when the icon changes.
#
# Requirements: Xcode (actool / ictool), librsvg (rsvg-convert)
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
SRC="$ROOT/brand/icon.icon"
MAC="$ROOT/apps/mac/build"
IOS="$ROOT/apps/mobile/ios/Quuu"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The macOS icon places 824px of art centered on a 1024px canvas (100px margin on
# every side). This ratio and margin were measured against the real mask; deviate
# and the icon looks the wrong size only when sitting next to system icons.
CANVAS=1024
ART=824
INSET=100

DEV="$(xcode-select -p 2>/dev/null || true)"
ICTOOL="${DEV%/Contents/Developer}/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
[ -d "$SRC" ] || { echo "error: $SRC does not exist" >&2; exit 1; }
[ -x "$ICTOOL" ] || { echo "error: ictool not found (Xcode 26+ required): $ICTOOL" >&2; exit 1; }
command -v rsvg-convert >/dev/null || { echo "error: rsvg-convert not found (brew install librsvg)" >&2; exit 1; }

# --- macOS 26+: layered icon into Assets.car ----------------------------------
# CFBundleIconName (extendInfo in electron-builder.yml) points at a name inside this car.
mkdir -p "$WORK/mac"
xcrun actool "$SRC" \
  --compile "$WORK/mac" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$WORK/mac.plist" \
  --app-icon icon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx >/dev/null
cp "$WORK/mac/Assets.car" "$MAC/Assets.car"

# --- Legacy formats: bake one image with Apple's renderer, then fit the old grid
# Do not try to reproduce the layered icon ourselves; shrink what ictool draws.
# That keeps macOS 26 and pre-26 looking identical.
"$ICTOOL" "$SRC" --export-image --output-file "$WORK/flat.png" \
  --platform macOS --rendition Default --width "$CANVAS" --height "$CANVAS" --scale 1 >/dev/null

# Wrap the baked PNG in an SVG with a data URI. An external reference would trip
# librsvg's loading restrictions. Old macOS expects the icon to carry its own
# shadow, so bake it in.
{
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' "$CANVAS" "$CANVAS" "$CANVAS" "$CANVAS"
  printf '<filter id="s" x="-20%%" y="-20%%" width="140%%" height="140%%">'
  printf '<feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/></filter>'
  printf '<image filter="url(#s)" x="%d" y="%d" width="%d" height="%d" href="data:image/png;base64,' "$INSET" "$INSET" "$ART" "$ART"
  base64 < "$WORK/flat.png" | tr -d '\n'
  printf '"/></svg>'
} > "$WORK/legacy.svg"

rsvg-convert -w "$CANVAS" -h "$CANVAS" "$WORK/legacy.svg" -o "$MAC/icon.png"

ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"
# The name-to-size mapping iconutil requires: 16-512 plus their @2x variants.
for spec in "16:16x16" "32:16x16@2x" "32:32x32" "64:32x32@2x" "128:128x128" "256:128x128@2x" \
            "256:256x256" "512:256x256@2x" "512:512x512" "1024:512x512@2x"; do
  px="${spec%%:*}"
  name="${spec#*:}"
  rsvg-convert -w "$px" -h "$px" "$WORK/legacy.svg" -o "$ICONSET/icon_$name.png"
done
iconutil -c icns "$ICONSET" -o "$MAC/icon.icns"

# --- iOS ----------------------------------------------------------------------
# **Do not bake PNGs ourselves.** The iOS image ictool returns is already
# rounded-corner masked and unusable as the square an asset catalog expects
# (the system mask would apply on top, leaving the icon shrunken and inset).
# Pass the .icon straight to actool and let Apple produce both the mask and
# the legacy fallbacks.
mkdir -p "$WORK/ios"
xcrun actool "$SRC" \
  --compile "$WORK/ios" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$WORK/ios.plist" \
  --app-icon icon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device iphone --target-device ipad \
  --minimum-deployment-target 18.0 --platform iphoneos >/dev/null
cp "$WORK/ios/Assets.car" "$IOS/Assets.car"
# actool also emits PNGs for old iOS, but **do not ship them**. They are already
# mask-cut, and iOS masks them again, double-rounding the corners and leaving a
# white fringe. Drop pre-iOS-18 (Icon Composer's floor) and rely on the single
# layered icon.

echo "Rebuilt:"
for f in Assets.car icon.png icon.icns; do
  printf '  apps/mac/build/%-14s %s\n' "$f" "$(du -h "$MAC/$f" | cut -f1)"
done
printf '  apps/mobile/ios/Quuu/%-14s %s\n' 'Assets.car' "$(du -h "$IOS/Assets.car" | cut -f1)"
