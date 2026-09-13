# Production foundation

This Terraform root manages the production APIs, runtime/build/delivery identities and their backend IAM, image repository, original build-source bucket, review queue, paused recovery scheduler, original browser SDK configuration secret, and public Cloud Run invocation binding. The existing Cloud Run service is owned separately by [infra/runtime](../runtime/README.md), whose state and permissions are limited to that service. Destination Firebase Auth, domains, data, runtime Firebase grants and the active SDK secret belong to [infra/firebase-migration](../firebase-migration/README.md).

Ordinary application releases follow a reviewed push to GitHub `main`. The native Cloud Build trigger runs [cloudbuild.yaml](../../cloudbuild.yaml), builds the committed source, and applies the runtime Terraform plan. This foundation root is used for infrastructure changes and ownership adoption, not for each image release. See [deployment.md](../../docs/deployment.md) for the complete workflow.

The existing Cloud Run image contains the Next.js gateway and Express backend as separate processes on one origin: the API listens on an internal port and Next serves the public port, forwarding through its own same-origin gateway. There is no separate frontend host. Firebase ID tokens continue to be verified by the backend; Firebase identity/storage and the backend project remain independently configured. The runtime identity calls Vertex without a user credential or service-account key.

Room writes save an outbox record in the same transaction. The destination Firestore event invokes the API, which creates a named Cloud Task; verified Google OIDC delivery invokes the observer. The recurring recovery scheduler is retained paused. Room leases and direct-review request records prevent ordinary retries from dispatching duplicate model calls. Interrupted attempts require explicit owner recovery. The queue, identities and scheduler stay in this foundation while the service template belongs to the runtime root.

## Private configuration and state

Read the outer private authorization before operator cloud operations. Discover existing resources before managing them. Operator values, local foundation state, saved plans and verification records belong outside the checkout under `../docs/private/`. Never commit actual account/project IDs, credentials, state, plan files or raw cloud diagnostics.

The retained `scripts/terraform-production.mts` launcher, run as `npm run terraform:production -- <action>`, verifies the named profile and target, uses an ephemeral token, checks shared ADC before/after, and binds apply to the saved plan and configuration hashes. It imports the backend's built module, so build that workspace first. It is a bootstrap and infrastructure-maintenance tool. Routine releases need neither a local image archive nor an operator deployment script.

The deployed foundation, delivery, runtime and destination Firebase roots keep state in the dedicated private, versioned GCS bucket provisioned by `infra/delivery`, each under its own prefix. Versioning, locking and public-access prevention are enabled, so a lost workstation cannot cost the foundation its state. Do not reuse this root's original source bucket for state: it has a seven-day object-deletion lifecycle. Gemini-local retains separate private local state. The unused Firebase-adoption proposal has no local or remote state; no two active roots share a prefix.

### Moving existing local state into the bucket

`production` and `delivery` were originally initialized with a local backend. Both were migrated into this bucket on 6 September 2026 and the bucket is now authoritative. `-migrate-state` copies rather than deletes, so the previous local files remain in the private directory as a fallback alongside their pre-migration backups.

Should a root ever need re-initializing, `production` goes through its launcher:

```powershell
rtk proxy npm run build --workspace @vibeestimate/backend
rtk proxy npm run terraform:production -- init --migrate-state
```

`delivery` has no launcher because it changes rarely. Initialize it with the project-local Terraform, supplying the bucket name and an ephemeral token from the verified profile through the environment rather than a command-line argument:

```powershell
$env:GOOGLE_OAUTH_ACCESS_TOKEN = (gcloud auth print-access-token --configuration=<profile> --account=<account> --project=<project> --quiet)
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery init -migrate-state -backend-config="bucket=<state-bucket>"
Remove-Item Env:\GOOGLE_OAUTH_ACCESS_TOKEN
```

Confirm afterwards that `terraform state list` matches the current remote state and that a fresh plan reports no changes. The historical local copies are backups, not migration inputs: importing one would restore retired source ownership. After Firebase consolidation the production remote state has 21 addresses; `delivery` lists 9.

## Adopt the running service

The ownership handoff follows this order; consult the inventory and verification record for its executed evidence:

1. Preserve a private backup of the existing foundation state and the current service template, image digest and identity metadata. Pause release activity during the handoff.
2. Initialize `infra/runtime` against its dedicated GCS bucket and import the existing service into `google_cloud_run_v2_service.application`. Use the currently deployed digest and exact existing template. Review its plan before any application update.
3. Apply the reviewed foundation handoff. Its `removed` block forgets the old `google_cloud_run_v2_service.application[0]` entry with `destroy=false`; it must not delete or recreate the live service.
4. Confirm that only the runtime state actively manages the service. Public invocation and the scheduler remain in the foundation state, with no unintended changes.

The retained private `image` input still controls the public-invocation and scheduler resource counts. Keep it set to the current verified digest during adoption; clearing it is not the way to transfer service ownership. The foundation launcher rejects delete/replacement plans and permits Terraform's explicit forget action.

## Pause recovery after event cutover

After verifying the deployed event-delivery journey, the optional external `../docs/private/room-recovery.json` can pause the existing scheduler through this foundation:

```json
{ "backendProjectId": "backend-project-id", "paused": true }
```

The backend must match the authorized private configuration, and `paused` must be a boolean. An absent file or `false` keeps the every-minute schedule active. Run the launcher `plan`, review the scheduler pause, then `apply`; the setting is included in the saved plan's input hash. Terraform retains the job, cron and authenticated target for rollback. Set `paused` to `false` and review/apply a new plan to resume recovery. This configuration support does not itself pause the live job; complete [event delivery verification](../../docs/event-delivery.md) first.

## Retired source Firebase ownership

The source custom Auth role, its three runtime memberships and authorized-domain wrapper were forgotten through reviewed `removed` blocks with `destroy = false`. This changes Terraform ownership only: it does not delete IAM, change Auth or affect the destination. Keep these removed blocks; the foundation cannot recreate the source configuration.

The private active Firebase configuration now targets the destination and preserves `firebaseMigrationSourceProjectId`. The foundation launcher uses the privately frozen original SDK snapshot for its original, unused secret; repointing active client configuration cannot rotate that version. Missing or mismatched snapshots stop planning. The destination root owns the separate active SDK secret and authorized domains. Its selected domains include the custom app origin and both native Cloud Run origins.

Executed changes and deployment evidence belong in the [inventory](../../docs/infrastructure-inventory.md) and [verification record](../../docs/verification.md).
