# Verification status

Executed on 5 September 2026 using Windows, Node.js 22.17.1, Java 21, and the project-local packages. **Real Gemini through Vertex passed both desktop and mobile journeys**, with Firebase Authentication and Firestore kept on local demo emulators. Fixture regression and earlier Developer API billing failures are recorded separately below.

| Check | Current state |
| --- | --- |
| Terraform main/adoption formatting and schema validation | Passed in local tooling |
| Terraform behavior checks | Main/adoption baseline: 7 mock tests passed. Gemini root: 6 mock tests and 3 provider loopback checks passed; saved-plan guards passed and authenticated final plan clean |
| TypeScript and production build | Backend and frontend typechecks/builds passed after the guided workspace changes; frontend ESLint passed |
| Backend unit/API tests | 74 passed in the complete suite, including four Gemini 3.7 request-compatibility checks |
| Firebase emulator access checks | 2 Firestore Rules tests passed again against the running local emulator after the live Vertex journeys |
| Playwright desktop/mobile and accessibility | Guided workspace: 12 distinct checks passed (10 workflow/API checks, then 2 added illustrated-tour navigation checks) |
| Project-local MCP handshake/browser launch | Playwright: 24 tools and successful isolated Chromium launch; shadcn: 7 tools |
| Impeccable detector / visual review | Guided workspace: one completed-pass detector run, zero findings; Playwright MCP desktop/mobile tour, home, source and saved-draft inspection passed |
| Public/private configuration scan | Passed across 139 publishable text files; separate exact-key/OAuth scan passed across 310 publishable/compiled/browser/log files; 2 private state files contained no Gemini key |
| Dependency audit | Rechecked after the explicit OAuth dependency: zero high/critical findings; 13 moderate upstream package reports remain. See dependency-review.md |
| Docker image build | Not run: Docker Desktop engine is not running; Dockerfile and Cloud Build definition are prepared |
| Live Gemini | Vertex `gemini-3.6-flash`: earlier 2/2 browser journeys passed. Requested `gemini-3.7-flash`: catalog and one structured smoke request passed; full updated-UI live journey remains pending at this checkpoint |
| Real Firebase, Cloud Run, Vercel | Not tested or deployed |
| AI Studio initial settings and enhancement evidence | Prepared instructions; actual setup not verified |

## Live Gemini enablement: 5 September 2026

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
