# Infrastructure inventory

Current application topology: one project for Firebase Authentication, Firestore, Eventarc, Cloud Tasks, Vertex access and the Cloud Run application. Next.js and Express share one service. Identifiers, account details, state snapshots, plans and cloud readbacks remain in the operator's private directory.

## Managed resources

| Root | Current ownership | Verified state |
| --- | --- | --- |
| `infra/production` | Three application APIs, image repository, build-source bucket, runtime/build/task identities, inference/queue/build IAM, custom roles, queue, paused scheduler and public service invocation | 18 resource instances |
| `infra/firebase` | Firebase foundation, Google-only Auth, protected default database, rules, runtime data/Auth grants, active SDK secret, event APIs/identity/permissions and document-created trigger | 24 resource instances |
| `infra/delivery` | Repository child, trusted-main trigger, private state bucket and release IAM | 9 resource instances |
| `infra/runtime` | Existing Cloud Run service and complete template | 1 resource instance |
| `infra/gemini-local` | Four API services, restricted local Gemini identity and authorization key | 6 resources in separate private local state |
| `infra/guardrails` | Budget API and project-scoped monthly budget | Separate private local state |

The production and Firebase states were read back on 14 September 2026. Both preserve the current runtime, active SDK configuration and data resources. The database and Firebase foundation have destruction guards. The recovery scheduler is paused; Firestore-created jobs drive authenticated Eventarc and Cloud Tasks delivery.

## Existing and imported

The application project and its regional GitHub connection existed before Terraform management. The repository child uses that connection without replacing it. Firebase membership and existing prerequisite APIs were imported before management. The Cloud Run service is adopted into its runtime state; no other root owns it. The custom-domain mapping is an existing application endpoint.

Existing resources are always discovered before an import. Preserve the database location, resource IDs, SDK app identity, numeric secret version and private state prefixes. State history and private backups remain retained.

## Created and managed

Terraform manages the application identities and their scoped IAM, registry, build-source storage, task queue, recovery scheduler, Firebase web app/Auth/database/rules, SDK secret, direct event trigger, native build trigger and protected state storage. Their current configuration lives in the six roots above. Application releases change only the existing runtime service.

Runtime Firestore access bypasses client rules, so backend ownership checks remain mandatory. Event and task delivery use distinct identities and audiences. The build identity has release permissions without direct Firebase administration, inference or secret-payload access. Shared operator ADC is preserved during authenticated operator workflows.

## Operational checks

- Google sign-in is enabled; anonymous, password and phone sign-up are disabled.
- Direct browser Firestore access is denied; saved projects and room membership are authorized by the backend.
- Eventarc selects only created room-review outbox documents in the default database.
- The bounded review queue handles retries; normal operation has no recurring reconciliation requests.
- Cloud Run scales to zero and serves both application boundaries.
- Native builds verify source checks, immutable image, service-only Terraform plan and deployed Git SHA.
- The state bucket is private, versioned and protected, with no expiring-object lifecycle.

Executed tests, data checks and release evidence belong in [verification.md](verification.md). Budgets and instance limits are operational controls, not a hard ceiling on total cloud spending.

## Planned resources

The [release plan](plan/README.md) keeps future infrastructure separate from current ownership.

| Proposed resource | Intended release | Status |
| --- | --- | --- |
| Private scene/source object storage and scoped object IAM | When connected uploads require it | Planned; discover suitable existing storage first |
| Additional Firestore indexes | When implemented queries require them | Planned; no speculative indexes |
| Concierge, spatial and insight Cloud Run services, dedicated identities and service invocation bindings | v2 | Planned; existing API remains the authority for identity, ownership and money |
| Additional agent images and per-service secret access | v2 | Planned; reuse the existing registry where appropriate |
| BigQuery rate-card dataset and MCP service | v3 | Planned |
| Maps API access | v3 | Planned |
| Optional GPU worker pool for image-to-3D | v3, explicit opt-in | Planned; not required by the current application |

No current definition creates a separate frontend host, BigQuery dataset, Maps integration or GPU worker pool.
