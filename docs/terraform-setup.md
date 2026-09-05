# Terraform setup and later deployment

Local testing does not require a cloud project, production credentials, or Terraform apply. The main Terraform root defaults to zero resources, zero secret versions, zero Cloud Run services, and zero Cloud Build triggers.

## Gemini-only local access

Live Gemini with emulator Firebase now has a separate [Gemini Terraform root](../infra/gemini-local/README.md). It manages three Developer API prerequisites, a dedicated identity, a service-account-bound authorization key restricted solely to Gemini, and an optional Vertex API. Its state and plans are in the operator's outer private directory. The existing deployment and Firebase-adoption roots remain separate and unapplied.

The secure launcher verifies the authorized profile/account/project, uses an ephemeral profile access token, checks that shared ADC remains unchanged, and binds a saved plan to its private state path and target identity. Its normal sequence is:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 init
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 plan
# Inspect the concrete plan before applying it.
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 apply
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 check
```

Discovery, provisioning and the final clean plan were executed on 5 September 2026. Initial provider reads required a Resource Manager bootstrap; two already-enabled APIs were verified and untainted with Terraform after that failed initial read. Recovery commands are recorded in the isolated root/launcher and are not part of ordinary provisioning.

The private `enableVertexAi: true` setting opts into `aiplatform.googleapis.com`; it is bound into the saved plan and plan-context checks. Read-only discovery found this API disabled and the authorized user already permitted to predict and consume services. The reviewed plan added one API with zero changes or destruction; the final authenticated plan was clean. No additional credentials or IAM grants were needed for Vertex.

The Developer API still reports a depleted-prepaid-balance error despite Cloud Billing being enabled. A real structured Gemini request through Vertex succeeded using the named profile and Cloud Billing. See [verification.md](verification.md), [local-setup.md](local-setup.md), and [Google's Gemini billing guidance](https://ai.google.dev/gemini-api/docs/billing). No billing account changes or prepaid purchases were made.

## Project-local tooling

Terraform **1.13.5** and Google providers **8.1.0** are pinned. Windows x64 installation downloads the official archive and verifies its pinned SHA256. The launcher keeps Terraform CLI configuration, provider cache, working data, and temporary downloads inside this project's ignored folders. It changes no global PATH or persistent environment values.

From the repository root:

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
```

Then from `infra/`:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 init -backend=false -input=false
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 fmt -check -recursive
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 test -no-color
```

Init downloads signed providers; validate and the mock-provider tests require no cloud credentials or cloud API calls. Keep `.terraform.lock.hcl` in version control. Ignore `.tools`, `.terraform`, state, plan files, real tfvars and credentials. On other operating systems, use the same Terraform version with equivalent project-local CLI config/cache/temp environment settings.

Executed main-root checks: formatting, schema validation and **5 mock tests passed**. These cover no-resource defaults, distinct project mapping, rejecting deployment before infrastructure, rejecting placeholder images/missing repository IDs, and scale/security/codelab-label settings. They do not validate real IAM, billing, a cloud image, Firebase availability, or Gemini credentials.

Executed adoption-root checks: schema validation and **2 mock tests passed** for no implicit Firebase adoption and rejecting an undiscovered database location. The pinned beta provider's Firebase-project schema supports lifecycle `prevent_destroy`; database protection additionally uses API deletion protection and `ABANDON`. No import/apply was executed.

## Private configuration and authentication

Actual account/profile names, backend/Firebase/build project IDs, connection paths, and deployment variables belong outside the public repository. Pass the private tfvars file explicitly; the checked-in examples contain generic placeholders. Backend and Firebase projects may differ. The Cloud Build project and region follow the existing connection, and may differ from the backend region. Firestore location is discovered separately.

Terraform uses Google Application Default Credentials (ADC) or another explicitly configured provider identity. Activating a gcloud profile does **not** prove Terraform's ADC identity matches it. Before any authenticated plan/apply, verify both identities using the permitted private-profile workflow. Do not create/download service-account keys. Existing user-level ADC from an unrelated account must not be used accidentally. Offline validation above requires no ADC.

## Existing resource adoption

Read existing project APIs, service accounts, Artifact Registry repositories, Secret Manager metadata, Cloud Run services, IAM, Firebase project/web apps, sign-in settings, Firestore databases/location/rules and Cloud Build repository/trigger inventory first. Read secret metadata only; never print a payload. Record discovery privately. Import matching resources rather than create duplicates.

`firebase-adoption/` is a **separate Terraform root and state**. It contains declarative imports guarded by explicit flags. Enabling a Firebase/database adoption flag imports that exact remote object or fails if it does not exist; it does not silently create another Firebase project or database. The existing database location is mandatory and deletion protection is retained/enabled. Review any other imported-default drift before applying.

The optional `publish_firestore_rules` flag creates an immutable ruleset from `../../firestore.rules`, imports the existing `cloud.firestore` release, and points that release to the new ruleset. The checked-in client rules deny client reads/writes because this application sends data requests through the authenticated backend. That backend uses Admin SDK access and must check ownership itself. Firebase Auth user sign-in is independent of Firestore rules.

For adoption-root offline validation from `infra/`, use `-chdir=firebase-adoption` before the Terraform subcommand:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption init -backend=false -input=false
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption test -no-color
```

