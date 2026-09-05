# Challenge completion checklist

The local scaffold is preparation for the [Google challenge](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge), not proof that every requirement has been completed.

| Requirement | Evidence to retain |
| --- | --- |
| Configure AI Studio custom security instructions before the required build work | Genuine settings/build-history record; prepared text alone is insufficient |
| Firebase sign-in and Google SSO | Guest access may remain available; retain genuine Google sign-in/consent and deployed-domain verification |
| Meaningful multi-turn Gemini | Actual model response and context-dependent follow-up; fixture mode does not count |
| User-isolated Firestore | Deployed save/reload plus cross-account and unauthenticated denial |
| Secret Manager | Runtime secret binding and least-privilege access; no browser/server-key leakage |
| Cloud Run | Actual deployed backend URL and the required dev-tutorial=cloud-run-ai-challenge label |
| Original enhancement built through the required AI Studio workflow | Source-linked scope review, clarification, proposal revision, and authentic build evidence |
| Public repository and README | Reproducible setup, limitations, test evidence, and sanitized source |
| Public demo/blog with required hashtag | Actual walkthrough and #AccelerateAIwithCloudRun |
| Dashboard submission | Confirmed submission before the deadline; description within 1,024 characters |

The supplied dashboard records 6 September 2026, 11:59 PM IST as the deadline. Recheck the dashboard before submitting.

The judging pillars are authenticity, usability, stability, and security. We should demonstrate a complete user task, understandable correction, recovery from failure, and enforced access control. The current codelab explicitly asks for Google Sign-In and SSO; the app implements optional Google linking and returning access alongside guest entry. Published point weights or a required two-minute video were not established.

The frontend is intended for Vercel and backend for Cloud Run. Provide a clear entry URL and architecture so reviewers can follow the actual Cloud Run-backed flow; both deployments still need verification.

Real multi-turn Gemini through Vertex passed desktop and mobile review, clarification, draft/revision, persistence and export checks with emulators. A later complete two-person journey passed using real Firebase guest identities and the existing Firestore database; cloud records survived an app restart. Home/client recovery reach Google sign-in and preserve guests when cancelled, while completed personal Google consent remains unverified. The fixture demonstration stays labeled, and the separate Developer API still reports a prepaid-balance limitation. Vertex OAuth success does not establish the deployed Secret Manager API-key requirement or AI Studio enhancement/build history. Those evidence requirements and deployment remain outstanding. Do not claim users, savings or general AI accuracy from this synthetic test. See the [executed verification record](verification.md) and [AI Studio evidence audit](ai-studio-evidence.md).
