# V1 home contracts

Canonical scene and edit schemas live in packages/scene-schema/src/house.ts and design.ts. Renderer-independent validation, templates, selection and compilation live in packages/scene-core. The compiled JavaScript exports are shared by Node and Next.js.

Authoritative HTTP/public response types are backend/src/home-types.ts and home-collaboration-types.ts. Frontend service requests use the existing Firebase token and same-origin gateway. Every server route verifies identity and then ownership or exact membership.

Private homes use /api/homes for create/list, /:id/template for authored selection, /:id/generate for a bounded Gemini edit, /:id/revisions for validated manual changes, /:id/restore for an immutable restoration, /:id/jobs/:requestId for outcome checks, /:id/jobs/:requestId/cancel for cancellation, /:id/summary for AI handover and /:id/export for exact stored Markdown. All mutations identify their request and applicable base revision.

The export query identifies the exact revision; the same-origin gateway preserves it separately from its encoded route path. /:id/jobs/:requestId/resume publishes only previously staged validated output and never calls the model. Unknown or still-running outcomes cannot use resume. Cancellation and changed base revisions fence late publication. Summary and agreement job results retain their exact content IDs; an incomplete earlier request cannot supply a later request's prose.

Semantic selection is whole home, room, object, specific surface or rectangular room region. Model output contains title, summary and up to eight permitted operations. Additions select a host-generated placementId with admitted material/light settings; they cannot supply arbitrary assets or change ownership/scope. The strict compiler validates the entire result before publication.

Designer profiles use /api/design-assistants. /api/homes/:id/room establishes an explicit shared association. Existing room invitations and membership remain authoritative. /api/rooms/:roomId/home exposes the shared projection with role and decisions. Its member-authorized generate/revisions/messages/job routes operate only on the associated home. Client access to private /api/homes and designer proposal routes remains denied.

The shared projection includes persisted assistant replies derived from completed request/revision records. Human messages remain in the original room conversation with their real sender. The legacy observer is contained for home-linked rooms, so sending ordinary chat does not secretly invoke a second agent. Both participants explicitly ask the configured design assistant for a scoped edit.

Shared /accept is homeowner-only; /approve is designer-only after acceptance of the exact current revision. /agreements requires both decisions for that revision and stores an immutable draft. Agreement exports require membership and return stored content. Later changes make prior decisions ineligible for a new draft without rewriting history.

Decisions and agreement cards identify a human-readable design version, title and saved time. The member-authorized revision read opens the exact agreed scene without altering the head. Plan PNG export follows the displayed revision, including historical comparisons. Downloading Markdown or PNG does not generate new prose or change saved data.

Each paid attempt is reserved durably before dispatch. One active owner task and persistent limits bound work. Definite recoverable provider rejections can advance an explicitly configured two-model ladder; validation and ambiguous outcomes cannot. No generated code is executed. View changes, saves, reads and downloads do not dispatch models.

Implementation status and executed evidence belong in verification records; this contract is not proof of passed tests.

The production image embeds a validated full `BUILD_GIT_SHA`. Its `/health.gitRevision` is checked against the exact native release commit before production journey verification begins.
