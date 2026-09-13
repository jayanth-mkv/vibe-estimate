# VibeEstimate infrastructure inventory

The original local setup created no cloud resources. Live Gemini setup and the later authorized production deployment took place on 5 September 2026. The sections below retain those separate historical stages. Public documentation omits personal account names, real project IDs, connection paths, and credentials; exact operational records and Terraform state remain in the outer private workspace.

## Firebase consolidation preparation — 13 September 2026

The operator selected migration into the existing application project and retirement of the old Firebase project after verification. This supersedes the unapplied source-billing proposal below. Exact identifiers and private backups remain outside the checkout.

| Classification | Resource or operation | Executed status |
| --- | --- | --- |
| Existing, imported | Destination Firebase membership, Firebaserules API and IAM Credentials API | Adopted in the private `firebase-migration` state; preserved |
| Created | Destination Firestore API activation | Reviewed bootstrap applied; subsequent database inventory was empty |
| Created | Native default Firestore database, web app, Auth, deny-all ruleset/release, two narrow custom roles, scoped runtime bindings, separate SDK secret metadata/accessor and self-only signing binding | Foundation apply added 13 resources, changed/deleted none; readback passed |
| Verified empty | Destination Auth, Firestore and SDK secret | Zero users, root collections and secret versions after foundation apply |
| Private backup | Source Auth and recursive Firestore export | 87 accounts and 131 documents captured with content hashes; source unchanged |
| Prepared locally | Destination browser SDK configuration | Four public SDK fields plus permanent migrated app namespace; no secret version published |
| Planned | Destination Google provider, final data copy, direct Eventarc trigger and runtime cutover | Google OAuth setup and production gates remain pending |
| Planned removal | Source Firebase project and obsolete recovery schedule | Only after production verification and returning-guest access decision; neither removed nor paused |

The new database is protected against deletion, Auth anonymous auto-deletion is disabled, rules deny direct client access, and custom roles contain only Auth user-read or service-account signBlob respectively. No source billing account was attached. Shared ADC fingerprints matched across authenticated operations. See [consolidation controls and retirement gates](firebase-consolidation.md).

The saved direct-event plan proposes **6 creates, 0 updates and 0 deletes**: two Eventarc APIs, a dedicated event identity, event-receive permission, invocation permission on the one existing service, and the document-created trigger. The existing destination Pub/Sub API was imported without change. This plan is not applied. Event delivery awaits the route-capable release and final-copy sequencing; the managed subscription's actual OIDC audience still needs readback.

## Event-driven review delivery — 12 September 2026

The operator requested replacing the once-per-minute room-recovery calls with delivery triggered by saved work. The existing Firebase and application project assignments remain intact. See the [delivery contract and threat controls](event-delivery.md).

| Classification | Resources and intended action | Status |
| --- | --- | --- |
| Existing, discovered | Cloud Run service, review queue, recovery scheduler, Firestore database and private state bucket | Preserved; current scheduler remains enabled until cutover |
| Existing, imported | Pub/Sub API in the Firebase project | Imported into the event root; API configuration unchanged |
| Created | Eventarc and Eventarc Publishing API activation in the Firebase project | Enabled through the reviewed Terraform bootstrap apply |
| Planned, blocked | Workflows and Workflow Executions API activation in the Firebase project | Google rejected activation because this project has no billing account; these APIs were not enabled |
| Planned additions | Document-created trigger, short dispatcher workflow, two dedicated identities and scoped invocation/event-receive IAM | Owned by new `infra/events`, private GCS state prefix `events`; discovery follows API activation |
| Planned changes | Compatible backend/gateway release and event identity configuration; pause the existing scheduler after real event verification | Runtime release through native GitHub delivery; scheduler through `infra/production` |

The bootstrap apply partially completed: two API activations succeeded and two were rejected. No trigger, workflow, event identity or invocation grant was created. The application revision and recovery scheduler remain unchanged. Private state and apply diagnostics record this partial result, and shared ADC fingerprints matched.

The operator subsequently requested investigating consolidation into the application project. That migration is being assessed separately; no users or documents have been moved. The prepared workflow carries event routing metadata, while the authenticated API retains ownership, task creation and model work.

### Billing proposal and consolidation assessment

Read-only discovery confirmed that the application project already has Firebase enabled, but no initialized Auth configuration or web app. A safe consolidation needs a destination Google sign-in configuration and transfer of existing guest sessions, in addition to preserving nested documents and revisions. See the [migration assessment](firebase-consolidation.md). No data export or migration was performed.

