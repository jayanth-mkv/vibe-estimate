# Shared project room

This is the user-requested extension to the existing workflow: designer + invited client + an observing agent share one conversation. The existing home, illustrated tour and owner-reviewed draft workflow remain available. Local Firebase emulators continue to hold all state. No deployment or automatic outreach.

## Journey

1. The designer starts a room from a saved project. The room explains that its agreed scope and source conversation will be shared.
2. An invite opens a separate client page. In the local demo, this page uses a separate Firebase app/auth identity, so two tabs can genuinely act as different people.
3. Both people send and receive persisted messages. The agent observes new messages, updates a source-linked review and identifies open decisions; it cannot send human messages, set prices, or record approval.
4. The designer chooses **Prepare draft** from a current agent review. This freezes the conversation into a new private review project; original project sources and room messages stay intact. The existing draft/revision/export flow handles commercial choices.
5. The designer explicitly shares the saved draft back to the room. The client sees that snapshot as a draft, can discuss it, and sees subsequent shared versions. New conversation does not silently change a shared draft.

## HTTP contract (all endpoints require Firebase ID token)

- `POST /api/projects/:id/room` `{}` → `{ room: Room, inviteToken: string }`. Owner-only, idempotently returns the project's room; a newly generated invite may replace an unused old invite.
- `GET /api/rooms/:roomId` → `{ room: Room }`. Members only; no UID, credential, private provider history or invite hash is returned.
- `POST /api/rooms/:roomId/invite` `{}` → `{ inviteToken: string }`. Owner-only; rotate the expiring, one-client invite.
- `POST /api/rooms/:roomId/join` `{ inviteToken: string }` → `{ room: Room }`. Bind the authenticated non-owner as the one client; repeated joins by that client are safe. Reject other users, expired/invalid invites, and all unauthorized reads/posts.
- `POST /api/rooms/:roomId/messages` `{ text: string, requestId: UUID }` → `{ room: Room }`. Server derives sender role. Replaying a request does not duplicate the message or model call.
- `POST /api/rooms/:roomId/observer` `{ action: "retry" | "pause" | "resume" }` → `{ room: Room }`. Owner-only. Bounded explicit retry; no automatic retry after model failure.
- `POST /api/rooms/:roomId/prepare-draft` `{}` → `{ project: Project }`. Owner-only; requires the observer's successful current message version. Freeze the exact scope/transcript and validated analysis into a new owner project, deduplicate the same version, keep earlier snapshots. Does not make another model call.
- `POST /api/rooms/:roomId/share-draft` `{}` → `{ room: Room }`. Owner-only; share only the current saved draft of this room's latest derived project. Server copies its checked values; deduplicate repeated shares. Never accept client-supplied price/approval metadata here.

`Room = { id, projectId, name, scope, sourceMessages, createdAt, updatedAt, role: "designer" | "client", clientJoined: boolean, messages: RoomMessage[], observer: Observer, draftProjectId?: string, sharedDrafts: SharedDraft[], shareableDraft?: SharedDraft }`.

`RoomMessage = { id, role: "designer" | "client", text, createdAt }` (request id and sender UID stay private).

`Observer = { status: "watching" | "queued" | "thinking" | "ready" | "paused" | "error" | "limit", provider: "fixture" | "gemini", reviewedMessageCount: number, callsUsed: number, callLimit: number, analysis?: Analysis, error?: string, updatedAt?: string }`.

`SharedDraft = { id, version: number, projectId, description, quantity, unitPricePaise, totalPaise, createdAt, sharedAt, messageCount: number }`. `shareableDraft` and `draftProjectId` are owner-only. The shared list contains only explicit shared snapshots and never grants access to the owner's private project routes.

## Behavior and limits

The client page is `/client/rooms/:id#invite=...`; the designer page is `/rooms/:id`. Consume the fragment into memory and remove it from the URL after a successful join. Do not log/store invite values in source files or server diagnostics. A room is visible only to its authenticated members, and the API derives roles from verified identities. The demo's client auth app must be distinct from the default designer app; production keeps the same membership controls with real sign-in.

Use 1.5-second authenticated polling for live synchronization and reconnect feedback. A backend-owned, debounced observer follows persisted new messages with one in-flight request per room, a persisted call budget of 10 per room, per-owner active-call limits and no silent retries/fallback. Pause is immediate for future work; an in-flight result cannot become a current result after newer messages. Failures preserve the conversation and show explicit retry. Use real Gemini 3.7 through the existing provider when enabled. Never launch model requests from polling or duplicate browser sessions.

Limit messages to 1,000 characters, 40 new messages and a 16,000-character assembled transcript. Bound room creation per owner. Invitations are random, stored only as hashes and expire after 24 hours; a full room rejects third members. Original sources are immutable. Source quotes must match the exact frozen transcript or scope. Preserve messages, review snapshots and shared drafts. The fixture only supports the supplied lighting room and explicitly supported demo messages; unsupported text must not receive a fabricated analysis.

## Required verification

The separate source/context panes are a UI choice; they do not enforce access. Google's [NotebookLM sharing documentation](https://support.google.com/notebooklm/answer/16322204) also distinguishes a focused chat view from underlying access. Here, explicit room membership and owner-only project routes enforce the product's narrower sharing boundary. Firebase [server libraries](https://firebase.google.com/docs/firestore/client/libraries) are privileged server access; the API must perform authorization in addition to denying direct client database access.

Two independently authenticated browser contexts exchange messages and observe the same persisted room state. Verify stranger and unauthenticated denial, invitation expiry/replay/role tampering, forged sender/price denial, message replay, bounded/debounced model calls, stale results, safe failure/retry, immutable draft snapshots and owner-only sharing. Follow a room conversation into a saved draft, share it to the client, revise and share again, reload both views, and export from the designer workspace. Exercise keyboard/mobile, no horizontal overflow and targeted accessibility. Live Gemini evidence stays separate from fixture tests.
