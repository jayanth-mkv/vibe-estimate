# Verification status

This file records **executed** results only. The checks each future release must pass before it can be called done are specified separately, as gates in the [release plan](plan/README.md) — [v1](plan/v1.md#v1-gate), [v2](plan/v2.md#v2-gate) and [v3](plan/v3.md). A planned gate is not evidence; copy a result here only once it has actually run.

## Production journey audit — 5 September 2026

Audited the existing public Cloud Run service from `88f253f` on `feat/spatial-home-studio`. The runner resolved the canonical HTTPS origin from external operator configuration and checked it against the authorized backend project and region. Health returned HTTP 200, `runtime=production`, `auth=firebase`, `storageConnection=cloud`, `aiProvider=gemini`, and `geminiTransport=vertex`. A read-only service API check confirmed `gemini-3.7-flash`, the required campaign label, readiness, 100% latest-revision traffic and image digest `sha256:537163883e4db76eab8e16c341b0301c4dc2e6990a27e4d9871e5d146a9d4f43`; shared ADC was unchanged. These are production Firebase/Vertex results, separate from the historical emulator and connected-local results below.

**All 15 distinct production Playwright checks have a passing result across the initial and targeted runs below. This was not a single all-green run.** The [quick checklist](quick-test-checklist.md) states the remaining coverage limits. Evidence, synthetic responses and exports are outside the checkout under `../docs/private/production-verification/`; browser traces, video and automatic screenshots are disabled. The runner now allowlists worker environment variables to exclude inherited credentials and debug capture, and validates canonical external evidence paths, including Windows case aliases and symlinks.

| Private run directory | Executed result |
| --- | --- |
| `2026-09-05T15-10-26-087Z` | Two-person room passed with two real Gemini observations; 390px offline-save recovery passed. Solo review reached one real response, then the test failed on a collapsed clarification field. |
| `2026-09-05T15-15-54-601Z` | Solo two-turn review, clarification, draft, revision, reload, export and ownership denial passed after opening the native clarification disclosure. |
| `2026-09-05T16-31-10-158Z` | Source wizard, all three example source saves/reopens and desktop tour passed. Hidden lazy home-art checks failed at three narrower widths; expanded room test exceeded its initial 210-second budget. |
| `2026-09-05T16-34-51-025Z` | Finish example passed one real Gemini review. Wardrobe stopped on an ambiguous alert selector after an injected outage, before a real call. |
| `2026-09-05T16-37-27-928Z` | Wardrobe passed one real Gemini review and lost-successful-response draft retry. Google cancellation checks reached Google but failed on selectors also matching Next's route announcer. |
| `2026-09-05T16-40-10-923Z` | Expanded room check passed in 4.4 minutes within an explicit six-minute budget; tour passed at 320, 390, 768 and 1440px after explicitly decoding the decorative lazy asset. Five checks passed. |
| `2026-09-05T16-45-08-120Z` | Three Google popup-cancellation journeys passed after scoping alerts to the app's main region. |

The audit made **seven real model calls**: two room observations, one solo call before the disclosure selector failure, two in its targeted rerun, and one each for wardrobe and finish. There were no automatic retries or fixture substitution. Invitation/access, Google, wizard and responsive checks made no model calls. Test rooms were paused before or after their bounded observations; the expanded message-recovery room remained paused throughout message writes.

The solo and shared-room journeys confirmed source quotations, included kitchen lighting, missing-price handling, a context-dependent six-light matte-white proposal at the owner's ₹2,000.50 rate, a **₹12,003** saved draft and a four-light **₹8,002** revision. Revisions, original evidence and shared snapshots survived reload; the client could not prepare/share private drafts or read/export the private project. Exports retained correct integer-paise totals and approval-uncollected wording. Wardrobe asked for an unconfirmed drawer price; finish asked for missing veneer area and rate. Neither populated draft quantity or pricing. The wardrobe owner then explicitly supplied three units at ₹1,500.25; retrying a lost successful save retained exactly one **₹4,500.75** draft.

Additional production checks decoded QR pixels, verified clipboard contents in memory, replaced invitations, denied stale links/codes, joined by direct link and formatted code, removed consumed fragments, and proved separate designer/client UIDs in one browser. Both directions of chat persisted. A lost successful message response retried the same request and retained one message. Connection loss preserved the composer; reconnection and unsent-navigation cancellation worked. Both room roles and all three mobile panes passed targeted WCAG A/AA axe checks and overflow checks at 320, 390, 768 and 1440px. Home, tour and checked draft states passed the same four-width checks. Playwright MCP also verified the live compact home, tour keyboard tabs/return, image decoding and a genuine Google handoff.

Google handoff/cancellation passed from an empty home, a populated guest project and client recovery. Guest UIDs and saved work remained unchanged after cancellation and reload. **Completed personal Google sign-in/linking and account recovery still require the operator's consent check.** Resized Chromium and QR decoding do not establish physical-phone camera or assistive-technology coverage. Production persistence here means browser reload/reopen, not a controlled service restart.

Supporting checks executed at this stage: 34 configuration/continuity/environment tests, 24 frontend authentication/runtime/request tests, frontend lint, frontend read-only TypeScript and production-harness TypeScript passed. The observer's pending-claim capacity race was reproduced locally and fixed in `359d71d`; 158 backend tests and backend build passed. A separate local reproduction found duplicate direct review dispatch and clarification replay superseding a draft. The subsequent verified recovery checkpoint is below. These source fixes are not a deployed-image result. No infrastructure was changed during this audit.

## Review recovery and isolated regression — 5 September 2026

The backend now claims a durable review request before dispatch, retains bounded request receipts and staged output, and returns the current project on replay. Cross-instance recovery, expired claims, late responses, failed saves and explicit retry all preserve ownership and project version checks. The backend stage is committed as `71263a2`; the frontend and isolated browser regression stage is `8f3ef55`. The browser retains a user/project-scoped request note, offers **Check review status** or **Finish saving**, and permits a corrected clarification only for a server-confirmed explicit retry. Checking a lost response preserves current owner pricing and later saved drafts. Normal reload restores saved values. See the [recovery contract and threat controls](review-recovery.md).

The fresh emulator run exposed an empty string rendered inside `<head>` when no runtime Firebase web-config script was present. React's hydration failed, the document title disappeared, and unstyled elements intercepted navigation. Rendering `null` for the absent script fixed the defect. The production service already supplies runtime configuration, so its earlier browser results remain separate.

| Executed check | Result |
| --- | --- |
| Backend unit/API and transactional store suite | **183/183 passed**, including duplicate/concurrent dispatch, late-result fencing, staged-save recovery, legacy replay, cross-owner denial and preserved later drafts. Backend build passed. |
| Frontend unit tests | **44/44 passed**, including request-note scoping, server-authoritative retry permission, request serialization, error metadata, identity transitions and authentication/runtime protections. |
| Configuration, emulator continuity and evidence environment | **34/34 passed**; credential/debug aliases and invalid evidence/config paths fail closed. |
| Firestore Rules | **3/3 passed** on fresh emulators, including direct browser access and room/membership denial. |
| Desktop/mobile Playwright | **28/28 passed in one clean 8.9-minute run**: 15 desktop and 13 mobile checks. Evidence is `.cache/fixture-verification/2026-09-05T17-37-53-140Z-LnRB3r/`; the final manifest records successful stages and no imported workspace. |
| Lint and type checks | Frontend lint/type checks, backend build and strict fixture/production test-harness TypeScript passed. |
| Optimized frontend build | Passed from a clean isolated source copy, without credentials or changes to the running app's build output. Evidence is `.cache/build-verification/2026-09-05T17-33-51-217Z-p8IyAV/`. |
| Impeccable and live MCP inspection | The completed recovery UI pass reported zero detector findings. Playwright MCP checked the 320px interrupted-request screen, keyboard status check and safe return to review; no page overflow or uncaught page errors. Injected failed requests were expected. |
| Public files and documentation | Focused public/private scan passed across **244 text files**; all **67 relative links** in seven reviewed documents resolved. Git whitespace checks passed. |

The optimized build, current checkout and final fixture frontend matched all 52 source/asset files. The recorded SHA-256 is `99c3005e16a313b5c2e193c78d945fa3ef769314a4dd3b7a392eff4d1e6a7368`.

The four new browser journeys ran on both desktop and mobile: lose a successful clarification response, save a later draft and recover after reload; lose an unaccepted request and check its absence before starting another; recover a first review alongside a draft saved by the same owner in another tab; and correct a real fixture-provider rejection before an explicit retry. Existing tests also passed source validation, owner pricing, draft/revision/export, room chat, sharing, QR/code rotation, role denial, lost save/message responses, observer failure and keyboard/axe checks. Fixture rejection is not evidence of a real Gemini outage.

| Earlier isolated attempt | Actual outcome and correction |
| --- | --- |
| `2026-09-05T17-07-08-473Z-PWqDfw` | Readiness helper incorrectly called Fetch's boolean `response.ok` as a method. The runner stopped its own services before any Rules/browser checks. Corrected the helper. |
| `2026-09-05T17-13-05-162Z-lUl6Sf` | 15 browser checks passed and 13 failed. This run began before the head fix and received the layout patch mid-run, so it is not a clean result. Its trace confirmed hydration/intercepted navigation; remaining test-only failures selected a disabled fixture example or expected outdated shared error wording. Tests were corrected without forced clicks, relaxed accessibility assertions or automatic retries. |

`rtk npm run test:isolated` now creates an empty emulator workspace and separate frontend/backend ports, verifies both direct API and same-origin gateway fixture health, runs Rules plus browser tests, and stops only its own children. The connected app on ports 3000/8080 and the saved emulator workspace were preserved. This regression made **zero Gemini calls**. Final Playwright MCP return to production confirmed the existing populated home, its title and healthy Firebase/Vertex runtime; an initial empty-home heading expectation was corrected for that retained guest workspace. No new production rollout, Terraform resource change, push, outreach or submission was performed.

## Initial production hardening — 5 September 2026

Branch: `fix/initial-production`, isolated from spatial work. Connection stage committed as `6544aeb`.

Executed before deployment:

- Reproduced the connected browser-origin mismatch: `localhost:3000` accepted; `127.0.0.1:3000` rejected by the old direct API preflight.
- Five same-origin gateway/recovery tests passed; 25 local/connected configuration tests passed.
- 156 backend tests passed, including managed-task identity denial, debounce, duplicate delivery, failed enqueue recovery and interrupted paid-lease handling.
- 24 frontend tests passed, including independent guest recovery identities and runtime public-config field allowlisting/HTML escaping.
- Workspace type checks, frontend lint and optimized Next.js build passed. The scoped Impeccable detector reported no findings for the changed request surfaces.
- A separate production-build preview passed the 390-pixel mobile offline-save/retry journey against real Firebase: inputs retained, retry saved once, no horizontal overflow and no tested WCAG A/AA axe violations.
- Terraform validation passed. The original Firebase wrapper replacement plan was blocked by `prevent_destroy`; the corrected plan imports and updates authorized domains in place. The bootstrap and foundation applies succeeded. Private configuration values were absent from the image source archive and write-only configuration was absent from the saved Terraform plan. Shared ADC hashes remained unchanged.

The deployed end-to-end checks, Google consent, specific Gemini API-key evidence and genuine AI Studio build evidence are still pending at this checkpoint. See `production-readiness.md` and the inventory for the room-schema decision and cloud resources.

The subsequent Cloud Build and Terraform deployment succeeded. The public service health returned HTTP 200 with `runtime: production`, Firebase authentication, cloud Firestore and Vertex. Three Firebase Rules checks also passed in an isolated local emulator, which was stopped afterward. Public end-to-end journeys remain pending. A fresh Developer API probe still returned HTTP 429/prepaid balance; it is not a working alternative to Vertex yet.

## Earlier connected/local verification

Executed on 5 September 2026 using Windows, Node.js 22.17.1, Java 21, and the project-local packages. **The connected two-person journey now passes with real Firebase Authentication, the operator's existing Firestore database, and Gemini 3.7 Flash through Vertex.** Earlier desktop/mobile live reviews and shared-room checks with local emulators remain separate evidence below. Guest entry requires no login form, and deployment remains deferred.

The initial version is preserved at `4fa4d70` on `snapshot/initial-connected-v1`. The later `feat/spatial-home-studio` checkpoint contains [research and a complete implementation plan](spatial-home-studio-plan.md) only. No spatial app code, dependencies, uploaded plans, model calls, cloud resources or deployment were added in that stage. Its proposed 3D/recognition/performance checks are not executed results.

Planning checks: 198 publishable text files passed the focused public/private scan; 42 relative links across eight edited documents resolved; Git whitespace checks passed. Application, test, script, dependency and Terraform files have no changes from the initial snapshot. Technical/UX reviews checked the proposed geometry, asset, permission, budget and compatibility contracts. Existing application tests were not repeated for documentation-only changes.

| Check | Current state |
| --- | --- |
| Terraform main/adoption formatting and schema validation | Passed in local tooling |
| Terraform behavior checks | Main/adoption baseline: 7 mock tests passed. Gemini root: 6 mock tests and 3 provider loopback checks passed; saved-plan guards passed and authenticated final plan clean |
| TypeScript and production build | Backend build passed after the quota fix; frontend production build, TypeScript and ESLint passed after Google room recovery |
| Backend unit/API tests | 152 passed, including installed Firebase Admin quota-header and fail-closed credential regressions |
| Configuration and guest recovery | 25 environment/path/continuity tests and 17 frontend authentication/recovery tests passed |
| Firebase emulator access checks | 3 Firestore Rules tests passed, including direct room/membership denial for designer, client and guest |
| Playwright desktop/mobile and accessibility | Full updated fixture suite: 20/20 passed in 5.8 minutes (11 desktop, 9 mobile), including QR decoding and room-code joining |
| Project-local MCP handshake/browser launch | Playwright: 24 tools and successful isolated Chromium launch; shadcn: 7 tools |
| Impeccable detector / visual review | Guided workspace and shared room: one detector run per completed UI pass, zero findings; Playwright MCP desktop/mobile inspection and shadcn checklist passed |
| Public/private configuration scan | 195 publishable text files passed; exact-key/OAuth scan passed across 391 publishable/compiled/log files; 2 private state files contained no Gemini key |
| Dependency audit | Rechecked after QR/decoder dependencies: zero high/critical findings; 13 moderate upstream package reports remain. See dependency-review.md |
| Docker image build | Not run: Docker Desktop engine is not running; Dockerfile and Cloud Build definition are prepared |
| Live Gemini | Requested Vertex `gemini-3.7-flash`: connected guest-room journey passed with 2 real observations; earlier 3 emulator-backed live journeys also passed |
| Real Firebase | Guest identities, source/room saving, code join, draft/revision, sharing, reload/export and client denial passed; cloud record fingerprints matched across an app restart |
| Google SSO | Real Google popup reached from home and client recovery; cancellation retained guest sessions. Completed personal account consent/sign-in remains unverified |
| Cloud Run and Vercel | Deployment deferred; no deployed application URL |
| AI Studio initial settings and enhancement evidence | Prepared instructions; actual setup not verified |

## Live Gemini enablement: 5 September 2026

### Connected Firebase and Gemini checkpoint

The active app is **http://localhost:3000**, started with `dev:connected` and external private configuration. The backend reports `runtime=connected`, `auth=firebase`, `storageConnection=cloud`, `aiProvider=gemini`, and `geminiTransport=vertex`. The private model setting is `gemini-3.7-flash`. No emulator is started in this mode, and the earlier local workspace remains in its verified ignored snapshot. Firebase and Vertex use their separately authorized projects. No infrastructure or billing changes were needed for this connection.

**One complete connected browser journey passed in 1.8 minutes**, using two real, independent anonymous Firebase identities. It decoded the actual QR image, joined through a formatted room code, exchanged two messages, and waited for each real Gemini observation separately. It verified included kitchen lighting, a six-light matte-white addition, a missing-price question, then the owner's ₹2,000.50 confirmation and exact source quotations. The designer prepared a private **₹12,003** draft, explicitly shared it, saved a four-light **₹8,002** revision, and shared the second version. Both saved shared versions survived reload with the same guest identities. Replay did not duplicate saves or shares. Client access to private projects, export, draft preparation and sharing was denied. The owner downloaded revision 2 with correct integer-paise totals and preserved original evidence; approval remains uncollected. Keyboard and targeted axe checks passed.

This run made **two real model calls**, with no automatic retries or fixture fallback. The observer was paused afterward. A separate read of the exact synthetic room, owner membership record, original project and revised project produced identical content fingerprints before and after a complete app stop/build/restart. Both revisions, both messages and both shared versions remained intact. Shared ADC hashes matched across the live test, credential diagnostics and persistence restart check.

Evidence is retained in `.cache/connected-firebase-runs/2026-09-05T09-23-39-001Z-15264/`: HTML report, inline synthetic observation/verification/export attachments, and explicit completed-room screenshots. Automatic failure screenshots, video and traces were disabled. Only completed synthetic room views without an invitation dialog or URL fragment were captured. Public copies show the [designer](screenshots/connected-designer-room.png), [client](screenshots/connected-client-room.png), and [guest home](screenshots/connected-home.png).

Google linking keeps existing guest UIDs. Returning clients use a separate Firebase app for the requested room; server-confirmed client membership is required before remembering that choice and on subsequent reload/polling. **17 frontend tests** cover popup/network failure, wrong account/room/role, multiple recovered rooms and preservation of existing guest identities. Playwright MCP reached the real Google sign-in page from both home and client recovery, cancelled it, and verified the same guest token was retained. The recovery page passed axe at 320 and 1440 pixels with no horizontal overflow and a 56-pixel header; the connected home header is 57 pixels. Final frontend build, TypeScript, ESLint and a completed Impeccable detector pass succeeded. The operator's own completed Google consent remains a separate pending check.

Working stages: `ecf1832` preserves emulator sessions; `152cc45` adds explicit connected Auth/storage and room codes; `1ed16c4` adds guest entry and QR invitations; `6b9f326` fixes real Auth quota routing; `a30aaea` preserves guest sessions during Google room recovery. The connected stages are on `feat/connected-firebase-rooms`; nothing was pushed or deployed.

### Guest access and room-code fixture checkpoint

Guest entry, `/join`, QR/link/code invitations, invitation replacement and optional Google account access are implemented. The default demo remains on emulators. The separate connected launcher requires matching private Firebase/Vertex configuration and passes only public Firebase SDK settings to the frontend; it never starts emulators or discovers shared ADC. Its real private settings were validated without displaying values, and the connected service started successfully. The later connected application results are recorded above.

Executed: **150 backend tests**, backend/frontend production builds, frontend TypeScript/ESLint, **25 configuration tests**, **20 fixture browser checks** and **3 Firestore Rules checks** passed. The QR checks decoded actual rendered pixels, verified invite replacement and stale-code rejection, joined with a formatted code, and checked same-client replay and stranger denial. Desktop and mobile included 320-pixel layout, keyboard/Escape focus and accessibility. Those QR-only checks made zero observer calls. The remaining full journeys retained the source, pricing, draft/revision, sharing, persistence, export and failure assertions. The final emulator snapshot preserves **92 users, 71 projects and 21 rooms**.

Playwright MCP inspected the join form and invitation dialog at desktop and mobile widths, including invalid-code focus and invitation replacement. The official shadcn Dialog was generated with the project-local CLI and its checklist reviewed. The completed Impeccable detector pass returned zero findings. The original theme, artwork and `/welcome` remain intact. Google linking code preserves the current guest UID on cancellation/collision/failure; genuine Google consent is still unverified.

Connected bring-up exposed two issues before any model call: Admin's custom OAuth credential omitted the Firebase quota-project header, and the development server's generated route state omitted both dynamic room pages. Pinning the validated Firebase quota project fixes the first; two regressions exercise the installed Admin SDK's real header/credential behavior, and the full backend suite now passes **152 tests**. Real Admin reads and guest project reads/writes/room creation succeed. For the second, the source routes and production manifest were correct; preserving the old `.next/dev` directory as an ignored backup and restarting with a fresh dev cache restored both room routes to HTTP 200. The original cache-corruption trigger is unproven. Startup now checks the home/join/room pages before announcing readiness. The failed Auth and routing browser attempts remain in `.cache/connected-firebase-runs/2026-09-05T08-58-17-635Z-18252/` and `2026-09-05T09-13-31-536Z-24728/`; they made zero model calls. A preceding runner preflight bug also stopped before browser/model activity and was fixed. Shared ADC hashes matched across these checks.

### Gemini 3.7 and shared-room live checkpoint

The active local stack uses `gemini-3.7-flash` on Vertex global/v1 through the authorized named profile. Health reports `aiProvider=gemini`, `geminiTransport=vertex`, `auth=emulator`, and `storage=firestore`. The private model configuration stays outside this repository. Shared ADC hashes matched before and after both live runs. The existing six Terraform resources are unchanged; no additional cloud resources, billing changes or deployment were needed.

The first bounded run passed the **two-person room journey in 1.7 minutes** and **mobile review journey in 46.2 seconds**. Desktop completed both real reviews but failed axe's `scrollable-region-focusable` rule: longer Gemini evidence made the source panel scrollable without keyboard access. The panel now has a named, focusable region and an inset visible focus outline. Only that affected desktop journey was rerun; it passed **in 28.1 seconds**, including both real reviews, draft creation, revision, persistence, export, keyboard interactions and the unchanged axe checks. Frontend production build, TypeScript and ESLint passed after the fix.

There were **eight real model calls across these two verification runs**: six in the initial bounded run, including the two before the desktop accessibility failure, and two in its targeted rerun. There were no automatic test/model retries and no fixture fallback. All three distinct journeys now pass; this does not represent a single all-green run.

The new room journey used independent designer and client Firebase emulator identities. A client message triggered the first Gemini review and a designer reply triggered the second. Both messages arrived in the other person's interface. Exact source quotations, included kitchen lighting, the new matte-white finish and the owner's confirmed ₹2,000.50 price were checked against the frozen transcript. The designer prepared a private six-light **₹12,003** draft, explicitly shared it, revised it to four lights for **₹8,002**, and shared the new version. Both retained shared copies survived reload; the original source project stayed unchanged. The client was denied draft preparation, sharing, private-project access and private export. The owner downloaded revision 2 with correct amounts and source evidence. Observation was paused after the test without an additional model request.

Evidence directories, retained under ignored `.cache/live-gemini-runs/`:

- `2026-09-05T07-28-49-264Z-29004/`: the room and mobile passes, the original desktop failure, synthetic model responses, exports, screenshots and HTML report.
- `2026-09-05T07-37-45-559Z-1368/`: the successful targeted desktop rerun and its synthetic responses, export, screenshots and report.

[Live client-room screenshot](screenshots/live-client-room.png) shows the actual two-person Gemini verification with both shared revisions. It contains fictional project data. Browser traces and emulator session data remain ignored.

Before switching from fixture to live Gemini, a complete stack restart restored **51 local Auth users, 41 projects and 10 rooms**, matching their saved content fingerprints. After the live runs, a new verified six-file snapshot retained **59 users, 46 projects and 11 rooms** under ignored `.cache/firebase/workspace`. That final snapshot has been exported and checked; the running stack has not been restarted again. Export again before a future planned stop to retain later changes.

A later check of an older browser identity exposed a separate restart issue: Auth emulator import resets the account's token-validity time, so Firebase Admin rejects an otherwise refreshed session that signed in before import. The startup repair now restores only the verified snapshot's original revocation boundary before the app starts. It rejects account or security-field drift and retains intentionally revoked/disabled identities. An anonymous account without an explicit boundary uses its verified creation time. Firebase Admin verification remains unchanged.

The repair passed six focused tests against the installed emulator and Admin implementations. A complete subsequent stack restart restored **61 Auth users, 49 projects and 13 rooms**, including the new security-state fingerprint. The original browser identity then received HTTP 200 and its three saved projects without signing in again. Snapshots and backups remain ignored, and this repair is restricted to the fixed local demo emulator startup.

Working history is preserved on separate local task branches: `b04d544` on `feat/guided-workspace`, `b7ca603` on `feat/shared-project-rooms`, and this live-fix/evidence stage on `test/gemini-37-live-rooms`. Nothing has been pushed or deployed. Actual AI Studio build evidence and the remaining [challenge evidence](ai-studio-evidence.md) are still outstanding.

### Shared-room working checkpoint

The designer and client now have separate authenticated pages backed by the same emulator-persisted room. Desktop shows Conversation, Scope agent and Shared drafts together; mobile has three accessible tabs. The backend observes debounced new messages with persisted per-room budgets/leases, one active call per owner and four globally. Polling never calls a model. Invitations are hashed, expiring and restricted to one client. Read/write roles are derived from verified Firebase identities; clients cannot access private projects or control pricing, observation and sharing.

A current source-linked room review freezes into a new private project without modifying original sources. The owner prepares/revises/exports its draft, then explicitly shares a saved snapshot. Previous shared versions are immutable. Prepared room projects retain their room link and support strict lighting-fixture follow-up as well as live Gemini. Rooms retain their initial provider mode; changing the stack's provider fails closed for old rooms rather than silently invoking a different provider.

Executed: **100 backend tests and backend build passed**; frontend production build, typecheck and ESLint passed. **Six room integration checks passed** (four API/failure passes, then both full journeys after fixing a test selector that also matched Next's route announcer). Full desktop/mobile room journeys took 1.4 minutes and 50.4 seconds. They used independent identities, recovered a lost successful message response without duplication, followed observation into private draft creation, shared and revised it, verified both retained shared versions, reloaded/exported and denied unauthorized roles. All **three Firestore rules checks** passed. The existing **12 browser/API checks passed again in 2.7 minutes** after room integration. The room report is retained in ignored `.cache/room-fixture-report`; the final original-flow report is in `playwright-report`.

Playwright MCP additionally verified two different identities in tabs of the same browser, real messages in both directions, a current room review and a ₹12,000 saved draft appearing in the client view. Client controls excluded designer actions. Client layouts had no horizontal overflow at 320, 390 and 768 pixels. The desktop uses three adjacent work panes. The consumed invite was removed using Next-compatible history updates; only still-unshared drafts retain the sharing action. A completed room UI detector run returned zero findings, and the shadcn checklist was reviewed. Screenshots remain under `.cache/mcp-output/` with `shared-room-*` and `client-*` names. This is fixture evidence; the new three-journey live Gemini suite is prepared but unexecuted at this checkpoint.

### Guided workspace checkpoint

The original illustrated product story remains at `/welcome`; the compact home at `/` explains Sources → Review → Draft, offers three fictional professional scenarios and shows saved projects with a next action. A two-step source form retains text on Back and signs in only at the final save. Review and Draft have separate panes with original sources alongside them, citation focus, owner-controlled prices and truthful saved milestones. The navy/red palette, local fonts and both original illustrations remain. The home also reuses the designer illustration. [UX research and decisions](ux-research.md) records the official Google/Material references and unvalidated product assumptions.

Executed fixture checks: **10 workflow/API tests in 1.7 minutes**, then **2 added desktop/mobile tour regressions in 24.6 seconds**. The latter verifies original image decoding, keyboard workflow tabs, route return without style leakage, header under 65 pixels, accessibility and no overflow. The standard report was replaced by the last targeted run; the earlier complete run's successful output is retained in the execution record. Both Firestore denial tests passed again. Ten environment-boundary tests and all 74 backend tests passed. The production build contains both `/` and `/welcome`; backend build, TypeScript and frontend lint passed. Windows initially denied existing generated cache files; reruns with the authorized filesystem access passed.

Playwright MCP inspected home at 320, 390, 768 and 1440 pixels: no horizontal overflow and a 57-pixel workspace header. A real fixture interaction followed citations, clarified quantity, saved a draft and reloaded it on mobile with sources collapsed. Draft layouts at 390 and 320 pixels had no page overflow. Both retained tour images decoded successfully. Screenshots are under ignored `.cache/mcp-output/` (`onboarding-home-*`, `retained-landing-*`, `project-sources-desktop.png`, `draft-*`). The shadcn audit checklist and one Impeccable detector run passed with zero detector findings.

Local emulator state is now explicitly exported before a planned restart and imported only from the verified, fixed demo-workspace snapshot. A real restore matched **8 local auth users and 4 saved projects**, including content fingerprints. Snapshots and backups remain ignored. This adds complete-stack restart evidence beyond the earlier reload/reopen-only verification; later changes require another export before stopping services.

The requested `gemini-3.7-flash` exists in the authorized Vertex catalog and passed exactly one structured-output smoke request (731 total tokens). Private configuration now selects it. The adapter uses the supported LOW thinking setting, omits deprecated sampling parameters for this exact model and bounds SDK attempts to one. Shared ADC was preserved. No cloud resource changes were required. Full updated-UI Gemini 3.7 application verification is still pending at this checkpoint; the successful earlier 3.6 run below remains separate evidence.

### Successful Vertex application verification

Read-only discovery confirmed the authorized personal profile, backend project, Cloud Billing linkage and existing prediction/service-use permissions. Terraform enabled the additional Vertex API with **1 add, 0 change, 0 destroy**. The isolated root now manages six resources, and its final authenticated full plan reported **no changes**. No new IAM grants or credentials were required for Vertex. Exact resource identifiers, state, plans, plan-context manifest and the Developer API credential remain outside the checkout. See [infrastructure-inventory.md](infrastructure-inventory.md).

The backend uses `@google/genai` with an explicit compatible OAuth client, project and quota project. Each review obtains a fresh short-lived token from the verified named gcloud profile. The private `vertex-local.json` contains only transport/model/profile metadata and the existing private gcloud configuration directory. No API key, refresh token, ADC file or service-account private key is copied into the checkout. Vertex mode is local-only; production still requires its separate deployment configuration.

A structured-response smoke request succeeded with `gemini-3.6-flash` on the global Vertex endpoint using API version `v1`. The subsequent browser run passed **2/2 tests in 2.4 minutes**, with exactly two real reviews on desktop and two on mobile, no test retries and no fixture fallback. The health endpoint reported `aiProvider=gemini`, `geminiTransport=vertex`, `auth=emulator`, and `storage=firestore`; the frontend returned HTTP 200 and displayed the Gemini-enabled label.

Both live journeys verified:

- Exact source quotations, included kitchen lighting and useful questions about ambiguous quantity and missing price.
- A context-dependent follow-up incorporating six matte white display lights and the owner's confirmed ₹2,000.50 rate, while preserving original evidence and requiring explicit pricing in the draft form.
- A six-light **₹12,003** draft and four-light **₹8,002** revision, calculated in integer paise; the first version remains preserved and client approval remains uncollected.
- Missing-price denial, duplicate-save replay without an extra revision, reload/reopen persistence and a downloaded revision-2 export containing source evidence and correct amounts.
- Unauthenticated and foreign-owner denial before model invocation, keyboard interactions, no mobile overflow and zero targeted axe accessibility violations on the checked review/draft screens.

Evidence is retained in ignored `.cache/live-gemini-runs/2026-09-05T04-54-10-492Z-12696/`: HTML report, synthetic responses, exports and desktop/mobile screenshots. Shared ADC passed a SHA256 comparison across the entire live browser run as well as the authenticated Terraform operations. Persistence is verified across reload/reopen while emulators run; complete stack restart persistence is not claimed.

Ten local environment tests passed, including backend-only secrets, mixed-case Windows aliases, explicit Vertex/Firebase project separation and canonical path rejection. Twelve PowerShell path-guard cases and saved-plan guards passed, including parent/final-destination junction rejection for credentials, state, backups, locks, plans and manifests. File-symlink creation lacked OS privilege; equivalent final-destination junction cases were executed. An actual Windows preflight exposed nested JSON argument arrays in the PowerShell bridge; removing the outer array wrapper fixed profile and token retrieval. The added regression executed real PowerShell 5.1 with a fake gcloud function and verified separate scalar arguments without cloud access. Backend production compilation passed. Raw credentials and command errors were never displayed.

### Developer API billing recheck and earlier attempts

Initial discovery found no compatible existing key. Terraform provisioned the three Developer API prerequisites, a dedicated service account and a service-account-bound key restricted solely to Gemini. Metadata was verified before its value was captured directly into private configuration. The initial API prerequisite recovery is retained in the inventory.

The Developer API still returns HTTP 429 with depleted prepaid balance even though Cloud Billing is enabled and model listing succeeds. The earlier two browser journeys reached review and received a safe `502 AI_UNAVAILABLE`, preserving saved state; their evidence remains in `.cache/live-gemini-first-failure/`. Earlier diagnostics also found a listed `gemini-2.5-flash` returning 404 for generation. These attempts are not counted as successful live verification.

The operator's Cloud-credit screenshot prompted the Vertex recheck. Google Cloud welcome credits have different eligibility from the [Gemini Developer API prepaid balance](https://ai.google.dev/gemini-api/docs/billing); Google offers covered Gemini usage through [Vertex AI / Agent Platform](https://cloud.google.com/products/gemini-enterprise-agent-platform). The Vertex requests succeeded without a prepaid purchase or billing-account modification. Individual credit deductions have not been reconciled against a billing report.

### Fixture regression and reproduction

The complete redesigned-UI fixture regression passed **8/8 tests in 1.9 minutes** with `rtk npm run test:e2e -- --timeout=90000`. Desktop and mobile full journeys took 30.3 and 34.9 seconds. Assertions were unchanged; the explicit 90-second budget resolves an earlier 45-second mobile timeout without treating that earlier run as a pass. These tests cover clarification, source references, owner pricing, deterministic totals, preserved revisions, reload/reopen, export, keyboard use, accessibility, API denial, replay and fault recovery. Fixture evidence remains distinct from the real Vertex run above.

Run `rtk npm run test:config` for the environment boundary and the private-path guard command documented in the Terraform root for launcher paths. Start the explicit private Vertex configuration as described in [local setup](local-setup.md), then run `rtk npm run test:live` for another bounded desktop/mobile journey. New evidence uses a fresh timestamped directory. [AI Studio and submission evidence gaps](ai-studio-evidence.md) remain separate from local model integration and deployment stays deferred.

## Petpooja-reference UI verification

The user-pinned [Petpooja reference](https://www.petpooja.com/) now informs the navy/red palette, locally hosted Poppins and DM Sans typography, centered hero, laptop/phone demonstration, workflow tabs, illustrated feature panels and workspace controls. Two original generated WebP illustrations, their prompt/provenance record, and local font licenses are included. DESIGN.md and both Impeccable surface briefs retain the direction; the frontend brief resolves from the frontend boundary.

The final Next.js production build, TypeScript, ESLint and one Impeccable detector pass completed successfully (zero detector findings). Playwright MCP verified mobile menu opening, Escape/focus return, anchor closing and keyboard tab arrows. No page overflow was found at 320, 390, 768 or 1440 pixels. The independent reviewer inspected desktop/mobile landing, review and saved-revision screenshots. The phone preview's clipped approval note/history was corrected, and screenshots were recaptured after both lazy-loaded illustrations decoded. Final independent review passed with no material fixes remaining. The shadcn audit checklist was reviewed: imports and dependencies compile, images are local, and lint, TypeScript and browser checks pass.

The [README screenshot](screenshots/welcome.png) shows the fictional preview captured during fixture verification. Final full-page desktop/mobile screenshots remain in ignored `.cache/mcp-output/vibeestimate-petpooja-*-final.png`; fixture workflow evidence remains in its Playwright report. The stack now runs Vertex with local Firebase emulators; its genuine live workflow screenshots are in the separate timestamped report above.

All demo people and amounts are synthetic. Local emulator tokens and browser traces are test artifacts and remain ignored. Passing local tests does not establish market validation or production service configuration.

The integration journey verifies real emulator sign-in, unauthenticated denial, another user's read/write/export denial, included-item handling, context-dependent fixture clarification, required prices, deterministic totals, transactional replay handling, preserved revisions, reload, and draft download. Browser failure tests inject a review outage and lose a successful save response, then verify recovery without duplicate revisions. Automated accessibility checks cover welcome, review, saved draft, and the leave-confirmation dialog at desktop/mobile sizes.

The GitHub Actions workflow is prepared but has not run remotely. No cloud plan, apply, import, deployment, commit, push, or submission was performed during the original local setup. The later Gemini-only Terraform work and successful Vertex conversations are recorded above. Actual AI Studio configuration/build history, deployed Firebase, Secret Manager and Cloud Run evidence remain outstanding for the challenge.
