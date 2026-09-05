# VibeEstimate infrastructure inventory

The original local setup created no cloud resources. Live Gemini setup began on 5 September 2026 in the explicitly authorized backend project. Deployment remains deferred. Public documentation omits personal account names, real project IDs, connection paths, and credentials; exact operational records and Terraform state remain in the outer private workspace.

## Live Gemini setup

| Component | Discovery / action | Status |
| --- | --- | --- |
| Existing API keys | Authorized-project list returned none | No compatible existing credential to reuse or import |
| Existing Secret Manager | Only unrelated GitHub connection secret metadata found | Payload not accessed; resource unchanged |
| IAM and Service Usage APIs | Already enabled | Existing, unmanaged and unchanged |
| API Keys API | Enabled through isolated `infra/gemini-local/` Terraform root | Created/managed on 5 September 2026 |
| Generative Language API | Enabled through the same root | Created/managed on 5 September 2026 |
| Dedicated Gemini identity | New service account, no private-key file or broad role | Created/managed on 5 September 2026 |
| Cloud Resource Manager API | Google provider requires it to refresh API-service state | Created/managed through a reviewed Terraform bootstrap on 5 September 2026 |
| Gemini authorization key | Service-account-bound and restricted solely to Generative Language API | Created/managed through Terraform on 5 September 2026; metadata-only Terraform outputs |
| Vertex AI API | Discovery returned disabled; authorized user has prediction and service-use permissions | Created/managed through Terraform on 5 September 2026; reviewed plan/apply added exactly this API |
| Imports | No matching pre-existing Gemini resource found | None performed |

The first apply enabled two APIs and created the identity, then its post-create reads failed because Cloud Resource Manager was disabled. A reviewed one-resource Terraform bootstrap enabled that prerequisite. After verifying all three APIs were enabled, Terraform cleared the two failed-create state markers without disabling or replacing the APIs. A full refreshed plan then created only the remaining authorization key. That stage managed five resources: three API services, one service account and one bound key. No imports, replacements, or destroys were performed.

Shared ADC is preserved, checked by SHA256 before/after each authenticated operation. Terraform uses an ephemeral token from the explicitly verified profile, with the authorized project as quota project. The private state, saved plans, plan-context manifest and credential JSON stay outside the checkout. No Firebase, Cloud Build, Cloud Run, or Vercel configuration is changed by this isolated root.

The subsequent Cloud-credit recheck added the optional Vertex API through a reviewed **1 add, 0 change, 0 destroy** plan. The root now manages **six resources** (four API services, one service account, one bound key), and the full post-apply plan is clean. Six mock Terraform tests and the updated saved-plan opt-in guards passed. The private `enableVertexAi` boolean is persisted and bound into saved plans. Existing Gemini key restrictions and service-account roles were not broadened; local Vertex calls use the authorized user's existing prediction/service-use permissions and short-lived OAuth tokens. One real `gemini-3.6-flash` structured-response smoke check and both complete desktop/mobile application journeys succeeded through Vertex's global endpoint. The browser run made four real review calls and left shared ADC unchanged; see [verification.md](verification.md).

## Existing and observed

### Gemini 3.7 configuration update

The requested `gemini-3.7-flash` was confirmed in the authorized Vertex model catalog and passed a structured-response smoke check. This changes only the private local model setting and request compatibility in the application. No new cloud resources, IAM grants, keys, Terraform changes, billing purchases or deployment were required. The six-resource inventory above remains unchanged; full browser evidence is tracked in [verification.md](verification.md).

| Component | Evidence | State in this setup |
|---|---|---|
| Backend GCP project | Named profile/project and compute region verified by the parent setup process | Existing; not imported or modified |
| Firebase project and web app | Supplied web configuration and explicit user confirmation; deliberately distinct from backend project | Existing according to supplied configuration; auth providers, database and rules still require live discovery |
| Cloud Build connection | User supplied an existing regional GitHub connection | Existing according to user; full repository child and trigger inventory not yet verified |
| Billing | Cloud Billing readback reports enabled; Developer API reports depleted prepaid balance; Vertex generation succeeds | No billing account changes or prepaid purchases; individual credit deductions have not been reconciled against a billing report |
| Local emulators | Separate `demo-` project configured in application setup | Local test resources only, not the production Firebase project |

Backend region, Cloud Build connection region and Firestore location are separate values. Use the verified backend region from private configuration. Discover Firestore's existing location; never infer it from either compute region.

## Prepared Terraform resources

| Resource | Planned scope | Cost/control notes | Actual status |
|---|---|---|---|
| Required APIs | Explicit backend, Firebase and optional build project | APIs remain enabled on Terraform removal; API use may bill | Configuration only |
| Artifact Registry Docker repository | Backend project; one regional repository | Stored images and network transfer may bill; review old image retention after evaluation | Configuration only |
| Runtime service account | Backend project | No key files or broad editor role | Configuration only |
| Firestore IAM grant | Runtime account → Firebase project `roles/datastore.user` | Admin access bypasses rules; application must enforce every user/document ownership check | Configuration only |
| Gemini secret metadata | One backend-project Secret Manager secret | Replication/storage/access charges may apply; runtime receives access to this secret only | Configuration only |
| Optional Gemini secret version | Explicit opt-in with ephemeral variable and provider write-only argument | Payload omitted from Terraform state/plan; never commit an API key | Disabled |
| Cloud Run API service | Backend project, explicit verified region | 0 minimum instances; 1 maximum by default (allowed 2); 1 CPU, 512 MiB, request-based CPU allocation | Disabled; no URL |
| Cloud Run public transport IAM | Service-level `roles/run.invoker` for browser traffic | Application verifies Firebase ID tokens; health route is intentionally public; CORS is not authentication | Disabled |
| Build service account | Existing connection's project | Repository-scoped image writer + log writer; no deploy/admin/runtime-secret role | Disabled |
| Cloud Build trigger | Existing repository child, trusted branch, root `cloudbuild.yaml` | Build minutes and logs can bill. Even creation opt-in leaves trigger disabled by default | Disabled |
| Firebase core import | Existing project/database; separate adoption state | Import-or-fail declarations, prevent-destroy, exact existing database location | Disabled; no import executed |
| Firestore rules release | Import existing release and publish checked-in rules | Client SDK denied; authenticated backend authorizes all data operations | Disabled; no production rules changed |

No Vercel project, hosted frontend, state bucket, load balancer, custom domain, Redis, Cloud SQL, VPC connector, document bucket, BigQuery dataset, or ADK infrastructure is created by these definitions.

## Before a real release

1. Record existing resources and their exact IDs privately; import any matching Terraform-managed resource before applying. Stop on replacement/destroy plans.
2. Confirm Firebase sign-in providers, authorized domains, Firestore database/location, and rules release. Preserve existing configuration; review authentication changes separately.
3. Verify the intended Gemini model and key, then provision a Secret Manager version through the write-only Terraform path. Run a real Gemini test explicitly.
4. Set the actual frontend HTTPS origin. Vercel hosting and Auth authorized domains are pending a chosen deployment URL.
5. Review one complete Terraform plan with private project mapping, import actions and estimated billing surfaces. Then use the reviewed plan for deployment when authorized.
6. Record created/imported resource IDs privately and update this status table with dates, image digest, tests, and teardown/retention decisions.

Cloud Run instance limits reduce capacity; they do not cap Gemini calls, Firestore operations, build minutes, or total spend. Trial credits and free tiers are eligibility/usage dependent. A billing budget alert is useful later but is not a spending limit. [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets), [Cloud Run scaling](https://cloud.google.com/run/docs/configuring/max-instances)
