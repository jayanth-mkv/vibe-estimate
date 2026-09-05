# Deployment

After one-time adoption, a reviewed push to GitHub `main` is the ordinary release action. Cloud Build checks and builds that commit, then Terraform updates the existing Cloud Run service. Vercel follows the same GitHub branch for the frontend after its GitHub App and project connection are authorized.

This document defines the workflow, not proof of a successful native release or Vercel deployment. Record executed resource changes in the [infrastructure inventory](infrastructure-inventory.md) and actual builds and user journeys in [verification.md](verification.md).

## Resource ownership

| Terraform root | Responsibility | State |
| --- | --- | --- |
| `infra/production` | Foundation APIs, identities/IAM, registry, queue/scheduler, secret metadata/version, Firebase domains and public service access | External private foundation state |
| `infra/delivery` | Existing-connection repository child, native main trigger, dedicated runtime state bucket and release IAM | External private delivery state |
| `infra/runtime` | The single adopted Cloud Run service and its complete template | Private versioned GCS bucket, prefix `runtime` |
| `infra/vercel` | GitHub-connected frontend project and production environment values | External private Vercel state |

The original backend template, Gemini-local and Firebase-adoption roots retain separate ownership. A release must not recreate the existing database, change Firebase providers, replace the GitHub connection, or copy the entire foundation state into the runtime root.

All resource configuration and IAM changes use Terraform. Cloud Build builds/pushes images and applies the checked runtime plan. Application source comes from GitHub; ordinary releases do not upload a local source archive or call `gcloud run deploy`.

## Bootstrap and adoption

1. **Verify existing targets.** Read the outer private authorization and discover the selected account, backend and Firebase projects, Cloud Run service, registry, runtime/task identities, queue, secret version, GitHub connection and Vercel account/team/project. Confirm the connection location separately from the Cloud Run region. Import matching resources before management; preserve unrelated resources.
2. **Prepare native delivery through Terraform.** Adopt or create the repository child under the existing connection, the dedicated private versioned GCS bucket, and the build identity's release permissions. Configure the trigger for `^main$`, `cloudbuild.yaml`, and the verified build identity. Complete runtime adoption before publishing a release to main; hold main pushes if the trigger is already enabled during bootstrap.
3. **Transfer service ownership.** Back up foundation state privately. Initialize the runtime GCS backend and import the existing service into `google_cloud_run_v2_service.application`, using its current digest and exact template. Then apply the foundation's `removed` block with `destroy=false` to forget the former `[0]` entry. Verify both states and plans; the live service, public invocation and scheduler must remain intact. See the [foundation handoff](../infra/production/README.md#adopt-the-running-service) and [runtime adoption contract](../infra/runtime/README.md#adopt-before-enabling).
4. **Authorize Vercel's GitHub access.** Install the Vercel GitHub App for the selected repository before Terraform links it. Discover/import an existing matching project and environment resources rather than duplicating them. Configure the project root as `frontend`, installation from the root workspace lockfile, and production branch `main`. Complete backend and Firebase-domain prerequisites before the first main push.
5. **Set frontend configuration and domains.** Discover the canonical Vercel production hostname, add it through the foundation Terraform domain input, and preserve all existing Firebase domains. Configure Vercel's production environment through its Terraform root using the verified Cloud Run origin and public Firebase SDK configuration. Publish the compatible backend before launching a frontend that depends on its new request contract.
6. **Verify the initial native release.** Push the reviewed pipeline/application commit to main. Confirm the triggering Git SHA, successful checks/build, resolved immutable image, accepted service-only plan, and resulting Cloud Run revision. The same push launches Vercel through its Git integration. Verify both production URLs and real user journeys. Only executed checks establish release evidence.

The runtime state bucket must be separate from the original source bucket, whose seven-day deletion rule is unsuitable for Terraform state. Keep versioning, public-access prevention, locking and deletion guards enabled. One-time operator authentication uses the explicitly verified profile and short-lived credentials; shared ADC is preserved. Native builds use their attached identity and receive no user ADC or credential files.

