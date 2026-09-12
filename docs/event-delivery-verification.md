# Event delivery verification — 12 September 2026

This checkpoint verifies the prepared implementation. It does not establish a production event deployment or a completed Firebase migration.

## Executed local checks

- Backend: 266 tests passed, including atomic outbox persistence, duplicate delivery, distinct internal identities, stale tasks, bounded failure, owner retry, pause and concurrent messages.
- Frontend: 61 unit tests passed, including forwarding the new internal action and its authentication header. Workspace typechecks and backend build passed.
- Firebase emulators: five security-rules checks and two real Firestore transaction checks passed. The latter verify rollback and delivery persistence across store instances.
- Browser regression: the full isolated run passed 25 of 28 checks; three desktop journeys exceeded their assertion window during first-time route compilation. After preparing routes before browser assertions, all six desktop/mobile room, failure/retry and guest-invitation journeys passed. No product UI behavior changed for this test-runner fix.
- Terraform: production 10, delivery 3, runtime 11, event routing 7, Firebase adoption 2, Gemini local 6 and guardrails 7 mock checks passed. Five event-launcher guard tests passed. These are offline checks, not cloud deployment evidence.
- Public-file scan and Git whitespace checks passed.

## Observed production behavior

A bounded 24-hour Cloud Run request-log read found 1,440 successful `/internal/reconcile` calls, zero `/internal/observer` calls, and 87 other requests. The once-per-minute Cloud Scheduler job accounts for the recurring recovery requests. Empty recovery calls read queued observer state; they do not themselves run Gemini.

The event bootstrap imported the existing Pub/Sub API and enabled two Eventarc APIs through Terraform. Workflows API activation failed because the existing Firebase project has no billing account. The scheduler remains enabled, and the live application revision has not changed. See the [infrastructure inventory](infrastructure-inventory.md).

## Remaining release checks

Resolve the source-project billing or consolidation decision, finish and read back event infrastructure, release the matching application commit through native delivery, and verify an actual Firestore-created event reaches the authenticated dispatcher. Then pause the scheduler through Terraform, replay any pre-trigger queued work once, and run the bounded real-message, duplicate/access-denial and idle-log checks. A prepared private verification runner is not an executed result.