Authentication settings are deliberately not overwritten by the adoption root. First discover existing providers/domains and whether Identity Platform is already configured. A later reviewed Terraform configuration can import `google_identity_platform_config` at `projects/PROJECT_ID/config` and manage the exact intended email/password provider and authorized domains. Preserve unrelated sign-in providers, MFA, quotas and tier settings; do not treat enabling a product tier as a harmless local setup. [Firebase Terraform guidance](https://firebase.google.com/docs/projects/terraform/get-started), [Identity Platform config schema](https://registry.terraform.io/providers/hashicorp/google/8.1.0/docs/resources/identity_platform_config)

For the main root, use resource-address imports after setting private variables and the matching provisioning flags. Accepted remote ID patterns include:

| Terraform address | Remote ID pattern |
|---|---|
| `google_project_service.required["PROJECT/API"]` | `PROJECT/API` |
| `google_artifact_registry_repository.backend[0]` | `projects/PROJECT/locations/REGION/repositories/vibeestimate` |
| `google_service_account.runtime[0]` | `projects/PROJECT/serviceAccounts/vibeestimate-runtime@PROJECT.iam.gserviceaccount.com` |
| `google_secret_manager_secret.gemini[0]` | `projects/PROJECT/secrets/vibeestimate-gemini-api-key` |
| `google_cloud_run_v2_service.backend[0]` | `projects/PROJECT/locations/REGION/services/vibeestimate-api` |
| `google_cloudbuild_trigger.backend[0]` | `projects/PROJECT/locations/REGION/triggers/TRIGGER_ID` |

Keep import commands and exact resource identifiers private. IAM member import IDs include role/member details and must follow the pinned provider's resource documentation. Main-root imports have **not** been run. No Terraform state bucket has been created: before a team/CI Terraform apply workflow, choose and Terraform-manage a protected remote backend or explicitly retain encrypted local state for the single operator. Never commit either local or remote-state credentials.

## Secret provisioning without a value in state

The default creates secret metadata only when infrastructure provisioning is enabled. Later, set `write_gemini_secret_version=true` and supply `gemini_api_key` through a short-lived environment variable or a secure interactive wrapper. Never pass it as a command literal, saved tfvars file, build substitution, log, or Terraform output. Keep debug/provider trace logging disabled. The variable is both `ephemeral` and `sensitive`, and the resource uses `secret_data_wo`, not `secret_data`. Increment `gemini_secret_rotation` only when rotating intentionally. [HashiCorp ephemeral values](https://developer.hashicorp.com/terraform/language/manage-sensitive-data/ephemeral), [Google write-only secret resource](https://registry.terraform.io/providers/hashicorp/google/8.1.0/docs/resources/secret_manager_secret_version)

If a version already exists, keep writing disabled and specify its numeric `gemini_secret_version`. Never use `latest`; numeric versions and immutable image digests make a reviewed revision reproducible. Secret versions are abandoned on removal from state rather than destroyed, so review retention explicitly after the event.

## Cloud Build and deployment later

The connection alone is insufficient: discovery must provide the complete existing repository child name. Creating a trigger is optional; created triggers are disabled by default. The dedicated build identity lives in the connection's project, can write only this Artifact Registry repository and build logs, and has no Cloud Run deployment or Gemini secret-read role. The operator creating/running the trigger also needs the appropriate Cloud Build and service-account act-as permissions; do not grant those broadly to the build identity. [User-specified build identities](https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)

The root `cloudbuild.yaml` must use `_IMAGE_REPOSITORY` supplied by Terraform, run required checks, build the backend image, and publish it. It must use Cloud Logging (`CLOUD_LOGGING_ONLY`) with this custom service account and must not run an ad hoc Cloud Run deploy command. Once a build succeeds, obtain the immutable image digest.

For the later release, review these values together: `provision_backend_infrastructure=true`, a tested image digest, exact HTTPS frontend origins, real Firebase project/database, a verified Gemini model and numeric secret version. Then set `deploy_backend=true` and review a Terraform plan before its authorized apply. Cloud Run has the required `dev-tutorial=cloud-run-ai-challenge` label, scale-to-zero, bounded maximum instances, a dedicated runtime identity, and Secret Manager injection. Firebase tokens—not Cloud Run IAM tokens—authenticate application users; public transport is intentional and is not permission to access another user's records. [Cloud Run resource schema](https://registry.terraform.io/providers/hashicorp/google/8.1.0/docs/resources/cloud_run_v2_service)

The initial backend accepts **one** exact frontend origin: provide a one-element `frontend_origins` list. Terraform sets `FRONTEND_ORIGIN`, `APP_ENV=production`, `AI_PROVIDER=gemini`, `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` and `GEMINI_MODEL`, plus a Secret Manager reference for `GEMINI_API_KEY`. Cloud Run supplies `PORT=8080`; `/health` is the startup probe. Do not override Cloud Run's own backend-project metadata with the Firebase project ID.

Deployment remains deferred. Real local Gemini conversations are now verified through Vertex; this does not count as the required Cloud Run deployment or AI Studio build evidence. See the application hackathon checklist for the remaining submission steps.
