# Deployment

A reviewed push to GitHub `main` releases the application. Cloud Build checks that commit, builds an immutable image and applies a restricted Terraform plan to the existing Cloud Run service. The service serves Next.js and Express together on one origin. Firebase Authentication, Firestore, Eventarc and the backend use the same application project.

## Resource ownership

| Terraform root | Responsibility |
| --- | --- |
| `infra/production` | Application APIs, runtime/build/task identities, inference and queue IAM, image repository, build-source bucket, review queue, paused recovery scheduler and public invocation |
| `infra/firebase` | Firebase membership, web app, Google Auth, protected Firestore database, client rules, runtime data access, active SDK secret and direct event delivery |
| `infra/delivery` | Existing-connection repository child, main-branch trigger, private state bucket and release IAM |
| `infra/runtime` | The Cloud Run service and its complete container template |
| `infra/gemini-local` | Local Gemini prerequisites, restricted Developer API credential and Vertex API activation |
| `infra/guardrails` | Project billing budget and Budget API |

Each root owns separate resources and state. Ordinary application releases update only the runtime root. See [Terraform setup](terraform-setup.md) for infrastructure changes and the [inventory](infrastructure-inventory.md) for verified ownership.

## Initial setup

1. Verify the private account/profile and application project. Discover existing Firebase resources, database location, Cloud Run service, identities, queue, secrets, registry and GitHub connection. The connection location can differ from the runtime region.
2. Import matching resources into their owning Terraform roots before management. Preserve existing IDs, database settings, OAuth credentials and state. Review full plans before applying.
3. Configure Google sign-in, authorized application domains and deny-all browser Firestore rules through `infra/firebase`. The backend verifies tokens and owns all data authorization.
4. Configure direct Firestore document-created delivery and the bounded review queue. The event and task identities have separate audiences and permissions. Keep periodic recovery paused.
5. Initialize the runtime root against its private GCS state and import the existing service if it is unmanaged. Require a clean plan with its current image and complete template before enabling the release trigger.
6. Configure the discovered repository child, exact `^main$` branch filter, `cloudbuild.yaml` and dedicated build identity through `infra/delivery`.

The state bucket is private, versioned, protected and separate from the build-source bucket, whose short object lifecycle is unsuitable for state. Supply backend bucket/prefix settings privately and keep the existing state objects. Native builds use their attached identity; operator plans use an explicitly verified profile without modifying shared ADC.

The builder can write images and logs, manage objects in the state bucket, update the selected service and act as its runtime identity. It has no direct Firebase administration, Vertex inference or secret-payload role. Cloud resources and IAM remain Terraform-managed.

## Ordinary releases

Complete the relevant checks on a task branch, review the changes, then merge to `main` and push:

```powershell
rtk git push origin main
```

[Cloud Build](../cloudbuild.yaml) performs these steps:

1. Validate the main-branch event, full Git SHA and allowed nonsecret metadata.
2. Run workspace typechecks, backend/frontend tests, scene/configuration tests, frontend lint and release-boundary tests.
3. Build the root Dockerfile, publish the commit-tagged image and resolve its immutable registry digest.
4. Produce a saved Terraform runtime plan. Accept only a no-op or update to the one existing service; reject creation, deletion, replacement and unrelated changes.
5. Check the current GitHub main commit, skip stale releases and apply the verified plan under the state lock. A stale saved plan is not automatically regenerated.
6. Require production health to report the exact Git SHA, Firebase Auth, cloud Firestore and Vertex configuration.

Failed checks stop deployment. A failed post-deployment health check fails the build; a reviewed Git revert provides a new release when rollback is needed. Production health does not call Gemini or establish a complete user journey.

## Private configuration

Account/project values, connection paths, domains, private variables, credentials, plans and state stay outside this checkout. [Runtime metadata](../infra/runtime/README.md#trigger-contract) describes the allowed build substitutions. Base64 encoding is not encryption; credentials and SDK payloads must never enter trigger metadata.

| Setting | Production contract |
| --- | --- |
| `FIREBASE_PROJECT_ID` | The same explicitly configured project as the backend |
| `FIREBASE_WEB_CONFIG` | Public SDK fields injected from the active Secret Manager secret by numeric version; includes `authMode: "google"` |
| Optional SDK `appNamespace` | Stable lowercase name, at most 32 characters; preserve it across releases so browser sessions use the same Firebase app identity |
| `NEXT_PUBLIC_API_URL` | Empty for same-origin API calls |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | `false` |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | `true` |
| `APP_MAINTENANCE` | `false` during normal operation; when enabled, health remains available and application routes return retryable maintenance responses |
| Event delivery | Enabled with its dedicated identity and exact discovered OIDC audience, including `/internal/firestore` when configured on the managed subscription |

The gateway preserves the authenticated Eventarc request body and required CloudEvent headers. The API reads authoritative saved jobs, enqueues named tasks and validates worker authentication independently. See the [event delivery contract](event-delivery.md).

Firebase SDK fields are browser-visible configuration. Gemini uses the runtime's own Vertex identity; model credentials and service-account credentials never reach the browser.

## Verification

Local fixture, emulator, Rules and browser tools remain available through `npm run test:isolated` and `npm run verify:v1`. Connected development is an explicit local mode with private configuration and real Google sign-in. Production model journeys require a separately bounded scope; routine health checks are read-only and make no model calls.

Record source checks, cloud plans, exact deployed Git SHA/image/revision and user-visible checks separately in [verification.md](verification.md). Existing complete home-to-agreement evidence is retained in [V1 verification](v1-verification.md).
