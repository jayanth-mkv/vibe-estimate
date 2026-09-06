# Release plan

Two releases take VibeEstimate from a text-shaped local app to a spatial product where the assistant designs like a designer, explains itself, and hands over something worth paying for.

| | [v1 — Home to agreement](v1.md) | [v2 — Question, cost and agree](v2.md) |
| --- | --- | --- |
| Goal | Complete shared home design and draft agreement | An assistant that places well, explains itself and estimates honestly |
| Proves | Gemini edits, shared decisions and saved agreement work | Placement quality, anchored review, measured quantities and a small agent crew |
| New AI surface | Selected edits, briefs and agreements | Vision, ask-back questions, skills, MCP tools and research |
| Risk | Low — shipped | Moderate — phased, each phase leaves a shippable product |

There is one future plan. The earlier v2 and v3 specs are preserved unchanged in [v2.backup.md](v2.backup.md) as a reference, not a commitment.

Two documents are cross-cutting. [Who controls what](controls.md) covers the settings each party gets, the problem each one solves, and the server-side access matrix. [Foundations](foundations.md) covers what to reuse rather than rebuild, the pinned libraries, the security controls and the verification categories.

## Why this order

**The September 6 direction moves the complete shared design journey into v1.** Competition evidence is a separate delivery checklist and does not determine which core product capabilities may be omitted.

V1 is deployed with production Firebase, cloud Firestore and live Vertex. Its home-to-agreement journey has been exercised against the exact deployed application, including separate designer/homeowner identities and a synchronized live recording. The [current verification record](../v1-verification.md) distinguishes complete passes, retained failures and targeted rechecks. [Production readiness](../production-readiness.md) retains the earlier infrastructure and proposal evidence.

V1 now includes real Gemini edits and the designer/homeowner review flow. The isolated Pascal proof established the renderer; the current v1 plan supersedes earlier manual-only boundaries.

## Relationship to the existing plan

[docs/spatial-home-studio-plan.md](../spatial-home-studio-plan.md) remains a technical reference for geometry, units, storage and evaluation. The current [controls](controls.md), [platform contracts](v2.backup.md#platform-contracts) and release gates take precedence over its older private-option, preview/Apply, sharing and delivery policies. [PRODUCT.md](../../PRODUCT.md) records confirmed intent; current implemented status is supported by the [v1 verification record](../v1-verification.md).

## Product direction after v1

V1 begins with three measured templates and a designer-configured room assistant. Image intake, website embedding and the wider service crew below remain later release gates.

**Upload a home plan. Explore the home in 3D. Let the crew build and refine reversible working options, then choose what you like. Bring in the designer when needed; commercial commitments and structural changes require human review.**

Three parties:

| Party | Where they are | What they get |
| --- | --- | --- |
| **Homeowner** | A website launcher and intake, then the full studio in a dedicated tab with the same project. No login wall. | A calibrated 3D home, native image references, a living brief, reversible working options and walkthroughs. Client-facing activity is shared with this studio by default and disclosed on entry. |
| **Designer** | The console. | Live project thumbnails, visual briefings and optional takeover. Professional notes stay private. Human review covers commercial commitments, structural changes and external outreach. |
| **The crew** | Cloud Run. | A visible, inspectable third participant — already modelled today as the agent role in a room. |

## Submission requirements

Mandatory: a deployed Cloud Run URL, Firebase Authentication, multi-turn Gemini, user-isolated Firestore, keys via Secret Manager, the Cloud Run label `dev-tutorial=cloud-run-ai-challenge`, a public repository with a deployment README, and a demo post tagged `#AccelerateAIwithCloudRun`. Judging is on **Authenticity, Usability, Stability, Security**.

Track each requirement and its genuine evidence separately from product completion. [v1](v1.md#verification-videos-and-release) records remaining readiness work; posting or submission requires explicit authorization and is never automatic.

## Product coverage

These are planned acceptance gates, not claims of shipped features. Rows below describe the wider ecosystem ambition, whose detailed contracts live in the [archived spec](v2.backup.md); the [current plan](v2.md) delivers the product quality and estimate work first.

| Requirement | Contract and release | Acceptance |
| --- | --- | --- |
| Placement quality and vision | [v2 phases 1–3](v2.md#phase-1--place-things-like-a-designer) | Wall-anchored, correctly oriented, stackable placement chosen from a plan the assistant can see |
| Anchored review and change cards | [v2 phase 4](v2.md#phase-4--a-conversation-about-a-place) | Comment pinned to an exact surface; typed cards replace the flat change list |
| Measured quantities and honest costs | [v2 phase 5](v2.md#phase-5--the-estimate) | Deterministic quantities, sourced indicative ranges, no price in the agreement without a human |
| Agent crew, skills and MCP tools | [v2 phase 6](v2.md#phase-6--the-crew) | ADK spike passes; allowlisted toolsets; tool results treated as evidence |
| Designer-branded agent and website intake | [Archived platform contracts](v2.backup.md) | Publish, guest entry, same-project handoff and designer visibility |
| Plans and native reference images | [Archived source pipeline](v2.backup.md) | Calibrate a full floor; edit a selection using a permitted reference image |
| Shared activity and private professional notes | [Access matrix](controls.md#access-matrix) | Project grants and audience filtering hold across files, artifacts and traces |
| Multiple floors, voice and integrations | [Archived depth spec](v2.backup.md) | Separate extension gates after the complete single-floor journey |

## Preserved baseline

The working connected version is committed at `4fa4d70` and preserved on `snapshot/initial-connected-v1`. Its feature baseline — guided source review, live Gemini 3.7 Flash, real Firebase guest identities, independent designer/client rooms, QR and code invitations, saved draft revisions, explicit sharing and export — must keep working through every release. Executed checks are in [verification.md](../verification.md).

Reverting to that snapshot stays straightforward at every stage.

## Working rules

Each release is built on a task branch, with a conventional commit and a named snapshot per verified stage. Cloud resources are created only through Terraform. Planned checks stay distinct from the [current executed results](../v1-verification.md). No deployment claim is made without evidence recorded against the public URL.
