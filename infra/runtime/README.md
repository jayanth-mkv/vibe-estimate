# Native main-branch runtime release

`cloudbuild.yaml` is the release pipeline invoked by the Terraform-managed GitHub trigger. An ordinary push to `main` runs checks, builds the existing root Dockerfile, pushes the commit-tagged image, resolves its immutable digest, and applies a saved Terraform plan for the existing Cloud Run service. It then checks public production health without calling Gemini. The image serves the Next.js frontend and the Express API on that one origin; there is no separate frontend host.

This root owns exactly `google_cloud_run_v2_service.application`. The service template preserves its runtime identity, CPU/memory, zero-to-two scaling, queue delivery settings, numeric Secret Manager reference and challenge label. Application identities, APIs, image storage, queues and the paused recovery scheduler belong to `infra/production`; Firebase Auth, Firestore, related runtime IAM and the active SDK secret belong to `infra/firebase`.

## Trigger contract

The regional `google_cloudbuild_trigger` must reference the discovered existing second-generation repository child, use the exact push regex `^main$`, read `cloudbuild.yaml`, and select the existing build service account. The repository and trigger regions must match; the Cloud Run region remains independently configured. Do not enable a pull-request release trigger. [Native GitHub triggers](https://docs.cloud.google.com/build/docs/automating-builds/github/build-repos-from-github)

| Substitution | Value supplied privately by Terraform |
| --- | --- |
| `_STATE_BUCKET` | Dedicated private, versioned Terraform state bucket; fixed prefix `runtime`. |
| `_RUNTIME_VARS_B64` | Base64 UTF-8 JSON containing exactly the eleven metadata variables below. Encoding is not encryption; payloads and credentials are forbidden. |
| `_IMAGE_REPOSITORY` | Existing regional Artifact Registry image path, without tag/digest. Must match the backend project/region. |
| `_GITHUB_REPOSITORY` | Optional `owner/repository`; set it for the public repository to skip a stale build immediately before apply. |

Metadata variables: `backend_project_id`, `firebase_project_id`, `project_number`, `region`, `firestore_database_id`, `gemini_model`, `runtime_service_account` (email), `task_queue` (full resource path), `task_service_account` (email), `firebase_web_config_secret` (existing secret ID), and `firebase_web_config_version` (numeric string). All are required strings. Firebase and backend project IDs must match the delivery project's ID. The build adds `image` from the verified Artifact Registry digest. It never accepts an image, token, or Firebase web-config payload in the encoded metadata.

`access_token` is optional, sensitive and ephemeral for operator adoption. Native builds leave it null and use their attached service identity. Do not supply user ADC, refresh tokens, service-account keys, or Gemini keys to the build. [User-specified Cloud Build identities](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)

## Adopt before enabling

The operator must first create/import the dedicated state bucket and narrowly scoped IAM through Terraform. Enable bucket versioning and public-access prevention. The existing source bucket has a seven-day deletion rule and must not hold runtime state. GCS provides state locking; use a separate root/prefix and preserve state versions. [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)

Before enabling delivery for an existing service, initialize this root against its verified private GCS state. If the service is not yet managed, import `projects/PROJECT/locations/REGION/services/vibeestimate` into `google_cloud_run_v2_service.application` after confirming no other active state owns it. Compare the complete template and immutable image with the live service, and require a clean plan before enabling the trigger. Preserve existing state and resource identities.

The build identity needs Artifact Registry writer on the selected repository, log writer, Storage Object Admin on the dedicated state bucket, service-scoped Cloud Run deployment permissions, and Service Account User only on the runtime identity. A custom deployment role should include service read/update and operation polling; the operator must validate the actual provider permission requirements. It does not need Firebase admin, Vertex prediction, secret-payload access, or project-wide Cloud Run administration. Preserve the runtime account's existing permissions. [Cloud Run IAM scope](https://docs.cloud.google.com/run/docs/reference/iam/roles)

The plan gate permits only a no-op or update to the adopted service at its expected ID. Creation, replacement, deletion, unrelated resources, unknown/deferred plans, wrong digest, and disabled deletion protection stop release. A GCS lock protects state writes; a saved plan made stale by another completed release fails and is not replanned automatically. When `_GITHUB_REPOSITORY` is set, an older main commit is skipped before apply. A failed health check fails the build without an automatic rollback; use a reviewed Git revert for a new release.

## Verification

`rtk proxy node --test infra/runtime/tests/release.test.mjs` exercises release input, image, plan and health boundaries with synthetic values only. Cloud Build also runs both workspace typechecks and backend/frontend unit tests before building. The health gate validates production Firebase, cloud Firestore and Vertex configuration; it does not establish a paid model journey. Record the native build, matching image and live journey verification separately from offline tests.
