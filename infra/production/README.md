# Production foundation

This root manages the application APIs, runtime/build/task identities, inference
and queue permissions, image repository, build-source bucket, review queue,
paused recovery scheduler and public Cloud Run invocation binding.
[Firebase](../firebase/README.md) owns Auth, Firestore, its runtime grants and the
active browser SDK secret. [Runtime](../runtime/README.md) owns the existing
Cloud Run service and container template.

One Cloud Run image serves the Next.js frontend and Express backend on the same
origin. Firebase ID tokens are verified by the backend, which enforces data
ownership. Gemini uses the runtime identity and a narrowly scoped inference role.
The builder can publish application images and write logs without runtime secret
access or Firebase administration.

## Private configuration and state

The foundation uses its existing private, versioned GCS state bucket and
`production` prefix. Supply the bucket privately at initialization. Existing
state is authoritative: preserve a backup and inspect a full plan before an
infrastructure change. Do not overwrite remote state from an old local copy.
The build-source bucket has a seven-day object lifecycle and must not hold
Terraform state.

The [foundation launcher](../../scripts/terraform-production.mts) uses the
explicitly verified account/profile and a short-lived token, checks shared ADC
before and after, and binds apply to saved plan/input hashes. Required inputs
are `backend_project_id`, `project_number`, `region`, `access_token` and the
verified image digest. Account details, project values, plans and state stay
outside the checkout.

Ordinary releases follow a reviewed push to GitHub `main`. The native Cloud
Build trigger checks the commit, builds its image and applies only the runtime
Terraform plan. The foundation is updated separately when infrastructure changes.
See the [deployment guide](../../docs/deployment.md).

## Background recovery

Firestore events deliver saved review work to the API, which enqueues bounded
Cloud Tasks. The existing periodic recovery job remains paused by default.
`pause_room_recovery = false` is an explicit operational override; it preserves
the job's existing schedule, endpoint and authenticated task identity.

The optional private `room-recovery.json` setting must name this backend:

```json
{ "backendProjectId": "example-project", "paused": true }
```

An absent setting keeps recovery paused. Changes require a reviewed foundation
plan. Cloud Tasks retries and application leases remain responsible for bounded,
duplicate-safe delivery during normal operation.
