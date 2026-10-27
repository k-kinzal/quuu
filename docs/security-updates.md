# Security update, 2026-10-27

## CVE-2026-111497 (Brotli)

Malformed Brotli input can corrupt decoder memory and potentially execute code.
The fix is in the native runtime, so `npm audit` alone cannot detect or repair it.
Quuu reaches HTTP decoding through Node's fetch (including the GitHub authentication
supervisor) and Electron's network stack; there is no direct npm Brotli dependency.

- Development and CI use Node.js 26.12.1 via `.node-version`. Node.js 24.22.1 is
  also supported. Both contain the backported fix, despite reporting Brotli 1.2.0.
  The local Homebrew Node installation was also upgraded to 26.12.1, including
  its shared Brotli library from 1.2.0 to 1.2.1.
- The Runner build and runtime images use `node:24.22.1-bookworm-slim`.
- Electron is updated from 43.4.0 to 45.0.0 (Chromium 156.0.8078.48).
  Electron links Node's Brotli calls to Chromium's decoder. That Chromium tag's
  `third_party/brotli/dec/decode.c` is byte-for-byte identical to the decoder in
  upstream fix `0ed4268a4401abcb4472096340477cf4af7d1a2b`.
  The installed macOS framework also contains `_ERROR_FORMAT_BLOCK_SWITCH`.
  Electron's Node 24.22.0 bindings do not export the new JavaScript error constant;
  its absence alone does not mean Chromium's decoder is unpatched.

`npm run check:runtime` rejects an unpatched standalone Node runtime, checks the
Electron/Chromium release baseline, and exercises Brotli round trips in both.
It is part of `npm run check` and both CI platforms. To check a packaged Mac app:

```sh
node scripts/check-runtime-security.mjs apps/mac/release/mac-arm64/Quuu.app/Contents/MacOS/Quuu
```

This is a release/provenance check and smoke test, not an exploit test or proof
that all runtime vulnerabilities are fixed.

Sources: [Node.js security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
[Brotli fix](https://github.com/google/brotli/commit/0ed4268a4401abcb4472096340477cf4af7d1a2b),
[Electron build linkage](https://github.com/electron/electron/blob/v45.0.0/patches/node/build_add_gn_build_files.patch),
[Chromium decoder](https://github.com/chromium/chromium/blob/156.0.8078.48/third_party/brotli/dec/decode.c).

## npm dependencies and compatibility

The complete lockfile audit fell from 36 affected packages (5 critical, 22 high,
7 moderate, 2 low) to zero. Updates include Electron Builder 26.18, Vite 8.3,
electron-vite 6, Vitest 5, Storybook 10.6, MCP SDK 1.32, Zod 4.6 and Mermaid 12.2,
plus compatible updates across the workspaces. `vite-node` is now an explicit
tool dependency because Vitest no longer supplies it transitively.

Electron's asynchronous clipboard writes are awaited or handled at the native
menu boundary. Main-process paths use `import.meta.dirname` to avoid collisions
with electron-vite's CommonJS shims, and builds syntax-check the emitted main
and preload entrypoints. The updated app was also launched against fixture data.
The macOS signing hook preserves electron-builder's selected certificate hash;
26.18's default path substitutes the display name and fails when renewed
certificates share that name. Signing and signature verification remain enabled.

Zod's nullable type arrays and merged intersections are normalized to preserve
the existing Protobuf wire format. The schema and field-number registry remain
unchanged; generation and Buf compatibility checks protect existing clients.
React 18, TypeScript 5, ESLint 9 and OpenTelemetry 2 are retained where major
upgrades are unrelated to the audited fixes. OpenTelemetry API stays at 1.9.x
because the installed SDK declares a peer requirement below 1.10.

## Remaining exposure and deployment limits

- **Electron's embedded Node.js remains at 24.22.0.** The latest stable Electron
  release does not yet include the full Node.js 24.22.1 security release. Apart
  from Brotli, upstream fixes for CVE-2026-105481, CVE-2026-105482,
  CVE-2026-105483, CVE-2026-106069, CVE-2026-106072, CVE-2026-106073 and
  CVE-2026-106074 cannot be claimed fixed in the app. Its bundled Undici is
  7.29.1, below the 7.30.1 security update ([EventSource memory exhaustion](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
  [integrity-check bypass](https://github.com/advisories/GHSA-f72v-6w45-q472),
  [content-encoding denial of service](https://github.com/advisories/GHSA-xjj6-f33q-929c)). These are runtime dependencies outside
  npm's lockfile audit. Update Electron again when a stable build incorporates
  the fixes; updating system Node.js does not replace Electron's Node.js.
  The Node.js 26-only CVE-2026-106070 and CVE-2026-106071 do not apply to
  Electron's Node.js 24 runtime.
  An offline `tls.checkServerIdentity()` check with `DNS:127.0.0.1` confirmed
  that Electron 45 accepts `１２７.0.0.1`, `0177.0.0.1`, and `127.1`, while
  patched Node.js 26.12.1 rejects all three with `ERR_TLS_CERT_ALTNAME_INVALID`.
  No network connection or production certificate was used for this check.
- Existing remote Runner containers and derived agent/toolchain images require
  rebuilding and replacement with their persistent volumes preserved. A local
  verification image does not update those deployments or third-party agent CLIs.
- Previously published installers and apps on other computers remain unchanged
  until a new release is published and installed. Windows and iPhone device
  deployment are not performed by this local macOS update.

Dependency audits are a point-in-time result. Re-run the audit and runtime checks
when updating or publishing; zero npm advisories is not a claim of zero risk.
