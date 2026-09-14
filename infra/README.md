# Infrastructure

Terraform manages VibeEstimate's cloud resources. One Cloud Run service serves
the Next.js frontend and Express API on the same origin, with Firebase identity,
Firestore persistence and event-driven review delivery in the application
project. Local emulator tests need no cloud credentials or Terraform apply.

Use the [deployment guide](../docs/deployment.md) for releases and
[Terraform setup](../docs/terraform-setup.md) for private operator configuration.
Executed resource changes belong in the
[infrastructure inventory](../docs/infrastructure-inventory.md).

## Terraform roots

Each root owns separate resources and state; no two roots manage the same object.

| Root | Owns | State |
| --- | --- | --- |
| [production/](production/README.md) | Application APIs, runtime/build/task identities, inference IAM, Artifact Registry, build-source bucket, review queue, paused recovery scheduler and public service access | Private GCS bucket, `production` prefix |
| [firebase/](firebase/README.md) | Firebase membership, Auth, Firestore, client rules, scoped runtime IAM, active SDK secret and direct Eventarc delivery | Existing private GCS bucket and prefix supplied by the operator |
| [delivery/](delivery/main.tf) | Repository connection child, trusted-main build trigger, state bucket and release IAM | Private GCS bucket, `delivery` prefix |
| [runtime/](runtime/README.md) | Existing Cloud Run service and complete container template | Private GCS bucket, `runtime` prefix |
| [gemini-local/](gemini-local/README.md) | Gemini prerequisites, restricted Developer API key and Vertex API activation | Separate private local state |
| [guardrails/](guardrails/README.md) | Project-scoped monthly billing budget and Budget API | Separate private local state |

The dedicated state bucket has versioning, locking, public-access prevention
and deletion protection. It is separate from the build-source bucket, whose
short object lifecycle makes it unsuitable for state. Actual account/project
values, credentials, variable files, plans and backups remain outside the
checkout. Discover and import existing resources before managing them.

## Releases

A reviewed push to GitHub `main` triggers [cloudbuild.yaml](../cloudbuild.yaml).
Cloud Build checks the commit, publishes an immutable image and applies a saved
runtime plan restricted to the existing service. The health check verifies the
deployed Git revision. Other roots change only through separately reviewed
infrastructure plans.

## Project-local tooling

The installer pins Terraform 1.13.5 and verifies its archive checksum. The roots
pin Google providers to 8.1.0. From the repository root:

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
rtk proxy node infra/scripts/check.mjs
```

The check runner verifies formatting, initializes each current root with
`-backend=false`, validates the schema and runs mock-provider tests. These
checks use no cloud credentials and create no resources. Keep provider lock
files in version control; tooling and caches stay in ignored project folders.
