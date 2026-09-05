# AI Studio and challenge evidence

Reviewed on 5 September 2026 against the [official challenge](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) and the operator's supplied submission instructions. A local Gemini API request is evidence of model integration. It does not establish that AI Studio was configured or used to build the enhancement.

The genuine Vertex run now verifies two-turn Gemini reviews and the resulting draft/revision, persistence and export flow on desktop and mobile, using `gemini-3.6-flash` with local Firebase emulators. Its timestamped report is linked in [verification.md](verification.md). This satisfies the local model-integration check only; the OAuth transport does not demonstrate the codelab's deployed Secret Manager API-key integration or original AI Studio build workflow.

## Still required

| Evidence | What to retain | Verified now? |
| --- | --- | --- |
| AI Studio custom instructions | A genuine settings record showing the security instructions, app identity, and date before the relevant build | No settings or build-history evidence available in this checkout |
| Original enhancement through AI Studio | Actual prompt, response/build history, resulting source change, and before/after walkthrough for source review, clarification, or revisions | The app implements these features; AI Studio authorship is not established |
| Live Firebase and Firestore | Federated sign-in from the deployed frontend, reload, and cross-user denial with production configuration | Deferred; current verification uses emulators |
| Secret Manager runtime use | Terraform-managed Gemini API-key secret version, narrow runtime access, and working injection into the deployed backend | Deferred; local Vertex OAuth and private JSON are not this evidence |
| Cloud Run | Verified deployed service, image digest, health/task checks, and `dev-tutorial=cloud-run-ai-challenge` | Deferred |
| Submission assets | Public source, working URL or genuine walkthrough, social/demo link, and required hashtag | No publication or submission performed |

The supplied dashboard snapshot gives **6 September 2026, 11:59 PM IST** as the deadline and a 1,024-character description limit. These are supplied snapshot values, not a fresh authenticated dashboard check. Confirm them before submitting. A walkthrough can document a deployment that is subsequently stopped; it does not remove the need to verify the deployed application.

## Preserve an authentic record

Keep the AI Studio app/build identifier, timestamp, instruction screenshot, enhancement prompt and resulting diff in private evidence until redacted. Exclude API keys, credentials, account details, token-bearing network requests, and customer data. Record what was actually done; do not backdate configuration or represent this local build as an AI Studio build.

The current codelab additionally describes recoverable-error model fallback. This application currently selects one explicit verified model and returns a visible retryable failure without fixture fallback. A tested bounded multi-model policy remains a release-readiness item if following those current directives in full. Do not silently switch to fixture output or claim that fallback was tested.

## Security controls to demonstrate

| Threat | Enforcing control | Verification |
| --- | --- | --- |
| Forged identity or another owner's project | Server-verified Firebase tokens, UID-derived paths, stored ownership check | Backend/API and emulator journeys |
| Direct client access bypassing the backend | Deny-all client Firestore rules | Firebase Rules tests |
| Source/model prompt injection and fabricated evidence | Separate system instructions, structured validation, exact original quote checks, escaped rendering | Domain/API tests; source references checked in live journey |
| Invented prices, duplicate saves, overwritten revisions | Owner-entered integer paise, request IDs, transactional append and preserved versions | Domain/API and live draft/revision journey |
| Credential or production-data leakage in local mode | External private configuration, backend-only model authentication, explicit profile/OAuth client, demo project and loopback emulators | Local/Windows path and environment guards, ADC hash checks and public-file scan |
| Model outage or ambiguous save result | Bounded upstream call, visible failure, unchanged saved state, safe save replay | Backend failure tests and browser failure journeys |

Use the execution status in [verification.md](verification.md) to distinguish live results, fixture results, and remaining evidence.
