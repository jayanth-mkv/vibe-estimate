# Initial production release

This release is prepared on `fix/initial-production` from `snapshot/initial-connected-v1`. The spatial-design branch remains independent. Public deployment was requested on 5 September 2026; publication, outreach and hackathon submission are separate actions.

## Connection recovery

The connected setup's browser API URL used a different origin from the page. Direct preflight checks accepted `localhost:3000` but rejected `127.0.0.1:3000`. A same-origin Next.js gateway now forwards only the authorization/content-type headers to an operator-configured backend. Requests retain the backend's ownership checks. The gateway bounds bodies at 48 KiB, never follows upstream redirects, does not cache private responses, and sanitizes transport failures. Token-refresh errors and ambiguous timeout outcomes have distinct recovery messages. Mutations are not automatically retried.

## Room data decision

Keep the bounded initial room as one document: membership, current state and the current conversation are always needed together. Limits are 40 messages, 16,000 transcript characters, ten reviews of at most 24,000 UTF-8 bytes each and 100 bounded shared-draft summaries. Reading a document charges a document read regardless of the requested fields; subcollections help when callers load only a page of history. Re-fetching every message subdocument during each refresh would increase read charges.

For a later unbounded conversation, move messages, immutable review snapshots and shared drafts to separate room subcollections. Keep membership and the current review summary in the parent; use pagination and a cursor/listener for changes, authorize every child access, and retain atomic membership, duplicate-request and review-lease checks. Do not migrate existing data merely to preserve an API that still rehydrates all history.

Before this release the background observer queried Firestore twice per second even with no queued rooms: 172,800 queries/day. This is the immediate production cost/reliability issue, rather than the bounded document shape. Production verification must establish that observation runs within a managed task request and recovers persisted queued work. ID-only lookup projections reduce bytes without implying lower document-read charges.

References: [Firestore data structure](https://firebase.google.com/docs/firestore/manage-data/structure-data), [Firestore read pricing](https://firebase.google.com/docs/firestore/pricing), [Cloud Run task execution](https://docs.cloud.google.com/run/docs/triggering/using-tasks).

## Evidence still to verify

Deployment, live production journeys, Google consent and authentic AI Studio build evidence are not established by a successful local build. The existing Developer API has a prepaid-balance limitation; working Vertex OAuth is a different billing/authentication path. An attached runtime service identity follows Google's production authentication guidance, but must not be described as completed Secret Manager API-key evidence. Track executed results in `verification.md` and actual resources in `infrastructure-inventory.md`.
