# Current product test checklist

Use this checklist for the home-to-agreement release defined in [v1](plan/v1.md). Check results against a named source/build and provider; requirements are not executed evidence.

Completed checks, retained failures and the live two-person video are indexed in the [current verification record](v1-verification.md).

The [September 5 checklist](quick-test-checklist-2026-09-05.md) is a frozen historical record for the earlier proposal-first application. Its passes do not certify the new home studio.

| Surface | Current responsibility |
| --- | --- |
| / | Private home library, New project, saved shared-room entry |
| /projects/:id | Three complete templates, real Plan/Overview/Inside, Gemini and precise manual changes, history and design export |
| /rooms/:id | Designer's shared home, chat, invitations, approval and agreement library |
| /client/rooms/:id | Separate homeowner identity, same layout/chat, acceptance and shared downloads |
| /join | Invitation code entry and membership |
| /proposals | Retained source review, confirmed commercial terms, proposal revisions and private exports |
| /welcome | Updated optional product tour |
| /studio | Redirect to current home library |

## Required run evidence

- Record exact source commit, provider, browser, viewports and evidence directory.
- Use empty demo Auth/Firestore emulators for deterministic tests; never point fixture tests at production.
- Keep live Gemini jobs separately labelled and bounded: the local all-home journey allows five jobs/ten reserved attempts; the production recording allows three jobs/six attempts. Neither permits test retries.
- Verify actual Pascal meshes, openings, transforms, selected wall faces and light effects in addition to canonical JSON.
- Inspect normal 3D screenshots personally with Playwright MCP; fallback screenshots are separate.
- Preserve successful headed videos of all six flows and a clean synthetic live narrative.
- Exclude credentials, personal data and invitation fragments from distributable evidence.

## Six flows and recovery

| Check | Expected result |
| --- | --- |
| Every starting home | Authored measured layout loads; actual catalog objects render; Gemini fills a saved title/brief and valid changes |
| Whole-home lights | Real pendants illuminate rooms; one-light controls preserve neighbours; Undo/Redo restore exact state |
| Precise room/object/region edit | Permitted movement, rotation, resize, placement and finish changes; collision/scope rejection is atomic |
| One wall face | Actual selected face changes; opposite and neighbouring faces remain identical |
| Saved value | Matched-camera comparison, exact revision restore/reopen, design summary and plan download |
| Shared agreement | Distinct client identity; both chat roles; assistant reply and actual edit; exact-version acceptance then approval; immutable agreement readable/downloadable by both |
| Later changes | Old agreement preserved; new agreement requires fresh exact-revision decisions |
| Ambiguous request | No automatic paid retry; pending request can be checked; completed response loss clears stale pending input on reload |
| Staged save | Finish saving publishes already stored output without another model call |
| Failed request | Saved scene and editable prompt remain; explicit new request uses the user's current prompt and selection |
| Access/security | Unauthenticated/stranger denial; member access limited to associated home; private proposals and assistant instructions remain private |
| Responsive/accessibility | 1440, 390 and 320px; keyboard, touch without dragging, reduced motion, no overflow, visible focus and axe checks |
| Graphics/resources | Independent Plan after graphics failure; missing assets reported; measured first-view budget and resource disposal |

Run `rtk npm run verify:v1` for the complete deterministic gate. This includes frontend/backend/schema tests, Rules, headed browser stories and retained proposal regressions, build, public scan and offline Terraform checks.

After a passing source gate, verify the production container starts and deliberately invalid production settings fail closed. The authorized main push must be traced through the exact Cloud Build, immutable image and Cloud Run revision, then new deployed journeys checked separately. Health alone is insufficient. Completed personal Google consent and ideathon submission remain separate from automated browser evidence.
