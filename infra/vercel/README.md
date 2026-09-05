# Vercel frontend infrastructure

This configuration manages a Next.js project and its production environment, connected to GitHub for automatic deployment from `main`. The first reviewed push to `main` after setup launches the production build through that connection. It is not evidence of an applied project or a successful deployment. The release operator records discovered, imported, created, and deployed resources in the main infrastructure inventory. [Official GitHub deployment workflow](https://vercel.com/docs/git/vercel-for-github)

Terraform is pinned to the repository's supported 1.13.5 minimum and the official `vercel/vercel` provider is pinned to `5.14.0`. `frontend/` is the project root; installation uses the root npm workspace lockfile and the build runs inside the frontend. The operator must verify that the Vercel GitHub installation can read the selected repository and its workspace files outside `frontend/`. Vercel enables outside-root source access by default on projects created after August 27, 2020; the pinned provider exposes no setting for that option, so inspect it when importing an older project. [Official monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)

## Inputs

All actual account, repository, environment, state, and deployment values belong in external operator configuration under `../docs/private/`. Supply credentials in memory through the release wrapper; do not put values on command lines, print them, or enable provider/HTTP debug logs. The Terraform provider does not automatically consume the Vercel CLI login file: the operator explicitly supplies the verified CLI account token.

| Variable | Contract |
| --- | --- |
| `api_token` | Required sensitive, ephemeral string from the verified Vercel CLI identity. |
| `team_id` | Required verified `team_…` ID; never inferred from a default account. |
| `project_name` | Required existing project name to import, or approved new name. |
| `github_repository` | Required `owner/repository` authorized for the Vercel GitHub installation. |
| `production_branch` | Required explicit `main`; other production branches are rejected. |
| `environment_versions` | Required map of environment names to positive integer revisions. Increment a revision when its value changes. |
| `environment_values` | Required sensitive, ephemeral map of string values, with exactly the same keys as the revisions. |

The six required environment keys are `BACKEND_ORIGIN`, `FIREBASE_WEB_CONFIG`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`, `NEXT_PUBLIC_AUTH_MODE`, and `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`. Their enforced contract is an HTTPS backend origin, real Firebase public SDK JSON (`projectId`, `apiKey`, `authDomain`, `appId`), an empty browser API URL for the same-origin gateway, emulators `false`, auth mode `guest`, and Google recovery `true`. `NEXT_TELEMETRY_DISABLED=1` is the only optional additional key. Gemini, service-account, OAuth, ADC, and other backend credential keys are rejected.

These environment resources target production only. Do not point preview deployments at production Firebase/backend services by copying credentials into preview settings. The Firebase SDK configuration and `NEXT_PUBLIC_` flags are browser-visible application configuration; marking their Vercel storage sensitive does not make browser fields secret.

Values use the provider's write-only `value_wo` argument, with `value_wo_version` controlling updates. Ephemeral inputs and write-only arguments keep those values out of Terraform plans and state. Normal environment `value`, inline project environments, and deployment-specific environments are intentionally absent. [Pinned environment-variable schema](https://github.com/vercel/terraform-provider-vercel/blob/v5.14.0/docs/resources/project_environment_variable.md)

## Import and release order

1. Discover the existing account, team, GitHub installation, and project through read-only authenticated inspection. A matching project must be imported before management; do not apply a duplicate or replacement. Keep discovery evidence outside the repository and report metadata only.
2. Initialize the local backend with an explicit absolute state path outside the checkout. Keep backend metadata, plans, lock files containing state locks, and credentials in the external private directory. The checked-in dependency lockfile contains only public provider checksums. Do not run an authenticated plan/apply with the default local state path.
3. Import an existing project at `vercel_project.frontend` using `team_ID/project_ID`. Import each matching production environment resource at `vercel_project_environment_variable.production["KEY"]` using `team_ID/project_ID/environment_ID`. Do not import an unrelated project or overwrite existing unrelated environments. Review the plan and any protection changes before applying. Project destruction is blocked by `prevent_destroy`.
4. Apply the reviewed project/environment configuration with `production_branch="main"`. Git integration is active at this point: pushes can trigger deployment, so do not push a release until the remaining dependencies are ready. Terraform does not manage an individual deployment or supply a build ref.
5. Discover the canonical production hostname; authorize the Firebase domain through its Terraform stack and release the compatible backend. Confirm its production health metadata without credentials. Then push the reviewed release commit to GitHub `main`; Vercel's native Git connection starts the production build. No local-file uploads, prebuilt artifacts, deployment hooks, or manual deployment resources are used.
6. Inspect the resulting Git-triggered deployment and verify its Git SHA matches the pushed `main` commit and the production URL is public. Run the production browser checks through the same-origin gateway, including guest identity, Google handoff, room sharing, and source/draft persistence. Subsequent pushes to `main` follow the same automatic path. Record deployment evidence separately from Terraform's project/environment state.

The project explicitly uses `only_preview_deployments` authentication, retaining Vercel access control for previews while allowing production access. This is Vercel's legacy preview-only scope; its current Standard Protection also protects generated production deployment URLs while keeping the canonical production domain public. Verify the applied scope on the authorized account. [Official protection scopes](https://vercel.com/docs/deployment-protection)

No password or IP restriction is configured; an imported plan must explicitly review any removal of those restrictions. Git comments are disabled and fork protection stays enabled. The pinned provider accepts the explicit preview-only scope instead of its `standard_protection_new` default. [Pinned project schema](https://github.com/vercel/terraform-provider-vercel/blob/v5.14.0/docs/resources/project.md)

Functions default to Singapore (`sin1`) with a 90-second ceiling. The existing API route declares 70 seconds and waits at most 65 seconds for the backend. Account-plan support and any platform limits must be verified during the deployment inspection. The pinned project resource supports automatic builds from its Git repository connection; this stack has no `vercel_deployment` resource and cannot upload local files. [Pinned project Git integration](https://github.com/vercel/terraform-provider-vercel/blob/v5.14.0/docs/resources/project.md)

## Offline checks

The `tests/safety.tftest.hcl` runs use a mocked provider and synthetic values only; they perform no Vercel API calls. Run with the project-local Terraform binary, a sanitized environment without auth/debug variables, and an isolated `TF_DATA_DIR`. `init -backend=false` downloads the pinned public provider without initializing a real state backend; `validate` and `test` then validate the schema and safety boundaries.

```powershell
rtk proxy infra/.tools/terraform-1.13.5/terraform.exe -chdir=infra/vercel fmt -check -recursive
rtk proxy infra/.tools/terraform-1.13.5/terraform.exe -chdir=infra/vercel init -backend=false -input=false
rtk proxy infra/.tools/terraform-1.13.5/terraform.exe -chdir=infra/vercel validate
rtk proxy infra/.tools/terraform-1.13.5/terraform.exe -chdir=infra/vercel test
```

The tests check automatic Git deployment from explicit `main`, explicit account/repository, public production/protected preview settings, workspace and function settings, write-only environment storage, emulator/direct-browser-backend rejection, forbidden backend credentials, invalid revisions, and missing environment values. These mock checks do not establish GitHub authorization, successful cloud mutation, or a working production build.
