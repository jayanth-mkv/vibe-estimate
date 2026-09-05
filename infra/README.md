# Infrastructure

Every cloud resource is managed by Terraform. Cloud Run is the only application
host: one image serves the Next.js frontend and the Express API on a single
origin, so there is no separate frontend hosting provider to configure.

Local development uses emulators and needs none of these roots.

## Terraform roots

Each root owns a disjoint set of resources and keeps its own state. No two roots
manage the same object.

| Root | Owns | State |
| --- | --- | --- |
| [`production/`](production/README.md) | APIs, runtime/build/delivery identities and IAM, Artifact Registry, build-source bucket, review queue, recovery scheduler, web-config secret, Firebase authorized domains, public invoker binding | Shared state bucket, prefix `production` |
| [`delivery/`](../docs/deployment.md#resource-ownership) | Cloud Build repository child, the `^main# Infrastructure

Every cloud resource is managed by Terraform. Cloud Run is the only application
host: one image serves the Next.js frontend and the Express API on a single
origin, so there is no separate frontend hosting provider to configure.

Local development uses emulators and needs none of these roots.

## Terraform roots

Each root owns a disjoint set of resources and keeps its own state. No two roots
manage the same object.

| Root | Owns | State |
| --- | --- | --- |
 push trigger, the runtime state bucket and release IAM | Shared state bucket, prefix `delivery` |
| [`runtime/`](runtime/README.md) | The one Cloud Run service and its complete template | Shared state bucket, prefix `runtime` |
| [`firebase-adoption/`](../docs/terraform-setup.md#firebase-adoption) | Import-only Firebase project, Firestore database and rules release | Private local state |
| [`gemini-local/`](gemini-local/README.md) | Local-development Gemini Developer API prerequisites and its restricted key | Private local state in `../docs/private/terraform/` |

Every cloud-owning root keeps its state in the one private, versioned,
locking GCS bucket that `delivery` provisions, each under its own prefix. Only
the local-development roots keep state on the operator workstation.

`production`, `delivery` and `firebase-adoption` are operator bootstrap roots:
they run rarely, from a workstation, with an explicitly verified profile and a
short-lived token. `runtime` is the only root a release applies, and Cloud Build
applies it — not an operator.

## Releases

A reviewed push to GitHub `main` is the whole release action. The trigger owned
by `delivery/` runs [`cloudbuild.yaml`](../cloudbuild.yaml), which checks and
builds the commit, resolves the immutable image digest, and applies a saved
`runtime/` plan restricted to that one service. See the
[deployment guide](../docs/deployment.md).

No release step uploads a local source archive, runs `gcloud run deploy`, or
depends on an operator script.

## Project-local tooling

Terraform **1.13.5** and Google provider **8.1.0** are pinned. Install the
verified binary once, then run each root with `-chdir`:

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery init -backend=false -input=false
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery validate -no-color
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\terraform.ps1 -chdir=delivery test -no-color
```

The launcher keeps CLI configuration, provider cache, working data and temporary
downloads inside this project's ignored folders and changes no global PATH or
persistent environment value.

`delivery/` and `gemini-local/` carry mock-provider test suites. They make no
cloud API call, so a passing run is evidence about configuration, not about live
IAM, billing or a deployment.

Keep each root's `.terraform.lock.hcl` in version control. Real account and
project IDs, state, plans, tfvars and credentials stay outside this checkout
under `../docs/private/`.
