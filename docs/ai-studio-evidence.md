# AI Studio and challenge evidence

Reviewed on 5 September 2026 against the [official challenge](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) and the operator's supplied submission instructions. A local Gemini API request is evidence of model integration. It does not establish that AI Studio was configured or used to build the enhancement.

Genuine Vertex runs now verify two-turn Gemini reviews and the resulting draft/revision, persistence and export flow on desktop and mobile, using `gemini-3.7-flash` with local Firebase emulators. A separate live two-person room journey verifies two observations, independent client/designer identities, private draft preparation and immutable shared revisions. The reports and fixed desktop accessibility failure are recorded in [verification.md](verification.md). This satisfies the local model-integration check only; the OAuth transport does not demonstrate the codelab's deployed Secret Manager API-key integration or original AI Studio build workflow.

The later connected journey also passed against **real Firebase Authentication and the existing Firestore database**, including QR/code joining, two genuine Gemini observations, private draft/revision sharing, reload/export and client denial. Four cloud record fingerprints matched across a complete app restart. Google sign-in pages were reached from home and client recovery, and cancellation preserved existing guest identities. Completed personal Google consent/sign-in remains unverified.

## Still required

The later production audit now verifies the deployed Cloud Run service, required campaign label, real Firebase storage/authentication, all 15 distinct browser checks and seven bounded Vertex calls. Three production Google handoff/cancellation paths retain guest identity; completed personal account consent is still unverified. See the current [production results](verification.md#production-journey-audit--5-september-2026).

The [official codelab](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) was re-read on 5 September 2026. It permits extending the prototype with a similar agentic coding assistant, so the repository's authentic enhancement history is useful evidence. It still describes initial AI Studio instructions, Google sign-in, secret management, model fallback, a labeled Cloud Run deployment, source/deployment instructions and a public showcase. Repository history alone does not establish AI Studio settings or build history. No submission or outreach was performed.

| Evidence | What to retain | Verified now? |
| --- | --- | --- |
| AI Studio custom instructions | A genuine settings record showing the security instructions, app identity, and date before the relevant build | No settings or build-history evidence available in this checkout |
| Original enhancement through AI Studio | Actual prompt, response/build history, resulting source change, and before/after walkthrough for source review, clarification, or revisions | The app implements these features; AI Studio authorship is not established |
| Live Firebase and Firestore | Real identities, reload, cross-user denial and deployed frontend configuration | Production anonymous workflows, guest isolation, persistence/reload and exports passed; earlier connected restart evidence remains separate |
| Google SSO | Genuine Google consent/sign-in and retained ownership in the application | Providers enabled; home and client recovery reach Google and preserve guests on cancellation; completed personal consent/sign-in still pending |
| Secret Manager runtime use | Terraform-managed Gemini API-key secret version, narrow runtime access, and working injection into the deployed backend | Production uses an attached Vertex identity; the runtime Firebase web-config secret does not establish Gemini API-key retrieval evidence |
| Cloud Run | Verified deployed service, image digest, health/task checks, and `dev-tutorial=cloud-run-ai-challenge` | Passed: ready service, verified image, required label, 100% latest-revision traffic, live managed room observations and denial of ordinary user task invocation |
| Submission assets | Public source, working URL or genuine walkthrough, social/demo link, and required hashtag | No publication or submission performed |

The supplied dashboard snapshot gives **6 September 2026, 11:59 PM IST** as the deadline and a 1,024-character description limit. These are supplied snapshot values, not a fresh authenticated dashboard check. Confirm them before submitting. A walkthrough can document a deployment that is subsequently stopped; it does not remove the need to verify the deployed application.

The official codelab explicitly calls for Google Sign-In and single sign-on usability. The product therefore offers Google access alongside entry without a login wall; an anonymous identity still receives server ownership checks. Linking an anonymous Firebase user to Google preserves its UID and associated work, following [Firebase's anonymous-account guidance](https://firebase.google.com/docs/auth/web/anonymous-auth). The enabled Email/Password provider does not add a password form to the product.

## Preserve an authentic record

Keep the AI Studio app/build identifier, timestamp, instruction screenshot, enhancement prompt and resulting diff in private evidence until redacted. Exclude API keys, credentials, account details, token-bearing network requests, and customer data. Record what was actually done; do not backdate configuration or represent this local build as an AI Studio build.

The current codelab additionally describes recoverable-error model fallback. This application currently selects one explicit verified model and returns a visible retryable failure without fixture fallback. A tested bounded multi-model policy remains a release-readiness item if following those current directives in full. Do not silently switch to fixture output or claim that fallback was tested.

## Security controls to demonstrate

| Threat | Enforcing control | Verification |
| --- | --- | --- |
| Forged identity or another owner's project | Server-verified Firebase tokens, UID-derived paths, stored ownership check | Backend/API and emulator journeys |
| Forged room role, reused/expired invite or access to private draft controls | UID-derived membership, hashed expiring single-client invitations, strict request schemas and owner-only draft/observer actions | Room unit/API tests, Rules denial checks and independent-identity live room journey |
| Direct client access bypassing the backend | Deny-all client Firestore rules | Firebase Rules tests |
| Source/model prompt injection and fabricated evidence | Separate system instructions, structured validation, exact original quote checks, escaped rendering | Domain/API tests; source references checked in live journey |
| Invented prices, duplicate saves, overwritten revisions | Owner-entered integer paise, request IDs, transactional append and preserved versions | Domain/API and live draft/revision journey |
| Credential or production-data leakage in local mode | External private configuration, backend-only model authentication, explicit profile/OAuth client, demo project and loopback emulators | Local/Windows path and environment guards, ADC hash checks and public-file scan |
| Model outage or ambiguous save result | Bounded upstream call, visible failure, unchanged saved state, safe save replay | Backend failure tests and browser failure journeys |

Use the execution status in [verification.md](verification.md) to distinguish live results, fixture results, and remaining evidence.
