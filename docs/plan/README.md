# Release plan

Three releases take VibeEstimate from a text-shaped local app to a deployed spatial platform where a designer publishes an agent onto their own website, a homeowner talks to it, and the agent builds their home in 3D.

| | [v1 — Home to agreement](v1.md) | [v2 — The crew](v2.md) | [v3 — Depth](v3.md) |
| --- | --- | --- | --- |
| Goal | Complete shared home design and draft agreement | Complete autonomous single-floor product | Expand the ecosystem |
| Proves | Gemini edits, shared decisions and saved agreement work | Website intake through visual design and optional human review works | Multiple floors and deeper integrations work |
| New AI surface | Selected edits, briefs and agreements | Image interpretation and wider orchestration | Voice, more roles, more MCP |
| Risk | Low | High — deliver incrementally using the [cut line](v2.md#the-cut-line) | Later extensions with separate gates |

Two documents are cross-cutting. [Who controls what](controls.md) covers the settings each party gets, the problem each one solves, and the server-side access matrix. [Foundations](foundations.md) covers what to reuse rather than rebuild, the pinned libraries, the security controls and the verification categories.

## Why this order

**The September 6 direction moves the complete shared design journey into v1.** Competition evidence is a separate delivery checklist and does not determine which core product capabilities may be omitted.

That deployment is now largely delivered: a Cloud Run application, a bounded review queue and recovery scheduler, dedicated identities and a public `/health` returning HTTP 200 against production Firebase, cloud Firestore and live Vertex. See [production readiness](../production-readiness.md) and the [v1 record](v1.md#verification-videos-and-release). Full public user journeys remain the release gate.

V1 now includes real Gemini edits and the designer/homeowner review flow. The isolated Pascal proof established the renderer; the current v1 plan supersedes earlier manual-only boundaries.

## Relationship to the existing plan

[docs/spatial-home-studio-plan.md](../spatial-home-studio-plan.md) remains a technical reference for geometry, units, storage and evaluation. The current [controls](controls.md), [platform contracts](v2.md#platform-contracts) and release gates take precedence over its older private-option, preview/Apply, sharing and delivery policies. [PRODUCT.md](../../PRODUCT.md) records confirmed intent; implemented status requires evidence in [verification.md](../verification.md).

## Product direction

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

These are planned acceptance gates, not claims of shipped features.

| Requirement | Contract and release | Acceptance |
| --- | --- | --- |
| Designer-branded agent and website intake | [v2 platform contracts](v2.md#platform-contracts) | Publish, guest entry, same-project handoff and designer visibility |
| Plans and native reference images | [v2 source pipeline](v2.md#from-source-to-editable-3d) | Calibrate a full floor; edit a selection using a permitted reference image |
| Autonomous working options | [Controls](controls.md) and [v2 tools](v2.md#model-tools) | No per-edit Apply; compare, undo and choose; enforce locks and budgets |
| Shared activity and private professional notes | [Access matrix](controls.md#access-matrix) | Project grants and audience filtering hold across files, artifacts and traces |
| Requirements, decisions and human review | [v2 interface](v2.md#interface--the-signature-moves) | Living Brief, chosen/rejected history, Play briefing and takeover/resume |
| Independent agents with durable context | [v2 architecture](v2.md#architecture) | Restart, duplicate delivery, stale results and replayed progress |
| Walkthroughs, exports and evaluation | [v2 complete-product capabilities](v2.md#complete-product-capabilities) | Room navigation, canonical exports and the 12-plan benchmark |
| Multiple floors, voice and integrations | [v3](v3.md) | Separate extension gates after the complete single-floor journey |

## Preserved baseline

The working connected version is committed at `4fa4d70` and preserved on `snapshot/initial-connected-v1`. Its feature baseline — guided source review, live Gemini 3.7 Flash, real Firebase guest identities, independent designer/client rooms, QR and code invitations, saved draft revisions, explicit sharing and export — must keep working through every release. Executed checks are in [verification.md](../verification.md).

Reverting to that snapshot stays straightforward at every stage.

## Working rules

Each release is built on a task branch, with a conventional commit and a named snapshot per verified stage. Cloud resources are created only through Terraform. Planned checks stay distinct from executed results in [verification.md](../verification.md). No deployment claim is made without evidence recorded against the public URL.
