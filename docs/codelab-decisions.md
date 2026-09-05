# What we adopt from the supplied codelabs

Reviewed 5 September 2026. The examples illustrate useful patterns; their chosen language and optional services do not define the final challenge's entire stack.

| Reference | What it uses | Decision for VibeEstimate |
| --- | --- | --- |
| [Streamlit RAG/ADK lab](https://codelabs.developers.google.com/codelabs/cloud-run/build-streamlit-rag-agent-google-adk-cloud-run) | Python google-adk, Streamlit, a supplied JSON menu, and grounded agent tools | Adopt grounding in supplied evidence and useful clarification. Next.js/shadcn supplies our custom review UI. |
| [BigQuery MCP lab](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-adk-bq-mcp) | Python google-adk, litellm, mcp, and a database-tool workflow | No BigQuery, model hosting, or MCP data server was required for the initial scope/proposal task. This pattern is adopted in [v3](plan/v3.md) for a rate-card MCP server over the designer's own past project rates. |
| [Personal agent lab](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-personal-agent-coffee-shop) | Python ADK, FastAPI, Uvicorn, tool execution, sessions, and Cloud Run | Adopt explicit service boundaries and validated operations. Do not add shell tools or an in-memory production session store to this app. |

**Selected backend: TypeScript + Express + @google/genai + firebase-admin + Zod.** The chosen work is text interpretation, Firebase authorization/persistence, and deterministic proposal calculations. A shared language simplifies this small frontend/backend workspace. Python/FastAPI would also be valid; no current feature requires a Python-only dependency.

Google's [GenAI libraries](https://ai.google.dev/gemini-api/docs/libraries) support JavaScript/TypeScript and Python. [Google ADK also has an official TypeScript implementation](https://github.com/google/adk-js). The original decision was to use ADK later only if the workflow called for its orchestration, session and tooling features.

**That condition is now met.** The [release plan](plan/README.md) replaces the single observer with a nine-role agent crew across three services, which needs exactly those features: multi-agent orchestration, remote delegation over A2A, typed tool schemas, MCP toolsets and SKILL.md progressive disclosure. [v2](plan/v2.md) therefore adopts `@google/adk` in TypeScript, keeping the existing `@google/genai` Vertex adapter and its fresh-token-per-call path underneath. The published package declares no `engines` field while the documentation asks for a newer Node line than this repository pins, so [v1](plan/v1.md#spike-adk-js) spikes it before anything depends on it; if it does not run here, the new services ship on their own Node version in their own containers and the existing API is untouched.

The [final challenge](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) centers on secure initial AI Studio instructions, Firebase sign-in, multi-turn Gemini, isolated Firestore data, server secrets, Cloud Run, and an original enhancement. Language choice alone does not satisfy those requirements.

Do not copy tutorial wildcard CORS, local-only session storage, permissive access rules, or deployment commands blindly into the app. Here infrastructure changes are managed by Terraform, matching the operator's explicit requirement.

Frontend setup references: [official Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app), [shadcn Next.js installation](https://ui.shadcn.com/docs/installation/next), and [shadcn MCP](https://ui.shadcn.com/docs/mcp). Agent setup reference: [project-scoped Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
