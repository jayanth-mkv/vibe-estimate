# Challenge completion checklist

The local scaffold is preparation for the [Google challenge](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge), not proof that every requirement has been completed.

| Requirement | Evidence to retain |
| --- | --- |
| Configure AI Studio custom security instructions before the required build work | Genuine settings/build-history record; prepared text alone is insufficient |
| Firebase sign-in | Local emulator checks, then deployed real sign-in from the frontend domain |
| Meaningful multi-turn Gemini | Actual model response and context-dependent follow-up; fixture mode does not count |
| User-isolated Firestore | Deployed save/reload plus cross-account and unauthenticated denial |
| Secret Manager | Runtime secret binding and least-privilege access; no browser/server-key leakage |
| Cloud Run | Actual deployed backend URL and the required dev-tutorial=cloud-run-ai-challenge label |
| Original enhancement built through the required AI Studio workflow | Source-linked scope review, clarification, proposal revision, and authentic build evidence |
| Public repository and README | Reproducible setup, limitations, test evidence, and sanitized source |
| Public demo/blog with required hashtag | Actual walkthrough and #AccelerateAIwithCloudRun |
| Dashboard submission | Confirmed submission before the deadline; description within 1,024 characters |

The supplied dashboard records 6 September 2026, 11:59 PM IST as the deadline. Recheck the dashboard before submitting.

The judging pillars are authenticity, usability, stability, and security. We should demonstrate a complete user task, understandable correction, recovery from failure, and enforced access control. Published point weights or a required two-minute video were not established.

The frontend is intended for Vercel and backend for Cloud Run. Provide a clear entry URL and architecture so reviewers can follow the actual Cloud Run-backed flow; both deployments still need verification.

Real multi-turn Gemini through Vertex passed desktop and mobile review, clarification, draft/revision, persistence and export checks. Firebase remains on local emulators. The original fixture demonstration must still be labeled, and the separate Developer API continues to report a prepaid-balance limitation. Local Vertex OAuth success does not establish the challenge's Secret Manager API-key runtime requirement or AI Studio enhancement/build history. Those evidence requirements and deployment remain outstanding. Do not claim users, savings or general AI accuracy from this synthetic test. See the [executed verification record](verification.md) and [AI Studio evidence audit](ai-studio-evidence.md).
