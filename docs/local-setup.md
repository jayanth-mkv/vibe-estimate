# Local development and agent tools

The repository is an npm workspace with frontend/ and backend/. Use Node.js 22.17+ and the already installed Java 21 runtime for Firestore emulation.

## One local stack

Run npm ci, then npm run setup, then npm run dev from the repository root. The scripts bind services to 127.0.0.1 and refuse to overwrite a process already occupying one of the required ports.

| Service | Address | Behavior |
| --- | --- | --- |
| Next.js | http://127.0.0.1:3000 | Local workspace UI |
| Backend | http://127.0.0.1:8080 | Token-verified API |
| Auth emulator | 127.0.0.1:9099 | Local test accounts |
| Firestore emulator | 127.0.0.1:8085 | Local records |
| Emulator UI | http://127.0.0.1:4000 | Inspect local accounts/data |

The dev runner sets emulator endpoints and demo-vibeestimate explicitly and removes inherited live API keys/credential paths from its child environment. It imports the verified Auth/Firestore snapshot at `.cache/firebase/workspace` when present. Before stopping the complete stack or switching between fixture and Vertex, save the current local data:

```powershell
rtk proxy node scripts/local-emulator-state.mjs export
```

The helper exports only the running `demo-vibeestimate` Auth and Firestore emulators, verifies file hashes and unchanged account/project fingerprints, and keeps any previous snapshot under ignored `.cache/firebase/workspace-backups`. It prints counts, never account payloads or tokens. The next `rtk npm run dev` automatically restores that fixed snapshot; arbitrary import paths and linked export entries are rejected. Run `rtk proxy node scripts/local-emulator-state.mjs verify-restored` immediately after restart to compare the restored data. Changes made after the last export still require another export before shutdown; forced termination does not create a new checkpoint.

The deterministic fixture tests the interaction and calculation path without pretending to be live Gemini. Use the sample button for this mode. The real provider remains a separate opt-in using server configuration outside the repository; do not enter a server API key in a browser field.

To exercise real Gemini while keeping Firebase local, select either Vertex profile authentication or a Gemini Developer API key using a JSON file outside this repository. Stop the current stack, then run `rtk npm run dev -- --gemini-config <absolute-path-to-private-json>`. This makes real Gemini calls under the explicit private configuration. The runner never prints credential values or copies them into the checkout. Ordinary `rtk npm run dev` continues to ignore inherited live credentials. The automated fixture tests deliberately refuse a Gemini-mode stack.

Only the backend receives live model configuration. The frontend and emulators receive the sanitized local environment, including protection against mixed-case Windows environment aliases. Shared Google ADC credentials are neither used nor changed by either local authentication route.

### Live Gemini verification

The isolated infrastructure root and verified-profile launcher are described in [infra/gemini-local/README.md](../infra/gemini-local/README.md). The operator's `local-config.json`, credential JSON, state and plans stay in the outer private directory.

For the verified Cloud Billing route, set the private `enableVertexAi` boolean to `true` before reviewing and applying the Terraform plan. After provisioning, create the metadata-only Vertex configuration and start the stack:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-vertex.ps1
rtk npm run dev -- --gemini-config ../docs/private/vertex-local.json
```

The helper verifies the authorized named profile, account, project and enabled API. The backend obtains a fresh short-lived OAuth token from that same profile for each review, with an explicit private gcloud configuration directory and quota project. No API key, service-account key, refresh token or ADC file is copied. This transport is local-only; production authentication and deployment remain a separate task. `gemini-3.6-flash` was verified with the global Vertex endpoint and API version `v1`; the model can be selected explicitly with the helper's `-Model` option.

Google Cloud welcome credits can apply to Gemini on [Vertex AI / Agent Platform](https://cloud.google.com/products/gemini-enterprise-agent-platform). They do not establish a positive Gemini Developer API prepaid balance; that API has [separate billing requirements](https://ai.google.dev/gemini-api/docs/billing). The executed results and any remaining billing limitation are recorded in [verification.md](verification.md).

For the separate Developer API key route, after authorized discovery and Terraform provisioning:

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-gemini.ps1
rtk proxy node scripts/gemini-models.mjs ../docs/private/gemini-local.json
rtk proxy node scripts/gemini-models.mjs ../docs/private/gemini-local.json MODEL_ID_FROM_DISCOVERY
rtk npm run dev -- --gemini-config ../docs/private/gemini-local.json
```

The configuration helper verifies the exact dedicated identity and sole Gemini API restriction before reading the credential directly into the private JSON. Model discovery uses the key in a request header, and prints only model metadata. It does not perform content generation. The selected model is explicit; no fixture fallback occurs.

In a second terminal, `rtk npm run test:live` exercises desktop and mobile with at most two review requests per viewport and no automatic retries. It refuses a fixture/non-emulator API. It verifies initial questions, a context-dependent owner clarification, source references, required owner pricing, integer-paise totals, two preserved draft versions, save replay, reload/reopen, export, ownership, keyboard and accessibility. `rtk npm run test:config` checks the credential boundary without cloud access. Ordinary fixture tests remain under `rtk npm run test:local`.

Each live run retains screenshots, synthetic model responses, exports and its HTML report under ignored `.cache/live-gemini-runs/<UTC-timestamp>-<process-id>/`. Ordinary fixture runs cannot clear these artifacts. They are real execution evidence, not AI Studio configuration/build evidence. The explicit local workspace export above preserves emulator data across a complete stack restart.

## Project-local tooling

- npm packages and lockfile: root workspace; downloads cached under .cache/npm.
- Firebase emulator downloads: .cache/firebase/emulators.
- Playwright Chromium: .cache/playwright.
- Impeccable: .agents/skills/impeccable, version 4.0.2, with upstream license and reviewer specifications.
- Codex MCP: generated .codex/config.toml, ignored because it contains machine-specific paths.
- Other compatible MCP clients: generated .mcp.json.
- Terraform: infra/.tools, installed and invoked through infra/scripts/.

No global MCP or plugin registration is changed. Open this repository itself in Codex and reload/restart the session after setup to discover project-local MCP configuration. Adding a config file does not hot-load new tools into an already running conversation.

Run npm run mcp:verify to test server initialization, tool discovery, and an actual isolated Playwright browser launch. It does not reuse a personal browser profile. The installed shadcn server works from frontend/ so it can see components.json.

## UI development

Read PRODUCT.md, DESIGN.md, the surface brief, and .agents/skills/impeccable/SKILL.md. Use the generated shadcn primitives and extend tokens intentionally. Keep source evidence next to review decisions; avoid turning the product into a generic chat dashboard.

Before merging a user-visible change, exercise it in Playwright at desktop and mobile widths. Check labels, focus, keyboard use, contrast, loading states, retry behavior, and saved/unsaved state. Run the Impeccable detector after a completed UI pass, then inspect screenshots; a detector is not a substitute for visual review.

## Public and private configuration

Public AGENTS.md contains portable project guidance. Operator accounts, actual cloud identifiers, private Firebase configuration, credential files, and real Terraform variables stay in the outer private workspace. Commit only templates.

npm run check:public examines files Git considers publishable for common credential patterns and, when the private context exists locally, the operator-specific values. It is a focused prevention check, not a comprehensive secret scanner.
