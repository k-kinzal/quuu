# Verification

Do not damage production data (`~/Library/Application Support/taskd`). Verify against a
substitute launched with an env var:

```sh
QUUU_USER_DATA=/tmp/taskd-dev npm run dev
```

- `npm run dev` stays in the foreground; if an agent runs it, run it in the background and
  always tear it down.
- Never perform operations against the production Quuu (creating or deleting tasks) for
  verification purposes.

Environment variables and other development entry points are listed in
[guide.md](guide.md#environment-variables).

## Look at the screen — never create "can't see it, so can't fix it"

**Do not finish screen work without looking at the screen.** Storybook stories are
component samples, not app screens. Fixing from stories alone leaves the real screen's
jams (misaligned marks on the collapsed rail, labels that shift with digit count,
adjacent surfaces fighting) in place until the end. That actually happened.

```sh
npm run dev:fixture   # build fake data in /tmp/taskd-shot (production untouched)
npm run dev:shot      # launch on that data with CDP open (in the background)
npm run shot          # capture the real screens into /tmp/taskd-shots

QUUU_FIXTURE_BULK=240 npm run dev:fixture   # can also pile up a large number of rows
```

- `apps/mac/scripts/dev-fixture.ts` — builds a state with rows, long values, and
  second-counts that change digit width. **The scheduler and import are disabled** (fixture
  data must not launch real agents). `QUUU_FIXTURE_BULK` scales the row count (look at
  sorting, filtering, and column widths with many rows).
- Do not trust HMR. **If you change column defaults or styles, quit and relaunch the app.**
  A stale transform lingers on the browser side and you end up capturing the old values.
  That actually happened.
- `apps/mac/scripts/shoot.mjs` — connects to CDP with Node's built-in WebSocket. Adds no
  dependency. Switches screens by driving `window.__quuuStore` (dev builds only).
- Pass capture targets as JSON in `QUUU_SHOTS` (an array of `{name, script, wait}`).

**Take OS values from the OS.** When matching a color or dimension to macOS, sampling it
directly with `swift` beats reading articles — faster and accurate:

```sh
swift -e 'import AppKit
NSAppearance(named: .darkAqua)!.performAsCurrentDrawingAppearance {
  print(NSColor.windowBackgroundColor.usingColorSpace(.sRGB)!) }'
```
