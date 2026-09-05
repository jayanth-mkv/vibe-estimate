# Local foundation API contract

Backend: Express + TypeScript, port 8080. Frontend: Next.js, port 3000. All protected routes require Authorization: Bearer <Firebase ID token>. Firebase Auth emulator 9099; Firestore emulator 8085; emulator UI 4000; local project demo-vibeestimate. No production data in the local test suite.

GET /health → { status: "ok", aiProvider: "fixture" | "gemini", storage: "firestore", auth: "emulator" | "firebase", storageConnection: "emulator" | "cloud", runtime: "local" | "connected" | "production", geminiTransport?: "vertex" | "developer" }.

The separately authorized connected development runtime uses real Firebase Authentication and Firestore with explicit private project/profile configuration. An anonymous Firebase identity is still authenticated and has the same ownership enforcement as a Google-linked identity. Invalid or revoked identity returns 401; an upstream sign-in verification outage returns a sanitized 503 so the frontend retains the current identity.

GET /api/projects → { projects: Project[] }.
POST /api/projects with { name, scope, messages } → 201 { project: Project }.
GET /api/projects/:id → { project: Project }.
POST /api/projects/:id/analyze with { clarification?: string } → { project: Project }.
POST /api/projects/:id/proposals with { quantity: number, unitPricePaise: number, requestId: string, description?: string } → { project: Project }.
GET /api/projects/:id/export → text/plain draft proposal. Frontend fetches with the auth header and downloads using a Blob; never put a token in the URL.

Project: { id, name, scope, messages, createdAt, updatedAt, analysis?: Analysis, proposals: Proposal[] }.
Analysis: { summary, included: string[], proposed: string[], questions: string[], evidence: { source: "scope" | "messages", quote: string }[], provider: "fixture" | "gemini" }.
Proposal: { id, description, quantity, unitPricePaise, totalPaise, status: "draft" | "superseded", createdAt }.

The first fixture represents display-light quantities only. Arbitrary user input requires Gemini mode; fixture mode is explicitly labeled and must reject unsupported scenarios rather than pretending to understand them. The frontend tells the user when a local fixture is in use.

Every new proposal supersedes the previous current draft and leaves its values intact. Retrying the same requestId returns the same result without adding a proposal. A successful reanalysis supersedes existing drafts; export returns 409 until the owner reviews and saves a new draft. Each proposal stores its own work description. The backend verifies ownership on all operations and returns no foreign project content (404 for a foreign identifier). Unauthenticated requests return 401. Errors: { error: { code, message } } with safe text.

The user-requested [shared-room extension](room-contract.md) adds authenticated designer/client chat, bounded agent observation, frozen private review projects and explicit draft sharing. Derived Project records include optional server-assigned roomId metadata for returning to their room; original private project access stays owner-only. Public links do not grant project access.

The [release plan](plan/README.md) adds a further set of routes that are **proposed, not implemented**: scene creation and validated revisions with an optimistic `baseRevisionId` check and a catalog read in [v1](plan/v1.md#endpoints); then plan upload and authorized asset retrieval, spatial jobs, edit proposals, scene sharing and shared-manifest reads, client options and their attachment namespace, annotations, membership listing and per-identity read cursors in [v2](plan/v2.md#endpoints). Those become shared schemas in `packages/scene-schema` before any parallel implementation begins. Multi-line proposals and the three export formats are [v3](plan/v3.md#commercial-depth); the current single-line proposal shape above stays authoritative until then.

Editing arbitrary line items, signatures, file OCR, payment collection, and WhatsApp integration remain outside this foundation.
