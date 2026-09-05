# Terraform setup

Local testing needs no cloud project, production credential, or Terraform apply. This document covers the operator bootstrap roots. The release path itself is in the [deployment guide](deployment.md); ordinary releases run no Terraform from a workstation.

Resource ownership per root is listed in the [infra README](../infra/README.md).

## Project-local tooling

Terraform **1.13.5** and Google providers **8.1.0** are pinned. Windows x64 installation downloads the official archive and verifies its pinned SHA256. The launcher keeps Terraform CLI configuration, provider cache, working data and temporary downloads inside this project's ignored folders. It changes no global PATH or persistent environment value.

From the repository root:

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
```

There is no Terraform configuration at `infra/` itself, so every command selects a root with `-chdir`. From `infra/`:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery init -backend=false -input=false
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 fmt -check -recursive
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery test -no-color
```

Init downloads signed providers; validate and the mock-provider tests require no cloud credential and make no cloud API call. Keep each root's `.terraform.lock.hcl` in version control. Ignore `.tools`, `.terraform`, state, plan files, real tfvars and credentials. On other operating systems, use the same Terraform version with equivalent project-local CLI config, cache and temp settings.

Executed delivery-root checks: schema validation and **3 mock tests passed**, covering the main-push trigger contract, private versioned state without lifecycle expiry, and narrowly scoped release IAM. Executed adoption-root checks: schema validation and **2 mock tests passed** for no implicit Firebase adoption and rejecting an undiscovered database location. Mock tests validate configuration only, never live IAM, billing, a cloud image or Gemini access.

## Private configuration and authentication

Actual account and profile names, backend/Firebase/build project IDs, connection paths and deployment variables belong outside this public repository. Pass the private tfvars file explicitly; checked-in examples contain generic placeholders. Backend and Firebase projects may differ. The Cloud Build connection project and region follow the existing connection and may differ from the Cloud Run region. Firestore location is discovered separately.

Activating a gcloud profile does **not** prove Terraform's ADC identity matches it. Before any authenticated plan or apply, verify both identities using the permitted private-profile workflow. Do not create or download service-account keys. Existing user-level ADC from an unrelated account must not be used accidentally. The offline validation above requires no ADC.

## Existing resource adoption

Read existing project APIs, service accounts, Artifact Registry repositories, Secret Manager metadata, Cloud Run services, IAM, Firebase project and web apps, sign-in settings, Firestore database/location/rules, and the Cloud Build repository and trigger inventory first. Read secret metadata only; never print a payload. Record discovery privately. Import matching resources rather than create duplicates.

The one adoption that a release depends on is the Cloud Run service, imported into `infra/runtime`. Its contract and ordering are in the [runtime adoption notes](../infra/runtime/README.md#adopt-before-enabling) and the [foundation handoff](../infra/production/README.md#adopt-the-running-service).

### Firebase adoption

`firebase-adoption/` is a **separate Terraform root and state**. It contains declarative imports guarded by explicit flags. Enabling a Firebase or database adoption flag imports that exact remote object, or fails if it does not exist; it never silently creates another Firebase project or database. The existing database location is mandatory and deletion protection is retained. Review any other imported-default drift before applying.

The optional `publish_firestore_rules` flag creates an immutable ruleset from `firestore.rules`, imports the existing `cloud.firestore` release, and points that release at the new ruleset. The checked-in client rules deny client reads and writes because this application sends data requests through the authenticated backend. That backend uses Admin SDK access and must check ownership itself. Firebase Auth sign-in is independent of Firestore rules.

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption init -backend=false -input=false
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=firebase-adoption test -no-color
```

Authentication settings are deliberately not overwritten by the adoption root. `infra/production` patches only `authorizedDomains`, with an explicit field mask, through an imported REST resource. It does not adopt sign-in providers or read password-hashing configuration. Preserve unrelated providers, MFA, quotas and tier settings; enabling a product tier is not a harmless local change. [Firebase Terraform guidance](https://firebase.google.com/docs/projects/terraform/get-started)

## Gemini for local development

Live Gemini against emulator Firebase uses the separate [Gemini Terraform root](../infra/gemini-local/README.md). It manages the Developer API prerequisites, a dedicated identity, a service-account-bound key restricted solely to Gemini, and an optional Vertex API. Its state and plans stay in the operator's outer private directory.

The secure launcher verifies the authorized profile, account and project, uses an ephemeral profile access token, checks that shared ADC remains unchanged, and binds a saved plan to its private state path and target identity:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 init
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 plan
# Inspect the concrete plan before applying it.
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 apply
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/terraform-gemini.ps1 check
```

Discovery, provisioning and the final clean plan were executed on 5 September 2026. The private `enableVertexAi: true` setting opts into `aiplatform.googleapis.com` and is bound into the saved plan. The reviewed plan added one API with zero changes or destruction. No additional credential or IAM grant was needed for Vertex.

The Developer API still reports a depleted-prepaid-balance error despite Cloud Billing being enabled. A real structured Gemini request through Vertex succeeded using the named profile and Cloud Billing. See [verification.md](verification.md), [local-setup.md](local-setup.md), and [Google's Gemini billing guidance](https://ai.google.dev/gemini-api/docs/billing). No billing account change or prepaid purchase was made.

Production does not use a Gemini API key at all. The Cloud Run runtime calls Vertex with its own service identity, so no Gemini secret exists in the production roots.

## Secrets

The only production secret Terraform manages is the public Firebase browser SDK configuration, held in `infra/production` as `vibeestimate-web-config`. It is injected into Cloud Run by numeric version, never `latest`, so a reviewed revision stays reproducible.

Its payload is supplied through an `ephemeral`, `sensitive` variable and written with the provider's write-only `secret_data_wo` argument, so no payload enters Terraform state. Never pass it as a command literal, saved tfvars file, build substitution, log, or Terraform output, and keep provider trace logging disabled. Secret versions are abandoned on removal from state rather than destroyed, so review retention explicitly. [HashiCorp ephemeral values](https://developer.hashicorp.com/terraform/language/manage-sensitive-data/ephemeral), [Google write-only secret resource](https://registry.terraform.io/providers/hashicorp/google/8.1.0/docs/resources/secret_manager_secret_version)
