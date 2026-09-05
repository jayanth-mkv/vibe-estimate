---
version: 1
slug: "frontend-src-components-room-room-view-tsx"
primary_target: "src/components/room/room-view.tsx"
related_targets: ["src/components/room/room-workspace.tsx", "src/components/room/room.module.css", "src/app/rooms/[id]/page.tsx", "src/app/client/rooms/[id]/page.tsx", "src/components/onboarding.tsx"]
---

# Shared project room

Mode: Operate, with Onboard for first participation. Preserve the compact navy/red system, local Poppins/DM Sans and existing illustrated tour. User intent: see the whole journey connecting a designer, invited client and continuously observing agent through a real conversation into an explicitly shared draft.

At wide desktop, show Conversation, Scope agent and Shared drafts together. Intermediate widths pair chat with stacked context; below 900px use generated accessible Chat / Scope agent / Drafts tabs. Use separate independently authenticated client and designer pages. Show actual roles and membership, not invented online presence or read receipts. Keep the first-message explanation only while the conversation is empty.

Messages send explicitly and show saved/failure/retry states. The backend observes new messages within its budget; show current/stale review status, exact sources and owner pause/retry controls. Polling does not call the model. Freeze the review into a private draft project, let the designer choose quantity/rate, and return through Back to room. Share saved draft sends an immutable snapshot to the client; hide its sharing action after success until a new saved version exists. Client approval is never implied.

Keyboard, mobile, separate identities, safe retries, invite URL removal, role denial, source focus, draft/revision sharing, persistence and export are required. Source and generated text are data, never executable UI. Execution evidence belongs in docs/verification.md; the product contract is docs/room-contract.md.
