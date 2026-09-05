# Challenge completion checklist

Current status on 5 September 2026: **the implemented core journey works end to end; the submission is not yet complete.** Use the operator's supplied form and [official codelab](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) for the required fields. Planned spatial features are not needed to demonstrate the existing original enhancement.

The operator confirmed that this agent-assisted repository is the build history in place of a separate AI Studio app. Its instructions, commits, source and verification are the authentic evidence. The codelab permits a similar coding assistant for enhancements; no AI Studio UI session is claimed.

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Security instructions and original build history | [AGENTS.md](../AGENTS.md), source commits, [recovery controls](review-recovery.md) and executed results | Present in the operator-confirmed repository workflow |
| Firebase authentication | Real guest identities, verified backend tokens and private workspace ownership | Passed |
| Google SSO | Production handoff/cancellation passed from three entry points; completed consent, linking and returning access need the operator | Partial |
| Meaningful multi-turn Gemini | Real Gemini 3.7 Flash reviews and two-person observations, source quotations and context-dependent follow-ups | Passed |
| User-isolated Firestore | Production save/reload, immutable revisions/export and cross-account denial | Passed |
| Secret Manager Gemini API-key retrieval | Current Gemini runtime uses an attached Vertex identity. The Firebase web-config secret is not a Gemini credential | Not established; do not mark the form's API-key confirmation complete |
| Cloud Run and campaign label | Ready production service, verified image and required `dev-tutorial=cloud-run-ai-challenge` label | Passed |
| Original enhancement | Source-linked scope review, QR/code rooms, live observer, private drafts and explicit shared revisions | Implemented and tested |
| Public repository and README | Configured GitHub repository returned HTTP 200 and public metadata without authentication; setup, deployment, limitations and evidence are documented | Public accessibility passed |
| Latest recovery fixes and model resilience | Recovery/concurrency fixes passed local regression; their rollout is separate from the audited image. A bounded multi-model policy remains pending | Pending release work |
| Demo/social link | Working app and walkthrough exist; a post draft is prepared. An actual public demo post/write-up with `#AccelerateAIwithCloudRun` must be supplied | Pending publication |
| Submission form | An 854-character description and operator URLs are prepared outside the checkout | Draft prepared; not submitted |

The supplied form snapshot gives **6 September 2026, 11:59 PM IST** as the deadline and a **1,024-character** description limit. The authenticated dashboard was not rechecked. The current form explicitly asks for the live/walkthrough URL, public repository, demo/social URL and service confirmations. Do not check an unverified service merely to complete the form.

The [production audit](verification.md#production-journey-audit--5-september-2026) has passing results for all 15 distinct checks across targeted runs, with seven real model calls. The recovery checkpoint separately passed 28/28 emulator browser checks, 183 backend tests, 44 frontend tests, 34 configuration tests, three Rules checks and builds. These do not establish completed personal Google consent or final submission.

Use the [quick product checklist](quick-test-checklist.md), [build provenance and evidence](ai-studio-evidence.md), [production readiness](production-readiness.md) and [demo walkthrough](demo-walkthrough.md) as the review bundle. The supplied form and operational submission draft remain in the outer private workspace. No new Gemini request, full test rerun, public post or submission was made during this closeout.
