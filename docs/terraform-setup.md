# Terraform setup

Terraform owns the application infrastructure. Local fixtures require no cloud credentials or infrastructure apply. Ordinary production releases use the [native delivery pipeline](deployment.md); infrastructure plans are reviewed separately.

## Project-local tooling

Terraform 1.13.5 and Google providers 8.1.0 are pinned. The Windows installer verifies the official archive checksum and keeps binaries, provider cache and working data inside ignored repository folders.

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
rtk npm run check:infra
```

The check runner formats, initializes with `-backend=false`, validates and runs mock-provider tests for all six [current roots](../infra/README.md#terraform-roots). It makes no cloud API calls. Keep provider lock files committed; keep real tfvars, credentials, state, saved plans and backups outside the checkout.

## Private targets and authentication

Supply one application project for Firebase identity, Firestore, Eventarc and the Cloud Run backend. Verify the account/profile before cloud operations. Discover the existing Cloud Build connection separately; its location can differ from the runtime region. Preserve the discovered Firestore location.

A selected gcloud profile does not establish the identity used by shared ADC. Use the authorized private authentication workflow and short-lived credentials; do not replace shared ADC or create service-account key files. Native builds use their attached build identity.

Initialize each remote root with the private state bucket and its existing prefix. The bucket must have versioning, locking, public-access prevention and deletion protection. Never point an existing configuration at an empty prefix or restore an old local state over newer remote state. Keep state separate from the build-source bucket and its expiring objects.

## Existing resources

Discover APIs, identities and IAM, registry repositories, secret metadata, Firebase membership/web app/Auth, database/rules, Eventarc trigger, queue, scheduler, Cloud Run and GitHub delivery resources before applying. Import matching resources into the correct root and record imports in the [inventory](infrastructure-inventory.md). Do not give two roots ownership of the same resource.

Review a full saved plan, including destructive actions and drift. Bind apply to the reviewed plan and exact private inputs. The [production launcher](../infra/production/README.md) verifies the selected profile, preserves shared ADC and checks plan/input hashes. Runtime releases additionally restrict changes to the existing service and verified immutable image.

## Firebase foundation

[`infra/firebase`](../infra/firebase/README.md) manages Firebase membership, the web app, protected default Firestore database, Google Auth, client rules, runtime IAM, the browser SDK secret and direct Eventarc delivery. Required private inputs include the project, exact database location, runtime region, authorized domains, existing OAuth credentials and active SDK secret ID.

Google sign-in is enabled. Anonymous, email/password and phone sign-up are disabled. Keep production domains and authorized local development hosts in the domain list. Auth settings, database, Firebase membership and web app retain deletion guards. Firestore client rules deny direct reads and writes; every Admin SDK operation must enforce backend ownership or room membership.

The Eventarc trigger selects only created `roomReviewOutbox/{jobId}` documents in the default database. Its dedicated identity invokes the existing `/internal/firestore` endpoint, which creates named Cloud Tasks. The production root owns the queue and paused recovery scheduler.

## Runtime and delivery

[`infra/runtime`](../infra/runtime/README.md) owns the complete Cloud Run service template. Import an existing unmanaged service before enabling the main trigger and verify a clean plan. [`infra/delivery`](../infra/delivery/main.tf) owns the repository child, main trigger, dedicated state bucket and narrowly scoped release IAM.

The release metadata must name the same project for Firebase and the backend. It contains identifiers and settings only; the image digest is resolved during the build. Runtime deployment never changes Firebase providers, rules, queue configuration or foundation IAM.

## Secrets and local Gemini

The production browser SDK configuration is managed by `infra/firebase`, with its secret ID supplied privately. An ephemeral sensitive input writes the payload through the provider's write-only field. Preserve `sdk_config_version` unless the payload intentionally changes. Cloud Run references a numeric version, never `latest`. Keep the optional Firebase app namespace stable to retain browser session identity.

OAuth configuration is sensitive and can be present in protected Terraform state. Restrict state access and never print it. Secret payloads, tokens and credentials must not appear in command literals, build substitutions, logs or public examples.

Production Gemini uses keyless Vertex access through the runtime identity. The separate [Gemini-local root](../infra/gemini-local/README.md) manages local Developer API prerequisites, a restricted credential and optional Vertex activation. The [guardrails root](../infra/guardrails/README.md) owns the project budget. These roots retain private local state and are independent of application releases.

Actual plans, state verification and executed checks are recorded in [verification.md](verification.md); mock tests alone do not establish live permissions or a successful model journey.