As the smaller alternative, `infra/firebase-billing` manages only the source project's billing information. Its existing unbilled state was imported into the private GCS `firebase-billing` prefix. A saved plan proposes **one in-place billing-link update, zero resource creates/deletes/replacements, and no budget change**, using the already-open billing account attached to the application project. Read-only permission checks confirmed both required billing-assignment permissions. This is a proposal: billing remains disabled on the Firebase source and the plan has not been applied. Seven offline mock tests passed, and shared ADC fingerprints matched.

The event launcher now checks source billing immediately before any apply, preventing another partial bootstrap when billing is disabled or cannot be verified. Eight launcher boundary tests passed. Planning and importing existing state remain available without enabling billing.

The foundation root now accepts a private, explicitly targeted scheduler-pause setting for the eventual cutover. It defaults to the current active schedule; no pause setting was written for production. Eleven foundation mock checks and five launcher checks passed, including preservation of the existing scheduler endpoint and OIDC identity when paused.

## Cost guardrail — 6 September 2026

The operator authorized a monthly spending allocation for the backend project. Read-only discovery first established the facts: the project is linked to an open billing account whose currency is **INR**, the Cloud Billing Budget API had never been enabled on the project, and a permission test confirmed budget create/read/update rights. Because the API was disabled, no budget could previously have been created through it.

| Component | Executed action | Ownership |
| --- | --- | --- |
| Cloud Billing Budget API | Enabled on the backend project through Terraform; `disable_on_destroy = false` | `infra/guardrails` |
| Monthly project budget | Created through Terraform: whole-currency allocation, `MONTH` calendar period, filtered to the single project number, all credits included | `infra/guardrails` |

The reviewed plan was **2 to add, 0 to change, 0 to destroy**, and the post-apply plan is clean. An independent REST readback confirms exactly one budget on the account, scoped to `projects/<backend number>`, with four actual-spend thresholds (50%, 75%, 90%, 100%) and one forecast threshold at 100%. No `all_updates_rule` was set, so alerts reach the billing account's administrators and users by email without any new Pub/Sub topic, Monitoring channel or IAM grant. Terraform used an ephemeral token from the explicitly verified profile; shared ADC hashes matched before and after. State, plan and variables stayed in the operator's private directory.

**A budget alerts; it does not stop spend.** Nothing in this change caps, throttles or disables a service. The controls that actually bound cost are unchanged and remain owned elsewhere: the Cloud Run template in `infra/runtime` (maximum 2 instances, 8 concurrent requests per instance, 2 vCPU / 1 GiB, 120-second request timeout, scale to zero when idle) and the backend's own bounded call limits. No quota override, billing-disable automation, budget notification channel or application change was requested or made.

## Native GitHub delivery — 6 September 2026

The operator authorized Terraform-managed GitHub `main` delivery. Discovery verified the existing Google GitHub connection was installed, with no repository children or build triggers. Its OAuth secret and installation remain unchanged.

| Component | Executed action | Ownership |
| --- | --- | --- |
| Existing Google GitHub connection | Discovered installed; retained without modification | Operator's existing connection |
| Cloud Build repository child and `main` trigger | Created through Terraform; exact `^main$` push filter, root `cloudbuild.yaml`, existing build identity | `infra/delivery` |
| Runtime state bucket | Created private, uniform, versioned and protected against deletion; no expiration rule | `infra/delivery` |
| Release IAM | Two custom roles and four bindings created: service-only get/update, operation polling/API use, runtime identity act-as, bucket-only state objects | `infra/delivery` |
| Existing Cloud Run service | Imported into shared GCS state; forgotten from the old state with `destroy=false` | `infra/runtime` |
| Existing IAM, queue, scheduler, APIs, SDK secret and Firebase authorized domains | Preserved in the original production state | `infra/production` |

The delivery apply created **nine resources**, with no replacements or deletions. Runtime adoption preserved the exact container template, deployed image and effective labels. The old production apply performed only one state `forget`, after the service import succeeded. The separate state bucket does not use the build-source bucket's seven-day expiration policy. Application releases will apply only the imported Cloud Run service; the builder receives no secret-payload, Firebase administration, service-creation/deletion or IAM-administration permissions.

Exact targets, configuration, state backups, reviewed plans and discovery/apply records are retained outside the checkout under `../docs/private/`. Google credentials remained ephemeral and shared ADC hashes matched. The [deployment guide](deployment.md) documents the native release path. Push-trigger execution and public-host verification are recorded separately in [verification](verification.md).

## State consolidation — 6 September 2026

