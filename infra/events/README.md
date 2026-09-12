This isolated Terraform root routes creation of `roomReviewOutbox/{jobId}` to
the existing API at `/internal/outbox`. Firestore and Eventarc stay in the
independently configured Firebase project/location. A small Workflows bridge in
that project calls the existing Cloud Run service with a dedicated OIDC identity.
It introduces no application service, database migration, or scheduled polling.

The workflow forwards only the CloudEvent's `id`, `source`, `subject`, and `type`.
The API validates these and reads the authoritative job. Ten retries use a
20-second request timeout and exponential delays capped at 60 seconds, bounding
delivery attempts to about ten minutes. HTTP 429, 5xx, connection failures, and
timeouts are retried; other 4xx responses are permanent. No source content or
model request enters the workflow.

Eventarc acknowledges delivery when a workflow execution starts. A later failed
execution is not restarted automatically. The durable outbox and owner retry
path remain the recovery record after workflow retries are exhausted. Do not
claim that events or Cloud Tasks provide unlimited retries. Workflow executions
retain provider-standard history and cannot be removed by destroying this root.

Run the launcher from the repository root after building the backend. It obtains
a short-lived token from the explicit operator profile, keeps state and plans in
the private directory, verifies source/configuration/plan hashes before apply,
rejects resource updates/deletion, and checks shared ADC before/after each run:

```text
rtk proxy node --experimental-strip-types scripts/terraform-events.mts init
rtk proxy node --experimental-strip-types scripts/terraform-events.mts import pubsub.googleapis.com
rtk proxy node --experimental-strip-types scripts/terraform-events.mts plan --bootstrap
rtk proxy node --experimental-strip-types scripts/terraform-events.mts apply
rtk proxy node --experimental-strip-types scripts/terraform-events.mts plan
rtk proxy node --experimental-strip-types scripts/terraform-events.mts apply
rtk proxy node --experimental-strip-types scripts/terraform-events.mts outputs
```

Import only resources already discovered to exist; the Pub/Sub command above is
an example of preserving existing API activation. Other supported imports use
their exact Terraform addresses and derive the expected resource IDs internally.
The bootstrap plan enables only required APIs. After applying it, discover the
existing workflows, triggers and identities and import any matches before the
full plan. Disabled APIs alone do not prove that their resources are absent.
The GCS bucket comes from private `delivery-outputs.json`, with fixed prefix
`events`. No resource in the runtime or production state is moved by this root.

Create `event-delivery.json` beside the existing private operator configuration:

```json
{
  "backendProjectId": "example-backend",
  "firebaseProjectId": "example-firebase",
  "firestoreDatabaseId": "(default)",
  "firebaseLocation": "nam5",
  "region": "asia-southeast1",
  "projectNumber": "123456789012",
  "gcloudConfiguration": "example-profile",
  "account": "operator@example.test"
}
```

Values must agree with `local-config.json`, `vertex-local.json`,
`firebase-connected.json`, and `production-discovery.json`. Discover the database
location separately; never infer it from the backend region. Keep actual values
outside this checkout.

Offline checks: `rtk npm run check:infra` includes this root's mock-provider suite.
The launcher boundary tests run with:
`rtk proxy node --experimental-strip-types --test infra/events/tests/launcher.test.mjs`.
These checks do not demonstrate live event delivery; that requires an actual
created job followed through workflow, API dispatch, task delivery, and saved
result after rollout.
