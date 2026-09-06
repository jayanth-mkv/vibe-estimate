# V1 home-to-agreement verification

This record describes executed checks for the September 6 home journey overhaul. The [product plan](plan/v1.md) defines acceptance; this file does not turn pending work into a pass.

## Implementation under review

Work is isolated on `feat/v1-home-journey` in `../vibeestimate-spatial-demo/`. The independent Pascal experiment remains in `../pascal-poc/`. The release introduces three complete measured homes, sixteen admitted local models, scoped Gemini and manual edits, immutable server revisions, and a shared designer/homeowner design with exact-version decisions and stored draft agreements. Existing proposal and room workflows remain available through the secondary proposal workspace.

The assistant is a designer-configured Gemini assistant attached to a shared room. Ordinary messages preserve the actual sender; asking the assistant explicitly starts a bounded job. Completion replies refer to real saved revisions. The homeowner's acceptance and designer's review must cover the same current revision. Older agreements retain their original design, decisions, conversation and generated text after subsequent edits.

## Executed source and asset checks

The clean verification begun at `2026-09-05T23:52:31.877Z` passed these stages before its headed browser gate:

| Check | Executed result |
| --- | --- |
| Frontend unit tests | 54 passed, including ten actual gateway-route query/origin/path tests. |
| Backend unit/API/store tests | 220 passed, including home ownership, room roles, scoped edits, exact decisions, immutable agreements, reservations, cancellation, ambiguous results, conflict and staged-save recovery. |
| Existing environment/configuration tests | 34 passed. |
| Canonical spatial contracts | 8 passed. |
| Complete-home design contracts | 6 passed, including all three homes, candidate admission, opposite wall faces, atomic rejection and architectural comparison descriptions. |
| Startup/production-target guards | Passed; incomplete production settings stop before either server starts. |
| Release boundaries | 8 passed, including exact deployed Git revision checks. |
| Compilation and lint | Shared packages, frontend and backend typechecks; frontend lint; optimized workspace production build passed. |

Evidence is `.cache/v1/verification-2026-09-05T23-52-31-877Z/`. Its final manifest records **all fourteen stages passed**, ending at `2026-09-06T00:15:01.997Z`. Firestore Rules passed 4/4; the public scan, all 31 mocked Terraform checks and whitespace gate passed.

The headed production-frontend run at `.cache/v1/2026-09-05T23-55-00-346Z-5rArWP/` passed **51/51 tests in one 17.9-minute run**, with zero skipped, flaky or unexpected tests and zero automatic retries. It includes all six journeys at desktop and mobile sizes, both shared identities, exact agreement reopening after a later edit, eight recovery cases, API ownership/conflicts/roles, 28 retained proposal/room regressions, and 320px keyboard/non-drag graphics fallback. Real Pascal rendering, mesh bounds, opening rays, face materials, lights and resource disposal were checked separately from canonical JSON.

First-view encoded resources were 1.90–1.97MB for every template on both desktop and mobile, within the 5MB/3MB budgets. Ready observations were approximately 5.8–7.3 seconds on this development machine. Switching off the selected light changed actual image pixels while other light settings and the camera remained identical. The report contains 105 browser video files, 79 PNGs and six Markdown downloads, including additional participant pages and copies; these counts do not represent 105 distinct journeys.

All sixteen locally authored GLBs were loaded in a headed browser to generate actual-model thumbnails and verify measured bounds within 0.01mm. The model files total 1,978,160 bytes. Home previews come from each canonical Plan SVG. The largest template produced 313 permitted placement candidates; all were independently checked with complete-scene validation. Candidate generation measured approximately 106ms cold and 7ms reused on the development machine. These measurements do not establish physical-device rendering performance.

## Issues found and corrected

The earlier run at `.cache/v1/2026-09-05T23-34-02-481Z-uAIiOR/` passed seventeen browser checks before exposing further issues. It is retained as failure evidence, not counted as a clean release pass.

