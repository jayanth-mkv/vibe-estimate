# Event delivery verification

## Production cutover — 13 September 2026

Native delivery of `e3ee954` completed successfully. The application now uses the destination Firebase project, Google-only sign-in and a direct Firestore-created Eventarc trigger. The recurring recovery scheduler is paused through Terraform.

A real production canary verified Firestore creation → authenticated dispatcher → named Cloud Task → worker. A paused synthetic room consumed zero model calls, and an already completed outbox event was acknowledged without creating work. Unauthorized API/internal requests and anonymous account creation were denied. All three synthetic records were removed with ownership and update-time checks, and shared ADC was unchanged.

The Eventarc-managed OIDC audience is the canonical Cloud Run URL **including `/internal/firestore`**. Discovery caught this distinction before testing; runtime validation and native-release guards accept that exact route while rejecting other paths, queries and fragments. Task delivery retains its independently configured audience.

The second production check authenticated the sole imported Google-linked UID through a short-lived, programmatically signed Firebase token. It read the copied home, project and all ten immutable revisions through ordinary authenticated APIs. Two synthetic designer messages each produced one created-event delivery, one completed outbox job and one persisted Gemini review. Replaying the first request produced no additional job or model call. A foreign-owner room and unauthorized internal calls were denied. The six synthetic records were conditionally removed, the prior owner index was restored, and all fifteen original records matched their pre-test fingerprints. No Auth account was created or deleted by verification.

A Cloud Run log audit found five successful event deliveries and three successful workers across both test runs, with zero server errors or scheduled requests. The extra accepted job/worker pair was the paused-room canary; only the two message reviews called Gemini. The reconcile request was an expected unauthorized probe.

The subsequent **10:32:12–10:37:12 UTC** idle window contained zero HTTP requests, internal calls or errors. The scheduler remained paused, the event trigger remained active, and the task queue was empty. The temporary operator signing grant was revoked through Terraform, and an effective-permission read confirmed signing access was absent. Shared ADC was unchanged throughout.

The operator's actual Google browser sign-in remains a separate check. Programmatic identity verification does not establish browser consent or the sign-in popup journey.

## Preparation checkpoint — 12 September 2026

The following records the earlier implementation checks and source-project investigation. It does not describe the current scheduler or destination configuration.

### Executed local checks

- Backend: 266 tests passed, including atomic outbox persistence, duplicate delivery, distinct internal identities, stale tasks, bounded failure, owner retry, pause and concurrent messages.
- Frontend: 61 unit tests passed, including forwarding the new internal action and its authentication header. Workspace typechecks and backend build passed.
- Firebase emulators: five security-rules checks and two real Firestore transaction checks passed. The latter verify rollback and delivery persistence across store instances.
- Browser regression: the full isolated run passed 25 of 28 checks; three desktop journeys exceeded their assertion window during first-time route compilation. After preparing routes before browser assertions, all six desktop/mobile room, failure/retry and guest-invitation journeys passed. No product UI behavior changed for this test-runner fix.
- Terraform: production 11, delivery 3, runtime 11, event routing 7, Firebase adoption 2, Gemini local 6 and guardrails 7 mock checks passed. The subsequent billing proposal passed seven mock checks; the event launcher now passes eight guard tests including its apply-only billing preflight. Five foundation-launcher tests passed, including explicit scheduler pause, target mismatch and path-escape denial. These are offline checks, not cloud deployment evidence.
- Public-file scan and Git whitespace checks passed.

### Observed production behavior before cutover

A bounded 24-hour Cloud Run request-log read found 1,440 successful `/internal/reconcile` calls, zero `/internal/observer` calls, and 87 other requests. The once-per-minute Cloud Scheduler job accounts for the recurring recovery requests. Empty recovery calls read queued observer state; they do not themselves run Gemini.

The event bootstrap imported the existing Pub/Sub API and enabled two Eventarc APIs through Terraform. Workflows API activation failed because the existing Firebase project has no billing account. The scheduler remains enabled, and the live application revision has not changed. See the [infrastructure inventory](infrastructure-inventory.md).

### Release checks identified at that checkpoint

Resolve the source-project billing or consolidation decision, finish and read back event infrastructure, release the matching application commit through native delivery, and verify an actual Firestore-created event reaches the authenticated dispatcher. Then pause the scheduler through Terraform, replay any pre-trigger queued work once, and run the bounded real-message, duplicate/access-denial and idle-log checks. A prepared private verification runner is not an executed result.