The build identity has repository-scoped image writing, log writing, object administration on the dedicated runtime state bucket, service-scoped Cloud Run read/update, operation polling, and permission to act as the existing runtime identity. It receives no direct Firebase administration, Vertex inference or secret-payload role. Foundation IAM and runtime IAM remain separate from code deployment.

## Ordinary releases

Review and verify work on a task branch, then merge the approved changes into `main`. From a checkout whose local `main` contains the reviewed commit, the release event is:

```powershell
rtk git push origin main
```

The native [Cloud Build configuration](../cloudbuild.yaml) then:

1. Verifies the main-branch event, full commit SHA and allowed nonsecret trigger metadata.
2. Runs workspace typechecks, backend/frontend unit tests and release-boundary tests.
3. Builds the root Dockerfile from that Git checkout, pushes the commit-tagged image and resolves its immutable Artifact Registry digest.
4. Initializes the runtime GCS backend, creates a saved Terraform plan, and accepts only a no-op or update to the one adopted service. Create/delete/replace actions and unrelated resource changes fail the release.
5. Checks the current GitHub main commit before apply, skips an older commit, and applies the verified saved plan with state locking. A plan invalidated by another release is not automatically replanned.
6. Checks production health for Firebase Auth, cloud Firestore and Vertex configuration. This check does not call Gemini or establish an end-to-end review test.

Vercel's native Git integration deploys `main` independently. Its frontend uses a same-origin API gateway with `BACKEND_ORIGIN` set to Cloud Run; the browser never receives a Gemini or service-account credential. The existing Cloud Run image retains its own gateway and Express processes, preserving the current task-delivery URL and backend routes.

The two platforms do not provide one atomic rollout. Preserve API compatibility across ordinary releases. For a breaking API change, stage a compatible backend first and then publish its frontend consumer. Failed checks or plans stop Cloud Run deployment. A failed post-deploy health check fails the build without an automatic rollback; release a reviewed Git revert through main when a rollback is needed.

## Private configuration

Actual project/account IDs, connection paths, domains, environment values, plans, state and credentials stay in `../docs/private/` or their provisioned private cloud stores. Committed Terraform and build files contain placeholders and variable references. Trigger metadata contains only the defined runtime identifiers and settings; base64 encoding does not make a credential safe to include.

For Vercel, verify the explicit account/team, project, GitHub repository and main branch. Production environment values use Terraform's ephemeral input and the provider's write-only arguments. Increment the corresponding environment version when a value changes. The allowed values are:

| Key | Required behavior |
| --- | --- |
| `BACKEND_ORIGIN` | Verified HTTPS Cloud Run origin |
| `FIREBASE_WEB_CONFIG` | Public Firebase SDK configuration for the authorized real project |
| `NEXT_PUBLIC_API_URL` | Empty, keeping browser API calls on the frontend origin |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | `false` |
| `NEXT_PUBLIC_AUTH_MODE` | `guest` |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | `true`, providing optional Google account recovery |
| `NEXT_TELEMETRY_DISABLED` | `1` when supplied |

Keep production values out of preview deployments. Vercel production is intended to be public; preview protection remains enabled. Firebase SDK fields are browser-visible configuration, even when their platform storage is marked sensitive. See the [Vercel Terraform contract](../infra/vercel/README.md).

The optional private `vercel-config.json` also supplies `firebaseProjectId` and `extraFirebaseAuthDomains` to the foundation launcher. Only explicit hostnames are admitted, the Firebase project must match, and previously discovered domains remain in the Terraform-managed list. See [Firebase domains for Vercel](../infra/production/README.md#firebase-domains-for-vercel).

## Local verification remains available

Keep the existing repository-local setup, emulator snapshot/restore, fixture, connected-development and Playwright tools. They support development and regression testing; they are not manual deployment scripts. `npm run test:isolated` uses the isolated local workflow. Connected, live and production verification remain explicit operator actions using private configuration and bounded model-call scope.

Pipeline unit tests and public health are separate from live multi-turn review, draft/revision persistence, export, room sharing and access-denial evidence. Record the exact commit, image/revision, URLs, executed checks and remaining blockers in the verification record rather than treating a configured trigger or a successful build as complete product verification.