- Inactive design-tool tabs had insufficient text contrast. Their foreground color was corrected.
- Downloading an existing summary returned 404 because the frontend gateway discarded `revisionId`. The gateway now preserves separately parsed query parameters while retaining its fixed upstream origin and encoded-path boundary. The project and summary had remained stored throughout the failure.
- Generic error selectors also matched Next.js's route announcer. Tests now identify the visible application error inside `main`.
- Headed two-person tests could inspect a background renderer before it settled. Geometry checks foreground the intended page; the shared-chat journey also verifies the completed message write before switching participants.
- Review found that agreements needed a visible version/title/date and a route back to that immutable scene. Agreement cards and decisions now provide these details and **View agreed design**.
- Historical Plan downloads previously used the current scene. They now export the inspected revision with a matching filename and version label.
- Personal screenshot inspection found an offscreen skip-link artifact and overly window-focused interior camera. The skip-link presentation and initial camera composition were corrected.

## Visual review and remaining evidence

Playwright MCP personally exercised project creation, all three home templates, actual Pascal/WebGPU rendering, lights, a manual catalog placement, matched-camera comparison, shared invitations and separate identities, client-selected changes, both decisions, agreement storage/download and preservation after later edits. Desktop and 390px screenshots were inspected. Screenshots captured during a loading overlay are excluded from normal-renderer evidence.

The final independent Impeccable review found only the agreement-version and historical-download issues above. Both were implemented. The completed-pass detector returned zero findings. Final Playwright MCP inspection confirmed the 320px numeric region workflow, a native 3D wall-face click and finish change with unchanged opposite face, the improved eye-level interior, and a successful exact-revision summary download. Normal 3D reported WebGPU with admitted models and no asset failures. The fresh-emulator account lookup rejected an identity retained from the previous disposable stack, then correctly established a fresh guest workspace.

Two small followups came after the clean fixture snapshot: invitation copy now distinguishes saved-design decisions from legacy proposal review, and the unfocused skip link is transparent to prevent full-page recording artifacts while remaining keyboard-focusable. The next isolated production build passed with both changes. Distributed verification runners also stopped depending on a globally installed RTK executable; nine process/configuration/startup/target checks passed. CI now allows 45 minutes and uploads the actual fixture report/evidence paths.

The browser harness now has a strict TypeScript project, including recording and production specifications, using the adapter's real instrumentation types. `npm run typecheck:v1` passed and is included in local verification, CI and Cloud Build; the current complete wrapper therefore has fifteen stages. A later renderer review found that existing registered meshes could satisfy readiness during Pascal's progressive geometry rebuild. Readiness now also requires no reachable dirty build nodes through Pascal's public store/registry. Frontend typecheck and production build passed; the selected-wall journey then passed on desktop and mobile (2/2, 50.6 seconds) at `.cache/v1/2026-09-06T00-55-13-929Z-mvHmDU/`, with Rules 4/4. The recording's partial wall appearance is also consistent with native cutaway, so it is not independently claimed as a failed geometry frame.

## Bounded live rehearsal

The complete live journey passed at `.cache/v1/2026-09-06T01-13-31-687Z-sZWZlC/`: **five jobs, five reserved attempts, all complete on `gemini-3.7-flash`, zero retries**, in 115.5 seconds of headed browser testing. Each of the three homes received an actual admitted pendant and side table. The separate homeowner changed one selected wall face while the opposite face remained unchanged; both people decided on the same revision and downloaded identical stored draft agreements. Reopening retained the agreement and exact design. Actual Pascal geometry, all opening rays, normal 3D screenshots and client accessibility passed. Screenshots and the generated draft were personally reviewed. The draft retained verified changes, revision/decision references and unresolved commercial terms. Local video was disabled for the experimentally established recording/CLI issue below; final live video remains a separate production check.

The initial live run at `.cache/v1/2026-09-06T00-14-59-096Z-geuk5E/` stopped on a browser-harness 20-second response wait during the first submitted generation. It did not establish a completed provider response, and provider dispatch/charging was not confirmed before teardown. This is one submitted job with an unobserved outcome, not a successful model result. Model-response waits now cover the application's bounded request; failed rehearsals retain safe job receipts without authorization headers. A fresh bounded rehearsal is in progress. No failed attempt is silently counted as a pass.

The next run at `.cache/v1/2026-09-06T00-18-36-019Z-cLK9oa/` retained one failed job receipt with one reserved attempt. Its original diagnostic did not expose the underlying cause. One separately bounded direct Vertex diagnostic then succeeded in 8.7 seconds with the same City apartment prompt/schema: a pendant and side table passed the complete patch compiler. It used 24,343 prompt tokens and 25,426 total tokens; private evidence remains outside the checkout.

