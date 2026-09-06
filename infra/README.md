# Infrastructure

Terraform manages VibeEstimate's cloud resources. One Cloud Run service serves
the Next.js frontend and Express API on the same origin. Local emulator testing
needs no Terraform apply or cloud credentials.

Start with the [deployment guide](../docs/deployment.md) for releases and
adoption, or [Terraform setup](../docs/terraform-setup.md) for operator
configuration. Executed resource changes belong in the
[infrastructure inventory](../docs/infrastructure-inventory.md); release and
journey evidence belongs in [verification](../docs/verification.md).

## Terraform roots

Each root owns different resources and has separate state. No two roots manage
the same resource.

| Root | Owns | State |
| --- | --- | --- |
| [`production/`](production/README.md) | Foundation APIs, runtime/build/task identities and IAM, Artifact Registry, original build-source bucket, review queue, recovery scheduler, web-config secret, Firebase authorized domains and public service access | Shared dedicated GCS state bucket, prefix `production` |
| [`delivery/`](delivery/main.tf) | Repository child under the existing Cloud Build connection, `^main$` push trigger, dedicated state bucket and release IAM | Same GCS state bucket, prefix `delivery` |
| [`runtime/`](runtime/README.md) | The adopted Cloud Run service and its complete template | Same GCS state bucket, prefix `runtime` |
| [`firebase-adoption/`](../docs/terraform-setup.md#firebase-adoption) | Existing Firebase project and Firestore database adoption; optional Firestore rules publication | Separate private local state |
| [`gemini-local/`](gemini-local/README.md) | Local Gemini prerequisites, restricted Developer API key and optional Vertex API enablement | Separate private local state |
| [`guardrails/`](guardrails/README.md) | Monthly Cloud Billing budget scoped to the backend project, and the Budget API it needs | Separate private local state |

`production`, `delivery` and `runtime` share the dedicated state bucket
provisioned by `delivery`, with distinct prefixes. The bucket has versioning,
public-access prevention and deletion guards; its GCS backends use state locking.
It is separate from the original build-source bucket, whose seven-day object
deletion rule makes it unsuitable for state. Bucket names are supplied during
initialization, not committed in backend configuration. See the
[state setup and migration notes](production/README.md#private-configuration-and-state).

Firebase adoption, Gemini-local and guardrails keep their state outside the
checkout in the operator's private directory. Existing resources must be discovered and imported
before management; preserve the existing database, sign-in providers and GitHub
connection. Actual accounts, project IDs, credentials, plans and state backups
stay private.

## Releases

After adoption and verification, a reviewed push to GitHub `main` triggers
[`cloudbuild.yaml`](../cloudbuild.yaml). Cloud Build checks the commit, builds
the image, resolves its immutable digest and applies a saved `runtime/` plan
restricted to the existing service. Its health check verifies the deployed Git
revision; successful health alone does not establish a complete user journey.

Only `runtime/` is applied during ordinary releases. The other roots are used
for separately reviewed bootstrap or infrastructure changes. Follow the
[deployment workflow](../docs/deployment.md#ordinary-releases) and
[runtime adoption contract](runtime/README.md#adopt-before-enabling).

## Project-local tooling

The installer pins Terraform **1.13.5** and verifies its archive checksum. The
roots pin Google providers to **8.1.0**. From the repository root:

```powershell
rtk proxy node infra/scripts/install-terraform.mjs
rtk proxy node infra/scripts/check.mjs
```

The [check runner](scripts/check.mjs) checks formatting, initializes each root
with `-backend=false`, validates its schema and runs its mock-provider tests.
Tooling and caches stay in ignored project folders. Provider installation needs
network access; these checks use no cloud credentials and apply no resources.
Passing them does not verify live IAM, billing or deployment.

Keep each root's `.terraform.lock.hcl` in version control. Use the
[operator setup guide](../docs/terraform-setup.md#private-configuration-and-authentication)
for authenticated work with the explicitly verified profile and private inputs.
