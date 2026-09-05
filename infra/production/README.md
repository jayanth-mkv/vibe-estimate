# Initial production infrastructure

This isolated Terraform root owns the initial Cloud Run app and its managed room tasks. It does not share state with the original backend template, Gemini-local root or Firebase adoption root.

The Next.js frontend and Express backend run as separate processes in one container. Cloud Run exposes only the frontend port. The Next.js gateway forwards authenticated API calls to the backend on loopback, preserving the `frontend/` and `backend/` boundaries and allowing a later hosting split through `BACKEND_ORIGIN`.

Production uses Firebase ID tokens and server ownership checks, real Firestore, and an attached service identity for Vertex inference. Runtime browser SDK configuration is injected from Secret Manager using a four-field allowlist; it is never included in image build sources. This is not a Gemini API key. The challenge's specific server-key evidence is tracked separately.

Room writes persist queued state before requesting a Cloud Task. Verified Google OIDC delivery invokes the worker, which awaits the model and save. A once-per-minute authenticated scheduler recovers queued work if enqueueing fails. Firestore room/owner leases prevent repeated delivery from duplicating a paid review. An expired paid lease requires explicit owner retry. No continuous production background timer runs. The Cloud Run service scales from zero to two instances; the queue allows four simultaneous task requests.

## Operator workflow

Read and verify the outer private authorization first. Existing resources must be discovered before creation. Operator values, saved plans, Terraform state, short-lived credentials, build archives and verification artifacts belong outside the checkout under `../docs/private/`. The checked launcher reads the existing named-profile configuration, confirms targets, hashes shared ADC before/after, and binds apply to the saved plan and source/configuration hashes. Provider credentials are ephemeral and the secret version uses a write-only input. Never display a plan/state file or a raw cloud error in public output.

Commands run from the repository root, using its local Terraform binary and npm tooling:

```powershell
rtk proxy node --import tsx scripts/terraform-production.mts init
rtk proxy node --import tsx scripts/terraform-production.mts validate
rtk proxy node --import tsx scripts/terraform-production.mts plan
# Inspect the private plan; the launcher rejects deletes and replacements.
rtk proxy node --import tsx scripts/terraform-production.mts apply
rtk proxy node --import tsx scripts/terraform-production.mts outputs
rtk proxy node --import tsx scripts/build-production.mts submit
rtk proxy node --import tsx scripts/build-production.mts status
```

Cloud Build only builds and pushes the image into the Terraform-managed private repository. A successful status records its immutable digest in private configuration. Run plan/review/apply again to create or update the Cloud Run service and scheduler. Do not deploy tags or use `gcloud run deploy`. The original disabled-API bootstrap uses `plan --bootstrap`; routine deployments require the complete plan.

The Firebase domain wrapper imports only `authorizedDomains`, requesting only that field on both import and refresh. Its PATCH has an explicit field mask and preserves all previously discovered domains. Do not enable output sensitivity after import: the REST provider treats that setting as replacement. The metadata-only allowlist and external state boundary are sufficient here; `prevent_destroy` remains mandatory.

Read [production readiness](../../docs/production-readiness.md), [inventory](../../docs/infrastructure-inventory.md) and [verification](../../docs/verification.md) for the distinction between prepared configuration and executed evidence.
