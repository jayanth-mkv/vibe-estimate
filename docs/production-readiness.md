# Production readiness

The initial release was prepared on `fix/initial-production` from `snapshot/initial-connected-v1` and deployed on 5 September 2026. The current audit and recovery fixes are on `feat/spatial-home-studio`. Spatial features remain planned. Publication, outreach and hackathon submission are separate actions.

## Current production checkpoint

The deployed service is ready and uses real Firebase Authentication, cloud Firestore and Gemini 3.7 Flash through Vertex. The required campaign label and deployed image were checked through a read-only Cloud Run API request. All 15 distinct production browser checks have passing results across targeted runs, with seven real model calls; this was not a single all-green run. The [quick checklist](quick-test-checklist.md) and [executed record](verification.md#production-journey-audit--5-september-2026) retain the failures, reruns and remaining limits.

The audit found two reliability defects through local reproductions: the room observer could exceed its configured call capacity while database claims were pending, and replaying a direct review could dispatch again or supersede a later draft. Source fixes reserve observer capacity before claiming work and persist review requests before provider dispatch. The browser now checks an interrupted request before offering a deliberate new attempt. A separate emulator-only page hydration defect was fixed by omitting the empty runtime-config head child. These source fixes are not part of the production image verified above; no new rollout or infrastructure change was made during this audit.

## Connection recovery

The connected setup's browser API URL used a different origin from the page. Direct preflight checks accepted `localhost:3000` but rejected `127.0.0.1:3000`. A same-origin Next.js gateway now forwards only the authorization/content-type headers to an operator-configured backend. Requests retain the backend's ownership checks. The gateway bounds bodies at 48 KiB, never follows upstream redirects, does not cache private responses, and sanitizes transport failures. Token-refresh errors and ambiguous timeout outcomes have distinct recovery messages. Mutations are not automatically retried.

## Room data decision

Keep the bounded initial room as one document: membership, current state and the current conversation are always needed together. Limits are 40 messages, 16,000 transcript characters, ten reviews of at most 24,000 UTF-8 bytes each and 100 bounded shared-draft summaries. Reading a document charges a document read regardless of the requested fields; subcollections help when callers load only a page of history. Re-fetching every message subdocument during each refresh would increase read charges.

For a later unbounded conversation, move messages, immutable review snapshots and shared drafts to separate room subcollections. Keep membership and the current review summary in the parent; use pagination and a cursor/listener for changes, authorize every child access, and retain atomic membership, duplicate-request and review-lease checks. Do not migrate existing data merely to preserve an API that still rehydrates all history.

Before the initial release the background observer queried Firestore twice per second even with no queued rooms: 172,800 queries/day. Production now uses managed task requests and scheduled recovery of persisted queued work. The production two-person journey completed two real observations; backend tests cover task delivery, recovery and identity denial. ID-only lookup projections reduce bytes without implying lower document-read charges.

References: [Firestore data structure](https://firebase.google.com/docs/firestore/manage-data/structure-data), [Firestore read pricing](https://firebase.google.com/docs/firestore/pricing), [Cloud Run task execution](https://docs.cloud.google.com/run/docs/triggering/using-tasks).

## Evidence still to verify

Deployment and the audited production journeys have been verified. The operator confirmed this repository as the build-provenance record for the agent-assisted workflow. Completed personal Google consent/linking/recovery and the actual demo/social link and submission remain outstanding. Google popup/cancellation checks passed; they do not establish completed sign-in. Physical-phone camera and manual assistive-technology checks were not performed. Reload persistence was tested in production, without forcing a service restart.

The existing Developer API has a prepaid-balance limitation; working Vertex authentication is a different billing/authentication path. The attached runtime service identity must not be described as completed Secret Manager Gemini API-key evidence. The proposed multi-model fallback ladder is still pending. See [build provenance and evidence](ai-studio-evidence.md), [verification](verification.md) and the [resource inventory](infrastructure-inventory.md) before preparing a submission.
