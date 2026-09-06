# Quick product test checklist

Production audit of `88f253f` on `feat/spatial-home-studio`, 5 September 2026: all 15 distinct browser checks have passing results across targeted runs, with seven real Gemini calls. The subsequent source fixes passed one clean **28/28 desktop/mobile regression** on fresh emulators. The full [executed record](verification.md#production-journey-audit--5-september-2026) lists failures, fixes and evidence separately. Completed Google consent and deployment of the verified recovery/concurrency fixes remain separate gates; future 3D releases are not implemented. Reset the statuses when repeating this checklist against another deployment.

## What can be tested now

| Surface | Actual current scope |
| --- | --- |
| `/` and `/?project=<id>` | Guest workspace, source wizard, fictional examples, review/clarification, owner-priced draft/revision, saved projects and download. |
| `/welcome` | Retained illustrated tour, workflow tabs and workspace return. |
| `/join` | Room-code entry using the separate client identity. |
| `/rooms/<id>` | Designer conversation, scope observer, invitation, private draft handoff and explicit sharing. |
| `/client/rooms/<id>` | Client conversation, observer findings, shared draft versions and optional Google-linked access recovery. |
| `/health` and `/api/*` | Runtime preflight and authenticated same-origin requests. Health alone does not prove a working journey. |

The [release plan](plan/README.md) includes future features; they are not hidden routes in the current app:

| Release | Planned coverage, not implemented in this snapshot | Gate status |
| --- | --- | --- |
| [Spatial v1](plan/v1.md) | Authored whole-home scene, Overview/Inside/Plan, catalog/material editing, comparison, scene revisions and graphics fallback. The proposed multi-model fallback ladder is also pending. | Pending implementation |
| [Spatial v2](plan/v2.md) | Plan/photo upload and recognition, agent crew, visual suggestions, private client options, designer console/client inbox and simulated website embed. | Pending implementation |
| [Spatial v3](plan/v3.md) | Multiple floors, full walkthrough/presentation, real embed SDK, voice, multi-line estimates and scene exports. | Pending implementation |

## Set up one identifiable run

- **Run record — Passed:** record public origin, deployed image/commit, UTC time, browser/version, viewports, runtime/provider and evidence directory. Confirm `/health` reports `runtime=production`, `auth=firebase`, `storageConnection=cloud`, `aiProvider=gemini` and the intended transport. Do not target a default cloud project.
- **Identities — Passed:** use fresh isolated browser contexts for designer D, client C and stranger S. Also check designer/client tabs in one browser use different app identities. Compare identity continuity in memory; never print tokens or copy Firebase storage state into reports.
- **Synthetic data — Passed:** name custom projects `Synthetic production <journey> <UTC timestamp>`. Use the fictional sources in [production.spec.ts](../tests/live/production.spec.ts) and [connected-rooms.spec.ts](../tests/live/connected-rooms.spec.ts). The built-in examples are fictional. Use no customer information or real home plans.
- **Budget/evidence — Passed:** declare the live call budget before starting. The complete production suite intends six real calls: two project reviews, two room observations and one each for wardrobe/finish, with no automatic retries. The recorded audit used seven because the first solo run reached one response before a test-selector failure. Keep evidence outside the checkout in the operator's private directory; traces/video/automatic failure screenshots stay off. Capture only synthetic completed views after closing invitations and removing URL fragments. Pause the test room's observer afterward.

## Product journey

| ID | Repeatable check and expected result | Status |
| --- | --- | --- |
| P01 | Open `/` fresh: purpose, Sources → Review → Draft and Start a project are clear; guest entry has no login wall. Open How it works and the illustrated tour, then return. Images decode, navigation works and the workspace header remains compact. | Passed — four widths, keyboard tour, compact header |
| P02 | Start a project. Submit empty/short fields; errors identify and focus the field. Enter scope/messages, go Back/Continue and confirm retention. Cancel with edits and exercise Keep editing / Discard edits and leave. Save once; no analysis runs merely from saving. | Passed — validation, retention, discard, save/reload |
| P03 | Open each example: lighting, wardrobe and finish. Verify the correct fictional sources. Live reviews should distinguish included work, three drawers with no confirmed price, and veneer with unknown area/rate. Record any review omitted from the declared call budget as Pending. | Passed — all three sources; real lighting, wardrobe and finish reviews |
| P04 | Run a lighting review, inspect its exact source quotations and included kitchen lighting. Clarify six matte-white display lights at INR 2,000.50, then run the second review. The answer uses the new context, retains source evidence and never claims approval. | Passed — two real solo turns and two real room observations |
| P05 | Continue to draft. Missing price blocks saving. Confirm description, quantity 6 and rate 2,000.50: total is ₹12,003. Save; revise quantity to 4: total is ₹8,002. Unsaved edits disable download; both saved versions remain. Review-tab changes do not overwrite owner pricing. | Passed — required rate, deterministic totals, retained revisions |
| P06 | Reload the draft URL, return through All projects, refresh the list and reopen. Identity, original sources and revisions persist. Download revision 2 and inspect its quantity, unit price, ₹8,002.00 total, evidence and approval-uncollected wording. | Passed — reload/reopen and revision-2 export |
| P07 | Start shared room from a project; also check Try a shared room from home. Initial conversation/observer states are honest and no model request occurs until a message requires review. Refresh/direct navigation preserves the room. | Passed — project entry and home shortcut; no initial observation |
| P08 | Invite client → Create invite link. Decode the actual QR; it matches the current invitation. Test link joining and `/join` code joining on separate fresh rooms. Accept lowercase/spaces/hyphens; reject malformed, replaced or expired codes. Create a new invitation invalidates the unused old one. Joining removes the URL fragment. | Passed for QR/link/code, malformed and replaced invites; 24-hour expiry not elapsed in production |
| P09 | C sends the synthetic request; D sees the saved message. Wait for the first real observation, then D sends the rate confirmation and C sees it. Wait for the second distinct review. Sources match the frozen transcript; polling/reload do not create more reviews. | Passed — both directions, two separately awaited real observations |
| P10 | D prepares a private draft from the current review. Original sources remain unchanged; C sees no draft yet. Save → Back to room → Share saved draft. C sees Shared draft 1. Revise privately, then share version 2; both immutable shared copies survive reload in D and C. | Passed — private preparation, explicit sharing, two immutable versions |
| P11 | Pause observation: later messages remain saved and the state is visible. Preparation is unavailable when review is missing/stale/failed/paused. Resume/retry obeys the declared budget and shows real status. Do not trigger a paid retry merely to exercise the control. | Passed for pause/resume and saved messages while paused; paid retry not triggered in production |
| P12 | Optional Google: link a populated guest workspace without changing its UID; cancel/network failure preserves inputs and guest access. Returning-owner sign-in is available only on an empty guest workspace. Recover a Google-linked client room from a fresh browser; wrong account/room keeps the original guest intact. Record completed personal Google consent separately from popup/cancellation checks. | Partial — three real popup/cancellation paths passed; completed account consent/recovery pending |

## Mobile, accessibility, failure and security

| ID | Repeatable check and expected result | Status |
| --- | --- | --- |
| Q01 | Inspect home, wizard, tour, review, draft, invitation, join and both room roles at 1440, 768, 390 and 320px. No page overflow/clipped actions; long sources/history scroll accessibly. Mobile Conversation/Agent/Drafts tabs expose every working pane. | Passed for audited home/tour, source wizard, drafts, invite/join and both room roles; physical devices not tested |
| Q02 | Use keyboard only: skip link, form errors, citation focus, workflow/room tabs, invitation and leave dialogs. Escape closes dialogs and restores focus. Check visible focus, labels, reduced motion and axe WCAG A/AA findings on each distinct state. Automated axe and resized Chromium do not prove screen-reader or physical-phone compatibility. | Passed for tested keyboard controls and axe; manual assistive-technology audit pending |
| Q03 | Interrupt the browser's source-save request: inputs remain and retry saves once. Lose a successful proposal/message response: retry reuses the request and creates no duplicate revision/message. Exercise Keep editing after an unsaved navigation attempt. | Passed — offline source save, lost successful draft/message responses, retained edits |
| Q04 | Inject a browser-visible review outage and room-read disconnection. Preserve sources, composer and saved drafts; show retry/reconnect status without fixture substitution or fake presence. Distinguish an injected outage from an actual provider failure in evidence. | Passed — injected review outage and room-read disconnect; no fixture substitution |
| Q05 | Unauthenticated access is denied. S cannot read/review/edit/export D's project or read/post to D's room. C cannot read private projects/export, prepare/share drafts, rotate invitations or control the observer. Joining a full room as S fails. UI hiding alone is not sufficient: verify API denial. | Passed for tested production unauthenticated, stranger and client denials; detailed payload cases in backend suite |
| Q06 | Verify duplicate requests do not add work; changed-payload replay, forged role/price/approval fields and stale preparation fail. An ordinary Firebase token cannot call the managed observer/recovery endpoint. Direct Firestore client reads/writes remain denied in the dedicated Rules tests. | Partial — production proposal/message replay and task denial passed; durable review recovery passed 183 backend, 44 frontend and 28 fixture browser checks plus 3 Rules tests; source fixes await rollout |
| Q07 | Reload/reopen both identities and compare saved sources/messages/revisions/export. Check exact records after a controlled restart only when that restart is part of the run; a browser reload alone is not restart evidence. No credentials, invite values or private configuration enter output. | Passed for production reload/reopen; controlled production restart not performed |

## Existing automation and coverage limits

| Suite | Scope and command | New-run status |
| --- | --- | --- |
| Production | [production.config.ts](../tests/live/production.config.ts): 15 checks: shared room, solo review, examples, wizard, four-width tour, access/recovery and Google cancellation. `rtk proxy node scripts/verify-production.mjs` | Passed across targeted runs |
| Fixture browser/API | [ui.spec.ts](../tests/e2e/ui.spec.ts), [rooms.spec.ts](../tests/e2e/rooms.spec.ts), [api.spec.ts](../tests/e2e/api.spec.ts), [review-recovery.spec.ts](../tests/e2e/review-recovery.spec.ts): journeys, validation, lost responses, safe review checks/retries, QR rotation and role denial. `rtk npm run test:isolated` starts its own fresh demo stack. | Passed — 28/28, 15 desktop and 13 mobile, in 8.9 minutes |
| Supporting checks | `rtk npm test`; `rtk npm run test --workspace @vibeestimate/frontend`; `rtk npm run test:config`; `rtk npm run test:rules`; `rtk npm run typecheck`; `rtk npm run lint --workspace @vibeestimate/frontend`; `rtk npm run build`. Rules require the isolated emulator setup; the recorded optimized build used an isolated source copy to preserve the running app. | Passed — 183 backend, 44 frontend, 34 configuration, 3 Rules, lint/type checks and backend/frontend builds |

The production configuration requires `CONNECTED_FIREBASE_TEST=1`, `VERIFICATION_BASE_URL`, `VERIFICATION_RUNTIME=production`, the authorized `CONNECTED_FIREBASE_PROJECT_ID`, and an absolute external `PRODUCTION_EVIDENCE_DIR`. Load operator values privately; do not paste them into this document. The production suite has one Chromium desktop project; its onboarding test explicitly resizes to 390px. The expanded specs also cover room/tour at four widths, wardrobe/finish live reviews and Google cancellation. Completed personal Google consent is still a manual check. Fixture tests use local addresses and deterministic lighting evidence; do not repoint them at production.

Use **Passed**, **Partial**, **Failed**, **Blocked**, **In progress** or **Pending** per item with an evidence reference and reason. Record skipped work explicitly. No result in this checklist certifies the unimplemented spatial releases.
