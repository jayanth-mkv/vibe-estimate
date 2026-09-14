# Event-driven room review delivery

Saved room-review work triggers delivery through Firestore, Eventarc and Cloud Tasks. This contract covers the textual room observer. Home-design generation uses its existing request and saved-result recovery path.

## Delivery contract

1. The authorized API transaction saves the message, queued observer state and a `roomReviewOutbox` record together. One outstanding delivery per room coalesces rapid messages. The record contains routing identifiers and lifecycle state, never source text or model output.
2. An Eventarc document-created trigger calls `/internal/firestore` on the Cloud Run service in the same project. The gateway preserves the bounded protobuf body and forwards only the required CloudEvent headers. The API selects the saved job from authenticated event metadata and ignores the document payload.
3. The API verifies the dedicated event identity, exact audience and database/collection metadata, reads the authoritative outbox and room, and creates a named Cloud Task. Its immutable delivery ID determines the task name. A duplicate create acknowledges the same task; other enqueue failures remain retryable. Tasks use a separate identity and audience.
4. The worker authenticates task delivery, checks the current room delivery atomically and enforces persistent room/owner leases and model-call limits. Debounced or busy work returns a retryable response. Messages arriving during a review receive a fresh delivery in the transaction that saves the current result.
5. Completed, paused, superseded and failed work stops delivery. Updating a record cannot produce another creation event. An explicit owner retry creates a fresh delivery record.

## Failures and recovery

Eventarc delivery is acknowledged only after the dispatcher creates the task or proves the job no longer needs processing. A task is acknowledged only after the worker finishes or proves its delivery no longer needs processing. Both services can redeliver, so authoritative state checks, leases and stable task names remain necessary.

Exhausted dispatch remains durably recorded. After ten minutes, an authorized room read or late delivery turns an unstarted queued review into a visible error. An expired paid-run lease also becomes an error; recovery never automatically repeats an uncertain model call. The owner Retry action creates a new event. A client cannot retry, alter delivery state or call internal endpoints.

`/internal/reconcile` remains an authenticated operator recovery endpoint. The Terraform-managed scheduler is paused during normal operation. Local emulator and connected observation use their local runner.

## Threats and verification

| Threat or failure | Enforcing control | Verification |
| --- | --- | --- |
| Browser forges a delivery or accesses another room | Deny-all Firestore rules, API membership checks, backend-only outbox | Rules tests and cross-user API denial |
| Caller forges an event or worker request | Distinct verified OIDC identities, exact audience and source/database/type/path checks | Event API and token tests |
| Server dies after saving a message | Atomic message and delivery transaction; independent document event | Transaction rollback, restart and deployed event checks |
| Duplicate/out-of-order event or lost enqueue response | Immutable delivery ID, deterministic task name, current-delivery check and leases | Duplicate dispatch, stale task and concurrency tests |
| Event failure, exhausted retries or interrupted model call | Bounded retries, durable pending state, visible expiry and explicit owner retry | Failure, expiry and no-paid-redispatch tests |
| Model or source content changes routing or prices | Routing from validated backend records; source validation and deterministic pricing | Model, ownership and proposal regressions |
| Idle periodic calls | Paused recovery scheduler | Scheduler readback and bounded Cloud Run log observation |

The active trigger and its permissions belong to `infra/firebase`; the queue and paused scheduler belong to `infra/production`. Infrastructure changes require reviewed Terraform plans. [Executed delivery evidence](event-delivery-verification.md) is separate from this design contract.
