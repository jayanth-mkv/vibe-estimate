# Verification

This record separates executed checks from production delivery and user-visible confirmation. The complete six-flow home studio, renderer, keyboard/mobile and agreement evidence is retained in [V1 verification](v1-verification.md). Background processing evidence is in [event delivery verification](event-delivery-verification.md).

## Current source checks — 14 September 2026

| Check | Executed result |
| --- | --- |
| Backend unit/API tests | 325 passed across 25 files |
| Frontend unit tests | 122 passed |
| Backend TypeScript/build | Passed |
| Frontend TypeScript, changed-file lint and production build | Passed |
| Terraform formatting, initialization, validation and mock tests | All six roots passed; 60 mock cases |
| Runtime release-validator tests | 12 passed |
| Production launcher tests | 4 passed |
| Production launcher TypeScript | Passed |
| Private configuration and environment tests | 39 passed |
| Isolated Firestore emulator checks | 7 passed: five Rules denial checks and two atomic outbox checks |
| Selected desktop/mobile browser cases | All 9 have passing evidence across the initial run and one focused rerun |

The backend suite covers verified Google access, revocation/disabled users, cross-user and unauthenticated denial, event/task identity separation, atomic outbox delivery, duplicate requests, bounded model calls, save/model failures, deterministic money, missing prices and immutable revisions. Generic owner room limits are validated server-side and cannot be supplied through the public room API.

Frontend checks cover stable named Firebase sessions, selected-identity sign-out, current-session readiness, separate designer/client identities and generic public SDK configuration. Actual Google consent is not inferred from mocks.

The selected desktop/mobile browser run passed eight of nine executions. The mobile shared-room scenario exceeded a ten-second navigation assertion during a logged 41-second Turbopack filesystem-cache compaction; the room save and authenticated reads returned success. Its original trace is retained under `.cache/fixture-verification/2026-09-14T04-16-57-248Z-yIc0pN/`. The unchanged single-scenario mobile rerun passed in 58.1 seconds with the original limits; its evidence is under `.cache/fixture-verification/2026-09-14T04-32-38-448Z-zhkxbD/`. Both isolated runs passed the seven Rules/outbox checks, and all owned test processes stopped.

## Cloud configuration and saved data

Authenticated Terraform checks preserve the active Firebase configuration and application resources. The Firebase root retains all 24 existing resource addresses; production owns 18 current resource instances. Runtime and delivery enforce a single project for Firebase and the backend. Database protection, active SDK secret version and browser namespace remain stable.

A conditional owner-setting update and complete Firestore readback preserved every business document. The current workspace contains 14 rooms, with an explicitly configured room capacity of 23 and nine available slots. The Google account and original participant attribution, immutable revisions, shared designs and agreements are preserved.

The user has confirmed Google sign-in and opening saved work in the production app. This is an actual user confirmation; no automated Google browser consent check was performed.

## Production status

Production readback verifies Firebase Auth, cloud Firestore, Vertex configuration, maintenance disabled and event delivery enabled. The recovery scheduler is paused. The user's Google sign-in and saved-home check is complete.

The 14 September 04:40 UTC readback returned HTTP 200 for the frontend and health, HTTP 401 for an unauthenticated private API request, the expected browser SDK configuration and Google-only provider settings. The review queue was empty. The preceding ten-minute request-log window contained zero internal calls, reconciliation requests or server errors.

Every release is confirmed against its native build, immutable image, serving revision and exact deployed Git SHA; the operator retains those records privately. Source-test results alone are not deployment evidence. Existing event-processing evidence establishes two successful real reviews, duplicate protection, no unauthorized access and a five-minute window with zero idle HTTP calls.

## Reproduce checks

```powershell
rtk npm test
rtk npm run test --workspace @vibeestimate/frontend
rtk npm run test:config
rtk npm run check:infra
rtk npm run test:isolated
rtk npm run verify:v1
rtk npm run check:public
```

Fixture suites run against demo Firebase emulators with deterministic AI. Connected and production checks require explicit private targets and bounded model-call authorization. A health check makes no model calls and does not replace full browser or saved-data verification.

Private cloud readbacks, state backups, plans and data fingerprints remain outside this checkout. Generated browser reports remain in ignored project caches; earlier source and release history remains in Git.
