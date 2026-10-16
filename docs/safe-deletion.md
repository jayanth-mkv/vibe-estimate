# Recoverable home and shared-room deletion

The September 14 request covers saved homes and shared conversation rooms. It does not remove bedrooms or walls from a floor plan. Plan drawing, upload interpretation and architectural chat edits remain a separate Pascal proof of concept.

## Behavior

An owner chooses Delete and confirms the exact saved home or room. It moves to Trash with its saved evidence retained. A home and its associated shared room move together. A standalone scope room keeps its original private source project.

Trashed work leaves the active home list. Direct home/room reads, shared access, invitations and changes are blocked. Active assistant work is cancelled and late results cannot publish. Restoration reopens the same saved identity and existing membership. Designs, conversation attribution, decisions, agreements and spent call counters remain intact. Invitations remain expired and the legacy observer stays paused. There is no permanent deletion or automatic expiry.

The UI waits for confirmation of the current trash generation. Failed saving or response delivery keeps the dialog open for retry. Cancel receives initial focus. Delete controls are separate from navigation links. `/trash` supports recovery after reload.

## HTTP contract

All routes use server-verified Firebase identity and ownership.

| Route | Input / output |
| --- | --- |
| `GET /api/trash` | Owner's `{ items }`: `kind`, `id`, `name`, `deletedAt`, `trashId`, optional `roomId` |
| `POST /api/homes/:homeId/trash` | `{ requestId, baseRevisionId }` → `{ item }` |
| `POST /api/rooms/:roomId/trash` | `{ requestId }` → `{ item }`; linked room returns its home item |
| `POST /api/trash/restore` | `{ kind, id, trashId, requestId }` → `{ kind, id, roomId? }` |

Request receipts prevent delayed duplicate deletion from deleting a restored home. The exact trash generation prevents stale restoration of a later deletion. Active workspace capacity and spent inference allowance remain separate.

## Threats and verification

| Threat | Control | Meaningful check |
| --- | --- | --- |
| Cross-user/client deletion, reads or restoration | Verified UID and owner checks in API/stores; denied direct Firestore access | Backend ownership tests, emulator API denial and Rules |
| Lost or changed evidence | Reversible marker, atomic linked home/room transition, immutable content | Exact scene/revisions/messages/decisions/agreements/export comparison after restoration |
| Late AI/save/observer publication | Cancelled durable jobs, transaction guards and lifecycle version | Backend delayed-worker and delete/restore races |
| Replayed delete or stale restore | Request receipts, exact target, design revision and trash generation | Lost-response browser retry, Firestore delayed delete and stale restore |
| Association races deletion | Atomic shared-room association and lifecycle check | Backend race regression |
| Accidental click, account change or network failure | Named confirmation, Cancel focus, identity-bound action, confirmed saved state, visible retry | Desktop/mobile/narrow Playwright, keyboard, axe, injected save/response failures |

## Executed verification (September 14, 2026)

- Backend: the full suite passed 352 of 353 tests; an existing PowerShell credential-helper test exceeded its timeout under concurrent browser load. The final targeted run passed all 48 tests (11 lifecycle regressions and all 37 credential-helper checks, including that failure). Home and collaboration API tests also passed in the initial targeted run.
- Frontend: all 113 tests passed; lint, frontend/backend type checks, scene build, backend build and production frontend build passed. The V1 browser-test TypeScript check passed.
- Firebase emulators: all seven Rules checks passed. Real Firestore API checks verified ownership denials, exact preserved history/export, expired invitations, replayed deletion and stale restoration.
- Across completed browser cases, all eight deletion journeys passed: four desktop, three mobile (390 px) and one narrow (320 px), plus two existing API access/revision and shared-decision regressions. Four duplicate cases were intentionally skipped. Checks include keyboard Cancel/Escape/focus, axe accessibility, no horizontal overflow, save failure, actual saved-but-lost response retry, reload persistence, legacy source preservation and owner/client shared access after restoration.
- An initial recorded two-tab 3D run stalled during the shared-studio check and was interrupted; it is not counted as a pass. The lifecycle tests now use screenshots without recording, and the shared test selects the real Plan view and waits for confirmed restoration before navigating. A subsequent test-only selector failure matched Next.js's extra route announcer; scoping the assertion to the page's main content fixed it. The final shared desktop and mobile/narrow runs passed without retries. No application failure was suppressed.
- The public-repository scan and whitespace check passed. No production data, cloud resources or deployment were changed.

Reviewed synthetic screenshots: [desktop confirmation](screenshots/deletion/desktop-confirm.png) and [mobile Trash and Restore](screenshots/deletion/mobile-trash.png). Detailed test artifacts remain in the task checkout's ignored `.cache/v1/` run directories.

The initial run is `2026-09-14T04-20-01-629Z-rqE447`. Completed shared desktop results are in `deletion-2026-09-14T04-39-48.532Z`; completed mobile/narrow results are in `deletion-2026-09-14T04-40-14.589Z`. Initial completed cases have screenshots and terminal results; the interrupted runner did not finalize its JSON report.
