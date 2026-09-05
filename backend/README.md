# Backend foundation

Express 5 and TypeScript API for a single owner reviewing a scope and creating draft proposals. Authentication uses Firebase ID token verification; storage uses the Firebase Admin SDK and Firestore. Every operation derives the owner from the verified token and checks ownership. Direct client Firestore access is unnecessary.

The repository root manages installation, local environment loading, Firebase emulators, and end-to-end tests. Run the documented root setup first. Backend-only commands are `rtk npm run typecheck --workspace @vibeestimate/backend`, `rtk npm run test --workspace @vibeestimate/backend`, and `rtk npm run build --workspace @vibeestimate/backend`.

## Local and live modes

Local mode requires a `demo-` project, loopback Auth/Firestore emulators, and `APP_ENV=local`. It defaults to the **fixture provider**, a deterministic response for the exact synthetic lighting example in `src/fixtures.ts`. Whitespace differences are accepted; arbitrary source text and arbitrary follow-ups are rejected. Fixture mode is not Gemini and does not prove the hackathon AI requirement.

For real local Gemini testing, keep the emulator configuration and set `AI_PROVIDER=gemini`, a server-only `GEMINI_API_KEY`, and an explicitly chosen currently available `GEMINI_MODEL` in private local configuration outside the repository. The adapter uses `@google/genai`, structured JSON output, persisted multi-turn context, a 30-second upstream timeout, and exact source quote checks. Live Gemini integration requires credentials and is tested separately; there is no automatic fixture fallback.

Production requires `NODE_ENV=production`, `APP_ENV=production`, `AI_PROVIDER=gemini`, a real `FIREBASE_PROJECT_ID`, exact HTTPS `FRONTEND_ORIGIN`, explicit Gemini model and key, and no emulator environment variables. Cloud Run injects the key from Secret Manager; Terraform manages that setup. Local mode cannot start on Cloud Run. No credential files are needed in the container.

## Data and safety boundaries

- Firestore paths are `users/{verifiedUid}/projects/{projectId}`. Admin bypasses security rules, so all reads and writes additionally verify stored ownership.
- Source scope and messages are immutable in this foundation. Clarifications append separate conversation turns. A maximum of ten reviews bounds the context.
- Draft quantities and prices are owner supplied. Money uses integer paise, bounded quantities, and safe integer checks. The application does not infer tax treatment, customer approval, or payment owed.
- Each proposal retains its own owner-reviewed description, quantity, price, total, timestamp, and ID. A new revision supersedes the earlier one. Retrying a request UUID is idempotent; reusing it with different values returns a conflict.
- A new AI review supersedes any current draft. A fresh owner-reviewed draft is required before export. Concurrent changes cause a conflict rather than overwriting a newer project.
- Authenticated requests are limited per user, with a stricter analysis limit. These in-memory limits are per running instance, not a distributed production cost cap. Cloud quotas and production abuse controls remain deployment work.
- Source quote validation proves the quoted substring exists; it cannot prove the AI's interpretation is correct. The interface must keep owner review and original evidence visible.
- Input size and record growth are bounded. Project lists return the most recently updated 100 records. Pagination, deletion, editable source versions, multiple proposal line items, customer signatures, and tax support are outside this setup.

## Verification

`tests/domain.test.ts` checks configuration failures, included-item handling, unsupported fixtures, conversation history, fabricated evidence rejection, amount validation, idempotency, and revisions. `tests/api.test.ts` checks protected routes, cross-user denial, save/reload/export, stale draft invalidation, and safe model/storage failures using explicitly injected test doubles. Root tests exercise the real Firebase emulators and browser. These layers must be reported separately from a live Gemini or cloud deployment test.

## Official references

- [Google Gen AI SDK](https://github.com/googleapis/js-genai)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Firebase Admin ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
