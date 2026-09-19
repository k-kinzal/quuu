# Quuu Mac / iPhone communication

File formats provided by the Mac. Not the API of a general-purpose iCloud library.
The Mac's internal Task type and the iPhone's internal state are not exposed. Each side owns its own type declarations.

## Layout and versions

`apps/mac/src/main/mobile-sync/layout.ts` defines the file names. The Mac writes
`mac/snapshot.json`, task details, `mac/receipts.json`, and the web assets'
manifest and compressed bundle.
The iPhone writes operations to `phone/intents/` and reads receipts to drop
entries from its outbox. JSON caught mid-write is re-read on the next sync.

Snapshots, details, and receipts are version 1. Operations are accepted at
versions 1 and 2. The current iPhone writes operations at version 2.
Web assets carry an independent version, handled by
`apps/mac/src/main/mobile-sync/appDistribution.ts` /
`apps/mobile/src/sync/appUpdates.ts`.

Extra fields can be ignored. Never fill in a field that requires a known value
from an omission, an unknown value, or a wrong type. An unreadable snapshot is not
applied, and an unreadable operation is not recorded as applied.

## Exporting state

The snapshot has `version, rev, generatedAt, omittedDone, scheduler, projects, tasks`.
Each task has `id, projectId, title, excerpt, status, priority, order, updatedAt, runSeq,
lastRun, hasPending, hasReserved, detailHash`.
Status is draft / held / queued / running / review / failed / done; priority is 0 / 1 / 2 / 3.
`runSeq` is the run count and matches approval targets independently of title updates.
Details hold the prompt, unsent instructions, reservations, review records,
conversation text, and run history.
The exact fields and the fixed per-version examples live in
`apps/mac/src/main/mobile-sync/protocol.ts` and `tests/fixtures/mobile-sync/`.

## Operations

The envelope is `version, id, device, seq, createdAt, baseRev, op, expect`.
`id` does not change on resend. `seq` is the order within a device; `expect` is
the status, update time, and run count at the time of the operation.
For requests that need no approval target — such as the same device editing right
after creating — expect is null.

| op.kind | Input and meaning |
|---|---|
| task.create | taskId / projectId / title / prompt / priority. v1 uses an enqueue boolean, v2 uses action |
| task.edit | taskId plus the title / prompt / priority / projectId to change. Instructions already sent are not edited after the fact |
| task.enqueue | taskId. Moves the task to queued |
| task.unqueue | taskId. The iPhone operation moves the task to held (a different meaning from the Mac's release to draft) |
| task.done | taskId. Approves only the same run result while in review / failed |
| task.sendBack | taskId / message. Reserves while running; sends back if finished |
| task.archive | taskId. Archives the task |

v1 creation: enqueue=true → queued, false → draft.
v2's action is draft / held / queued / now. now saves as draft, then requests a
manual run, keeping the existing behavior of falling back to queued when it cannot start immediately.

Arrival order is not operation order. The Mac uses
`apps/mac/src/main/mobile-sync/order.ts` to account for the
per-device seq and creation/reference ordering.
It fetches the Mac's current facts and connects through the checks in
`apps/mac/src/main/tasks/delayedRequest.ts` to the canonical task operations.
Swift and the iPhone do not duplicate the Mac's business decisions.

## Duplicates and failures

Outcomes are applied / skipped / deferred / conflict. A receipt row carries intentId / device / seq / taskId / at / outcome / reason.
The Mac records an operation's storage and its applied ID in the same local transaction.
If an operation fails midway, its storage is rolled back and the rejection is recorded.
A notification failure does not un-confirm a committed operation.
Receipt files are written after commit. If one never arrives, it can be reissued when the same ID is resent.

## Verification when changing the format

[`tests/mobile-sync.compat.test.ts`](../tests/mobile-sync.compat.test.ts) runs fixed v1 / v2 JSON through the Mac's
actual exporter → iPhone reader, and the iPhone writer → Mac reader / importer → iPhone receipt reader.
When changing the format, do not regenerate the old-format fixtures from the current output.
The Swift side's on-device behavior — folder permission, coordination, distribution — is verified separately from the TypeScript compatibility checks.