The legacy root Terraform stack was removed from the repository. It had never been applied: every provisioning flag was false and no state ever existed for it. It duplicated the identities, image repository and Cloud Build trigger that `infra/production` and `infra/delivery` already own, and its trigger would have supplied incomplete substitutions to the same `cloudbuild.yaml`.

`infra/production` and `infra/delivery` now declare the shared private, versioned GCS backend under the `production` and `delivery` prefixes, matching `infra/runtime`. Both states were migrated on 6 September 2026 with `-migrate-state`, which copies rather than deletes: the pre-migration files remain private at serial 30 with 22 resource blocks and serial 10 with 9. After migration `production` lists 26 instance addresses — its 22 blocks include two `for_each` blocks expanding to three each — and `delivery` lists 9. **Both roots then planned with no changes**, confirming the move altered no infrastructure. Shared ADC hashes matched before and after.

Every Terraform root now carries a mock-provider suite: production 10, runtime 10, guardrails 7, gemini-local 6, delivery 3 and firebase-adoption 2, run together by `npm run check:infra` and by the pull-request workflow. Because a push to main applies Terraform, these checks now gate merges.

## Production audit: observed, no resource changes

On 5 September 2026 a named-profile, read-only Cloud Run API check confirmed that the existing service is ready, sends 100% of traffic to its latest revision, selects `gemini-3.7-flash`, and has the required `dev-tutorial=cloud-run-ai-challenge` label. The deployed image digest is `sha256:537163883e4db76eab8e16c341b0301c4dc2e6990a27e4d9871e5d146a9d4f43`. Full service metadata is retained as `../docs/private/production-audit-service.json`. Shared ADC hashes matched before/after this read.

