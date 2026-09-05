# Release plan

Three releases take VibeEstimate from a text-shaped local app to a deployed spatial platform where a designer publishes an agent onto their own website, a homeowner talks to it, and the agent builds their home in 3D.

| | [v1 — Standing up](v1.md) | [v2 — The crew](v2.md) | [v3 — Depth](v3.md) |
| --- | --- | --- | --- |
| Goal | Deployed, valid, and a 3D home you can actually edit | Win the ideathon | Everything that makes it a durable product |
| Proves | The app is real and runs in production | The idea is real and the crew works | The ecosystem is real |
| New AI surface | None | Most of it | Voice, more roles, more MCP |
| Risk | Low | High — see the [cut line](v2.md#the-cut-line) | Optional by definition |

[Who controls what](controls.md) is cross-cutting: the settings each party gets, the problem each one solves, and the server-side access matrix.

## Why this order

Nothing in this project has ever been deployed. Every verified result to date is on loopback. An undeployed app scores zero regardless of how good its geometry is, so **v1 deploys the app that already works before building anything new**, and every release after that is upside rather than exposure.

v1 also deliberately contains **no AI in the studio**. A complete authored sample home proves the 3D editing environment first, which means v2's plan recognition is measured against a known-good environment rather than debugged against a moving one.

## Relationship to the existing plan

[docs/spatial-home-studio-plan.md](../spatial-home-studio-plan.md) remains the deep technical reference for geometry, units, storage, threats and evaluation. It is not superseded — only its 7-stage delivery sequence is, by the three releases here. [v1](v1.md#what-carries-forward-from-the-existing-plan) records exactly which of its findings land in which release.

## Product direction

**Upload a home plan. Explore the home in 3D. Try changes together and turn the chosen changes into a clear draft — with a crew of agents doing the legwork and the designer approving anything that leaves the building.**

Three parties:

| Party | Where they are | What they get |
| --- | --- | --- |
| **Homeowner** | On the designer's website, then in the studio. No login wall — an anonymous Firebase identity, already implemented. | Their actual home in 3D within minutes, a brief they can watch being written and correct, private options they choose when to send. |
| **Designer** | The console. | A wall of live homes instead of an inbox of text. A *Needs you* queue. Sole authority over price and over anything sent outward. |
| **The crew** | Cloud Run. | A visible, inspectable third participant — already modelled today as the agent role in a room. |

## Submission requirements

Mandatory: a deployed Cloud Run URL, Firebase Authentication, multi-turn Gemini, user-isolated Firestore, keys via Secret Manager, the Cloud Run label `dev-tutorial=cloud-run-ai-challenge`, a public repository with a deployment README, and a demo post tagged `#AccelerateAIwithCloudRun`. Judging is on **Authenticity, Usability, Stability, Security**.

All of these are satisfied by the end of [v1](v1.md#deploy-what-already-works). [v2](v2.md) is what makes the submission competitive.

## Preserved baseline

The working connected version is committed at `4fa4d70` and preserved on `snapshot/initial-connected-v1`. Its feature baseline — guided source review, live Gemini 3.7 Flash, real Firebase guest identities, independent designer/client rooms, QR and code invitations, saved draft revisions, explicit sharing and export — must keep working through every release. Executed checks are in [verification.md](../verification.md).

Reverting to that snapshot stays straightforward at every stage.

## Working rules

Each release is built on a task branch, with a conventional commit and a named snapshot per verified stage. Cloud resources are created only through Terraform. Planned checks stay distinct from executed results in [verification.md](../verification.md). No deployment claim is made without evidence recorded against the public URL.
