# Event-driven room review delivery

This change replaces periodic production room-recovery polling with delivery triggered by saved work. It covers the textual room observer previously served by `/internal/reconcile`. Home-design generation retains its existing request and saved-result recovery path.

## Delivery contract

1. The authorized API transaction saves the message, queued observer state and a `roomReviewOutbox` record together. One outstanding delivery per room coalesces rapid messages. The record contains routing identifiers and lifecycle state, never source text or model output.
2. An Eventarc **document-created** trigger starts a short Workflow in the existing Firebase project. The Workflow posts only the event identity, source, subject and type to `/internal/outbox` on the existing application service. This bridge supports deployments whose Firebase and application projects differ; it does not host application code or move Firebase data.
3. The API verifies the dedicated workflow identity and exact Firebase database/collection metadata, reads the authoritative outbox and room, and creates a named Cloud Task. The task name is derived from the immutable delivery ID. A duplicate create response acknowledges the same task; other enqueue failures remain retryable.
4. The task worker verifies its separate delivery identity, atomically checks the current room delivery, and uses the existing persistent room/owner leases and model-call limits. Debounced or busy work returns a retryable response. Messages arriving during a review get a fresh delivery in the transaction that saves the current result, preserving a full retry budget for the next review.
5. Completed, paused, superseded and failed work stops delivery. Updating a record cannot produce another creation event. A new owner retry creates a fresh delivery record.

## Failures and recovery

Eventarc acknowledges a Workflow when its execution starts, so the Workflow explicitly retries transient dispatcher failures within a bounded window. A task is acknowledged only after the worker finishes or proves the delivery no longer needs processing.

Exhausted dispatch remains durably recorded. After ten minutes, an authorized room read or late delivery turns an unstarted queued review into a visible error. An expired paid-run lease also becomes an error; recovery never automatically repeats an uncertain model call. The existing owner Retry action creates a new event. A client cannot retry, alter delivery state or call internal endpoints.

`/internal/reconcile` remains an authenticated, operator-invoked cutover/replay tool. It has no recurring production schedule after cutover. Local emulator/connected observation keeps its existing local runner.

## Threats and verification

| Threat or failure | Enforcing control | Verification |
| --- | --- | --- |
| Browser forges a delivery or accesses another room | Deny-all Firestore rules; API membership checks; backend-only outbox | Rules tests and API cross-user denial |
| Caller forges an event or worker request | Distinct verified OIDC identities, exact audience, source/database/type/path checks | Event API and token tests |
| Server dies after saving a message | Atomic message and delivery transaction; independent document event | Transaction rollback and restart tests; deployed event journey |
| Duplicate/out-of-order event or lost enqueue response | Immutable delivery ID, deterministic task name, current-delivery check and leases | Duplicate dispatch, stale task and concurrency tests |
| Event failure, queue exhaustion or interrupted model call | Workflow/task retry limits, durable pending state, visible expiry and explicit owner retry | Failure, expiry and no-paid-redispatch tests |
| Model or source contents attempt to change routing/prices | Routing derived only from validated backend records; existing source validation and deterministic pricing | Existing model, ownership and proposal regression |
| Idle polling remains after rollout | Terraform pauses the existing scheduler only after delivery validation | Scheduler readback and bounded Cloud Run log observation |

## Rollout and evidence

Prepare and verify the backend/gateway and Terraform on the task branch. Discover existing event resources and import any matches before management. Apply the event APIs and routing through Terraform, deploy the compatible application through the native main-branch pipeline, verify a real saved-message event and result, then pause the existing scheduler through its foundation Terraform state. Perform one bounded cutover scan for pending records that predate the trigger.

Executed results and exact rollout status belong in the infrastructure inventory and verification record. This document defines the delivery contract and planned verification; it is not proof of deployment.

References: [Firestore atomic transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [Firestore events to Workflows](https://docs.cloud.google.com/eventarc/standard/docs/workflows/route-trigger-cloud-firestore), [Workflow event delivery](https://docs.cloud.google.com/workflows/docs/trigger-workflow-eventarc), [Cloud Tasks duplicate execution](https://docs.cloud.google.com/tasks/docs/common-pitfalls#duplicate_execution).