Safe diagnostics were added without logging upstream bodies, user content or credentials. They distinguish authentication, schema, model, budget, capacity and transport categories. HTTP 408/499/504 remain ambiguous and cannot advance automatic fallback. The full backend suite then passed **235/235**, with typecheck and build. The subsequent browser run at `.cache/v1/2026-09-06T00-29-14-158Z-tl721s/` identified local named-profile authentication failure before the provider call (`502`, authentication category). Its reserved attempt is not a completed inference. No-model authentication probes subsequently passed both with the exact isolated environment and as a separately launched child: the latter verified the named profile in 2.037 seconds and acquired its token in 2.088 seconds. Tokens remained in memory. The earlier authentication failure was not reproduced, so no credential/environment change was justified. Private stage timings are retained outside the checkout.

The synchronized deterministic recording passed separately at `.cache/v1/recording-2026-09-06T00-37-21.467Z/evidence/recording-Synchronized-des-3b167-hearsal-with-visible-clicks/`. Two independently authenticated browser contexts exchange ordinary chat, request a scoped wall change, accept and approve the same saved version, download identical agreements, and reopen the design. `designer-homeowner.mp4` is 108.76 seconds, 1904×1080 at 25fps, and 5,070,465 bytes. Its SHA256 is `162e2d37d68e892c3d54230eda3ffc2cb27446c029036ea0f5f3ac3859e50887`. Role labels, visible pointer/click indicators and invitation masking are part of capture. Actual visual markers synchronize both encoded clips; the composition keeps real timing. Sampled invitation, chat, decisions, download and final normal 3D frames were visually inspected. This is explicitly labelled fixture evidence, with no paid model calls. An earlier capture-only navigation/session-storage failure was corrected before the successful recording.

Actual container startup, the matching production deployment and the live simultaneous-role recording remain pending in this record.

A controlled pair then isolated the local recorded-browser trigger without any model endpoint or dispatch. With the actual headed V1 renderer and video enabled, the exact compiled profile executor timed out at 30.324 seconds; with video disabled it passed profile lookup in 4.231 seconds and token acquisition in 4.256 seconds. Target, executor, working directory, profile arguments and environment key set matched. The probe heartbeat excluded a 30-second Node event-loop blockage. Evidence is `.cache/v1/recorded-auth-pressure-2026-09-06T01-09-04-731Z/` (failure) and `.cache/v1/recorded-auth-pressure-2026-09-06T01-10-44-892Z/` (pass), with credential-free timings stored privately. Exact OS scheduling mechanics are not claimed. Local live verification now disables video while retaining headed interactions, actual geometry and screenshots. Deterministic recordings and the separate production live recording keep video enabled; production uses Cloud Run identity rather than a local CLI. Strict harness typecheck passed. No application authentication timeout or retry policy changed.

The implementation checkpoint is `95f22b6d6bd0fddb1829f3a18d3e1371a8fa204f`. The bounded live run at `.cache/v1/2026-09-06T01-00-13-016Z-LLTX0d/` stopped on its first job before inference: the new diagnostics identified `profile_describe`, `timeout`, 30,738ms. The profile command timed out before any Vertex request. The 72 targeted authentication/provider checks, backend typecheck and build passed before this run. An exact compiled-executor no-model probe then passed with a foreground MCP WebGPU scene (2.666s profile, 2.781s token), leading to the controlled recording comparison above. No timeout increase, silent retry or fixture substitution was applied. Shared ADC still matches its private pre-verification hash.

The production-dependency audit reported no high/critical issues and six moderate transitive reports associated with `uuid`. The [maintainer advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) concerns caller-provided buffers in the v3/v5/v6 methods. Inspected gaxios and teeny-request call sites use v4 without an output buffer; application identifiers use platform UUID generation. The audit findings remain recorded. The suggested forced Firebase Admin downgrade was not applied.

No live Gemini call or deployment is claimed by the fixture results above. Lighting is illustrative and does not model wall occlusion or photometry. Template dimensions are authored; ceiling height is disclosed as assumed. Design acceptance is not a legal signature. Personal Google consent and ideathon publication/submission remain separate activities.
