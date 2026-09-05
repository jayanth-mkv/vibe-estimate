# Production foundation

This Terraform root manages the production APIs, runtime/build/delivery identities and their IAM, image repository, original build-source bucket, review queue, recovery scheduler, browser SDK configuration secret, Firebase authorized domains, and public Cloud Run invocation binding. The existing Cloud Run service is owned separately by [infra/runtime](../runtime/README.md), whose state and permissions are limited to that service.

Ordinary application releases follow a reviewed push to GitHub `main`. The native Cloud Build trigger runs [cloudbuild.yaml](../../cloudbuild.yaml), builds the committed source, and applies the runtime Terraform plan. This foundation root is used for infrastructure changes and ownership adoption, not for each image release. See [deployment.md](../../docs/deployment.md) for the complete workflow.

The existing Cloud Run image contains the Next.js gateway and Express backend as separate processes. A Vercel frontend uses its own same-origin gateway with an explicit `BACKEND_ORIGIN` pointing to Cloud Run. Firebase ID tokens continue to be verified by the backend; Firebase identity/storage and the backend project remain independently configured. The runtime identity calls Vertex without a user credential or service-account key.

Room writes persist queued work before requesting a Cloud Task. Verified Google OIDC delivery invokes the observer, and the scheduler recovers saved queue entries. Room leases and direct-review request records prevent ordinary retries from dispatching duplicate model calls. Interrupted attempts require explicit owner recovery. The queue, identities and scheduler stay in this foundation while the service template belongs to the runtime root.

## Private configuration and state

Read the outer private authorization before operator cloud operations. Discover existing resources before managing them. Operator values, local foundation state, saved plans and verification records belong outside the checkout under `../docs/private/`. Never commit actual account/project IDs, credentials, state, plan files or raw cloud diagnostics.

The retained `scripts/terraform-production.mts` launcher verifies the named profile and target, uses an ephemeral token, checks shared ADC before/after, and binds apply to the saved plan and configuration hashes. It is a bootstrap and infrastructure-maintenance tool. Routine releases need neither a local image archive nor an operator deployment script.

The native runtime state belongs in the dedicated private, versioned GCS bucket provisioned by `infra/delivery`. Do not reuse this root's original source bucket for state: it has a seven-day object-deletion lifecycle. Gemini-local, Firebase adoption, foundation, delivery, runtime and Vercel state ownership remain separate.

## Adopt the running service

The ownership handoff follows this order; consult the inventory and verification record for its executed evidence:

1. Preserve a private backup of the existing foundation state and the current service template, image digest and identity metadata. Pause release activity during the handoff.
2. Initialize `infra/runtime` against its dedicated GCS bucket and import the existing service into `google_cloud_run_v2_service.application`. Use the currently deployed digest and exact existing template. Review its plan before any application update.
3. Apply the reviewed foundation handoff. Its `removed` block forgets the old `google_cloud_run_v2_service.application[0]` entry with `destroy=false`; it must not delete or recreate the live service.
4. Confirm that only the runtime state actively manages the service. Public invocation and the scheduler remain in the foundation state, with no unintended changes.

The retained private `image` input still controls the public-invocation and scheduler resource counts. Keep it set to the current verified digest during adoption; clearing it is not the way to transfer service ownership. The foundation launcher rejects delete/replacement plans and permits Terraform's explicit forget action.

## Firebase domains for Vercel

After discovering the canonical production hostname, the optional private `vercel-config.json` supplies additional domains:

```json
{
  "firebaseProjectId": "firebase-project-id",
  "extraFirebaseAuthDomains": ["project-name.vercel.app"]
}
```

The file can also contain other Vercel operator settings. Its Firebase project must match the authorized configuration. An absent file means no additional domains. Additional values are bounded lowercase DNS hostnames without schemes, paths, ports, wildcards or IP addresses; committed examples remain placeholders.

Terraform combines the extra domains with every previously discovered domain and the existing Cloud Run hostname. The imported REST resource reads and patches only `authorizedDomains` with an explicit field mask. It does not adopt sign-in providers or retrieve password-hashing configuration. Preserve its import identity and `prevent_destroy`; changing output sensitivity would cause the pinned REST provider to propose replacement.

Executed changes and deployment evidence belong in the [inventory](../../docs/infrastructure-inventory.md) and [verification record](../../docs/verification.md).
