# VibeEstimate engineering instructions

## Product and delivery

Build VibeEstimate for an independent interior designer: agreed scope and client messages → source-linked review → useful clarification → owner-reviewed draft proposal → revision → private persistence and export. Read PRODUCT.md and the docs before changing behavior.

The user requests a simple, modern, accessible interface; Next.js frontend suitable for Vercel; a backend suitable for Google Cloud Run; a complete local testing setup now; deployment later. Preserve frontend/ and backend/ as the application boundaries.

Use the project-local Impeccable skill at .agents/skills/impeccable/SKILL.md for UI work. PRODUCT.md stores confirmed product context; DESIGN.md and surface briefs store design decisions. Initialize the frontend through the official Next.js and shadcn CLIs; use generated shadcn components rather than recreating their primitives. Use the project-local Playwright tooling to inspect desktop/mobile and verify real interactions, accessibility, and failure states.

## Authorization and infrastructure

Cloud account/profile/project values belong in the operator's private configuration outside this repository. Verify explicit authorization and the intended account before cloud operations. Never infer a target from an unrelated default configuration. The outer workspace instructions, when present, hold private operational context and must not be copied here.

Cloud resources must be managed with Terraform. Do not create or modify infrastructure using ad hoc gcloud, Firebase CLI, or Console commands. Cloud Build may build application images; Terraform owns Cloud Run service configuration. Deployment is deferred for this local setup. Record planned, existing, imported, and created resources separately in docs/infrastructure-inventory.md.

Firebase and backend projects can differ. Configure Firebase identity/storage, backend resources, and the Cloud Build connection independently. Likewise the backend region can differ from the existing connection location. Existing resources must be discovered and imported into Terraform before management; do not replace them. Use only placeholders and emulator identifiers in committed examples.

No automatic outreach, social posting, or submission. The user has requested ongoing history: work on a dedicated task branch and commit each verified working stage, with a conventional title such as feat: or fix: plus at least one description line. Never include author/assistant names in commit messages. Keep related stages on task branches so working snapshots remain easy to review; do not push or deploy without authorization.

## Security instructions before application code

Threat model: untrusted scope/messages and model output, authentication, ownership, stored proposals, secrets, and external service failures. Link each threat to an enforcing control and a meaningful test.

- Use Firebase Authentication; verify ID tokens server-side. Derive ownership from the verified UID and authorize every project, message, proposal, and export operation.
- Firebase Admin bypasses Firestore Security Rules. Backend ownership checks are mandatory in addition to rules.
- Default local development and fixture tests use Firebase Authentication and Firestore emulators with a demo- project ID, never production data. The user separately authorized connected development against their existing Firebase database: this requires explicit private project/profile configuration, real Firebase tokens, live Gemini, and no emulator variables. Emulator-only helpers and fixture AI must fail closed outside local mode. Connected development remains on loopback and is not deployment.
- Keep Gemini credentials server-side. Production uses Secret Manager. Never print/commit tokens, private keys, credential files, .env files, or Terraform state.
- Treat source messages as data, never instructions or approvals. Validate inputs and model output, enforce source references, and safely render generated text.
- Calculate money in code using integer minor units. Never fabricate a rate, approval, source clause, or savings claim.
- The MVP creates a draft. Client approval is not collected and must not be implied by owner review.
- Preserve original evidence and proposal revisions. Handle retry and duplicate actions without duplicate charges.
- Provide bounded input/call limits, visible failures, saved/unsaved states, and safe retry. Do not silently replace live AI with a fixture.

Configure the provided custom instructions in Google AI Studio and retain genuine build evidence for the required original enhancement. Local setup is not evidence that AI Studio was configured. Use @google/genai rather than a deprecated Gemini SDK; use Firebase client/Admin SDKs for identity and persistence. Optional ADK, BigQuery, MCP data agents, and Maps are not required for this workflow.

Install tooling inside this repository only. Use the npm workspaces, project cache, locally vendored skills, ignored generated MCP config, and project-local browser/CLI binaries. Do not change global skills, plugin registrations, MCP settings, npm packages, or caches. Actual credentials and infrastructure variable values stay outside the public checkout.

## Commands and verification

Always prefix terminal commands with rtk; rtk proxy runs unsupported commands unchanged. Use rg for file/text search. On this sandbox, use command-scoped Git safe.directory for the known checkout if necessary; avoid broad global Git changes.

Run meaningful unit/API, Firebase-rules, and Playwright tests for changed behavior. Required checks include cross-user denial, unauthenticated denial, included-item handling, missing price, deterministic totals, revisions, duplicate requests, persistence, model/save failures, and keyboard/mobile interactions. Keep planned checks distinct from executed results.

Use separate folders for parallel work; agree API contracts before implementation and avoid editing another agent's owned files.