The [production journey audit](verification.md#production-journey-audit--5-september-2026) created synthetic guest accounts and application documents through the app, with seven bounded Vertex calls. It created, imported, updated and deleted **zero infrastructure resources**. The retry/concurrency source fixes are separate from the image verified here; no new image rollout is claimed by this checkpoint.

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

Shared ADC is preserved, checked by SHA256 before/after each authenticated operation. Terraform uses an ephemeral token from the explicitly verified profile, with the authorized project as quota project. The private state, saved plans, plan-context manifest and credential JSON stay outside the checkout. No Firebase, Cloud Build or Cloud Run configuration is changed by this isolated root.

The subsequent Cloud-credit recheck added the optional Vertex API through a reviewed **1 add, 0 change, 0 destroy** plan. The root now manages **six resources** (four API services, one service account, one bound key), and the full post-apply plan is clean. Six mock Terraform tests and the updated saved-plan opt-in guards passed. The private `enableVertexAi` boolean is persisted and bound into saved plans. Existing Gemini key restrictions and service-account roles were not broadened; local Vertex calls use the authorized user's existing prediction/service-use permissions and short-lived OAuth tokens. One real `gemini-3.6-flash` structured-response smoke check and both complete desktop/mobile application journeys succeeded through Vertex's global endpoint. The browser run made four real review calls and left shared ADC unchanged; see [verification.md](verification.md).

## Existing and observed

### Gemini 3.7 configuration update

The requested `gemini-3.7-flash` was confirmed in the authorized Vertex model catalog and passed a structured-response smoke check, desktop/mobile application journeys and a two-person room journey. This changes only the private local model setting and request compatibility in the application. Shared rooms use the same local Firebase emulators and existing backend transport. No new cloud resources, IAM grants, keys, Terraform changes, billing purchases or deployment were required. The six-resource inventory above remains unchanged; full browser evidence is tracked in [verification.md](verification.md).

| Component | Evidence | State in this setup |
|---|---|---|
| Backend GCP project | Named profile/project and compute region verified by the parent setup process | Existing; not imported or modified |
| Firebase project and web app | Explicitly authorized separate Firebase project; one existing web app and matching SDK configuration discovered | Existing, unchanged; private identifiers and SDK configuration retained outside the checkout |
| Firestore database | Existing native Standard `(default)` database; actual location and settings recorded privately | User-created; no replacement, import or settings change by this work |
| Firebase Authentication | Read-only verification confirms Anonymous, Email/Password and Google enabled after the operator enabled them | Existing/user-configured; no agent-created provider, OAuth client or Terraform Auth change |
| Firebase authorized domains | Existing list includes localhost, which the connected launcher uses | Existing, unchanged; hosted origins remain a deployment task |
| Firestore rules | Existing release denies all client reads and writes | Existing, unchanged; backend uses explicit privileged authentication and enforces ownership |
| Firebase project billing | Verified disabled; existing initialized Auth and default database can be used for this connection | No billing link or upgrade performed |
| Cloud Build connection | User supplied an existing regional GitHub connection | Existing according to user; full repository child and trigger inventory not yet verified |
| Backend project billing | Cloud Billing readback reports enabled; Developer API reports depleted prepaid balance; Vertex generation succeeds | No billing account changes or prepaid purchases; individual credit deductions have not been reconciled against a billing report |
| Local emulators | Separate `demo-` project configured in application setup | Local test resources only, not the production Firebase project |

Backend region, Cloud Build connection region and Firestore location are separate values. Use the verified backend region from private configuration. Discover Firestore's existing location; never infer it from either compute region.

### Connected Firebase development

The user explicitly requested using the existing database after the emulator-only Gemini checkpoint. Discovery verified the authorized profile's existing Firestore data permissions and Firebase Auth read permissions. The operator initialized the auth providers themselves. The connected application therefore needs **zero new cloud resources, imports, IAM grants, API enables, provider changes, rules changes or billing upgrades**. The six Gemini Terraform resources remain the only resources created by this work. Synthetic test users and documents created through the application are application data, not infrastructure provisioning. Any future management of the existing database, providers or rules must first adopt them through Terraform.

An initial auth discovery query returned an unnecessary password-hashing parameter in tool output. The query was restricted immediately to explicit provider flags, the private metadata record was replaced with sanitized fields, and no such parameter was written to repository files. Subsequent discovery prints only safe configuration flags and counts.

Connected verification subsequently passed with real guest identities, two live Vertex observations, code joining, two private proposal revisions and two explicitly shared copies. The exact synthetic room and related project/membership records matched across an app restart. Firebase Admin requires an explicit Firebase quota-project header with the custom short-lived OAuth credential; this was fixed in application initialization, without changing any cloud resource or shared ADC. Actual Google consent and hosted-domain checks remain separate from provider enablement.

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

No separate frontend host, state bucket, load balancer, custom domain, Redis, Cloud SQL, VPC connector, document bucket, BigQuery dataset, or ADK infrastructure is created by these definitions. Cloud Run serves the frontend and the API from one image.

## Spatial studio proposals: research only

The [spatial plan](spatial-home-studio-plan.md) and the [release plan](plan/README.md) propose the following additions. None is discovered as existing, imported, configured in Terraform, provisioned or deployed by this planning stage. Keep these proposals separate from the prepared definitions and six managed Gemini resources above, and from the separately recorded initial production release below.

| Proposed resource | Intended boundary | Status |
| --- | --- | --- |
| Private plan/scene object bucket | Authorized backend/Vertex project; uniform access and public-access prevention; explicit retention and scoped object permissions | Planned for connected uploads. Discover/adopt any suitable existing resource before creating through Terraform. |
| Object access IAM | Authorized development/runtime identity, limited to the selected bucket | Planned; no grant or key creation. The first upload path uses an authenticated backend proxy. |
| Worker queue and authenticated worker delivery | Backend project, deployment region selected from private configuration | Future deployed job processing only; local job worker needs no queue infrastructure. |
| Optional indexes for new scene/job queries | Existing Firebase database, only indexes proven necessary by implemented queries | Planned discovery/testing; no index or billing change. |
| Three agent Cloud Run services (`concierge`, `spatial`, `insight`) | Backend project, same verified region; separate scaling profiles and minimum instances | [v2](plan/v2.md) proposal. Each is an additional billable service; review minimum-instance settings before enabling any non-zero floor. |
| One service account per agent service | Backend project; no key files, no shared runtime identity | v2 proposal. Narrow inference and Firestore access only, following the existing runtime-identity pattern. |
| Service-to-service `run.invoker` bindings | Granted only along call edges that actually exist; no `allUsers` on any agent service | v2 proposal. ID-token audience is the callee URL; end-user identity travels separately in task metadata. |
| Additional Artifact Registry images | Existing private repository where possible | v2 proposal. Prefer additional images in the existing repository over new repositories; review retention. |
| Per-service Secret Manager access | Existing secrets; accessor bindings scoped per service account | v2 proposal. No new secret payload is implied; the browser SDK configuration secret remains what it is. |
| Extended Cloud Tasks queue use | The review queue and recovery scheduler already created for the initial production release | v2 proposal. Extend the deployed delivery path rather than adding Pub/Sub for the same shape of work. |
| Cloud Run worker pool | Only if a specific job justifies long-lived instances or GPU | v2/v3 proposal, deliberately conditional. Record the justification before creating it; worker pools bill differently from request-driven services. |
| BigQuery dataset for the rate-card MCP server | Backend project; the designer's own historical rates only | [v3](plan/v3.md) proposal. Storage and query charges apply. No dataset is created by any current definition. |
| Maps Platform API enablement | Sourcer local-availability lookups | v3 proposal. Maps requests bill per call and need their own budget guard. |
| GPU worker pool for image-to-3D | Backend project; explicit opt-in | v3 proposal. Substantially more expensive than every other resource listed here; not required by v2. |

Firebase Storage now requires the [Blaze plan](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). The proposal keeps existing Firebase Auth/Firestore and uses the already billed backend project for private binaries; it does not upgrade Firebase billing or claim storage is free. Existing APIs, credentials, shared ADC, database, rules and providers remain unchanged. Future resource work must use Terraform and record actual actions separately.

## Before a real release

1. Record existing resources and their exact IDs privately; import any matching Terraform-managed resource before applying. Stop on replacement/destroy plans.
2. Confirm Firebase sign-in providers, authorized domains, Firestore database/location, and rules release. Preserve existing configuration; review authentication changes separately.
3. Verify the intended Gemini model and key, then provision a Secret Manager version through the write-only Terraform path. Run a real Gemini test explicitly.
4. Confirm the Cloud Run origin is the frontend origin and appears in the Terraform-managed Firebase authorized domains.
5. Review one complete Terraform plan with private project mapping, import actions and estimated billing surfaces. Then use the reviewed plan for deployment when authorized.
6. Record created/imported resource IDs privately and update this status table with dates, image digest, tests, and teardown/retention decisions.

Cloud Run instance limits reduce capacity; they do not cap Gemini calls, Firestore operations, build minutes, or total spend. Trial credits and free tiers are eligibility/usage dependent. A billing budget alert is useful later but is not a spending limit. [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets), [Cloud Run scaling](https://cloud.google.com/run/docs/configuring/max-instances)

## Initial production release — 5 September 2026

User requested a running production version. Work is isolated on `fix/initial-production`; spatial planning remains separate. Values, state, plans and discovery records remain in the operator private directory. Shared ADC is checked unchanged around every operation.

**Planned:** enable the discovered-disabled Cloud Run, Cloud Tasks and Cloud Scheduler APIs through infra/production; then discover existing runtime resources before creation. Prepare a scale-to-zero Cloud Run app, a bounded review queue and recovery scheduler, dedicated runtime/build/delivery identities, narrow inference/Auth IAM and Firestore access, private image repository and build-source bucket, runtime browser SDK configuration in Secret Manager, and an imported authorized-domains-only Firebase patch. Existing Gemini-local resources and Firebase database/providers remain under their current management. No deployment or resource creation is claimed by this plan.

The first full plan was rejected by prevent_destroy: the REST provider would replace its imported wrapper when changing output sensitivity. No Firebase mutation occurred. Correct the import configuration and retain the deletion guard.

**Created/managed:** Terraform successfully enabled Cloud Run, Cloud Tasks and Cloud Scheduler (three API resources), using the reviewed bootstrap plan. The existing API ownership in the Gemini root is unchanged. Shared ADC hash was unchanged. Runtime resources and deployment remain pending the subsequent discovery and plan.

**Existing/imported:** Firebase authorized domains were imported using a GET restricted to `authorizedDomains`; Terraform added one planned Cloud Run domain with a PATCH restricted to that field. Existing domains, providers and database were preserved. No password-hashing configuration was retrieved. Inventory discovery returned no existing app service, image repository, named task queue, named scheduler job, build bucket or the two proposed custom roles.

**Created:** the reviewed second apply created 20 resources: image repository and writer binding; review queue; two narrow custom roles; six project IAM memberships; browser SDK configuration secret, write-only secret version and accessor binding; three dedicated service accounts and one act-as binding; private source bucket and reader binding. Along with the three API resources and imported domain configuration, this root manages 24 resources. The runtime keyless Vertex identity uses cloud billing; the browser SDK configuration secret is not evidence of a Gemini API-key integration. No app service or scheduler job has been deployed at this stage.

**Deployed:** Cloud Build successfully built the audited 83-file application archive and published its immutable image digest. A reviewed Terraform plan then created the Cloud Run application, its public invocation binding, and the authenticated once-per-minute recovery scheduler (27 total resources in this root). The public `/health` returned HTTP 200 with production Firebase, cloud Firestore and live Vertex configuration. Full public user journeys are the next verification gate. The original Developer API credential was rechecked without display and still returned HTTP 429 with the prepaid-balance category.
