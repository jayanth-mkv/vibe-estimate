# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

An independent interior designer reviewing client-requested changes before ordering materials or starting extra work. An invited homeowner joins a shared room to discuss changes and read explicitly shared draft proposals. The designer retains one private project workspace; room membership does not grant access to private projects. The app does not collect client signatures or approvals.

## Product Purpose

Turn an agreed scope and a short message history into a clear, source-linked draft proposal. Help the designer distinguish included work, proposed additions, and missing decisions; revise the draft while retaining the previous version.

## Positioning

An evidence-oriented scope review workflow for small providers. Existing change-order products and general assistants are competitors. Comparative advantage and customer demand are not yet validated.

## Operating Context

Text supplied by the user, INR example amounts, project review at a desk or on a phone, and a saved proposal that can be copied or downloaded. The first demonstration uses a synthetic family renovation involving included kitchen lighting and optional display lights.

## Capabilities and Constraints

Confirmed direction: Next.js frontend and backend served together from one Cloud Run service, Firebase sign-in, multi-turn Gemini, private Firestore persistence, production Secret Manager, Terraform-managed infrastructure, local testing first.

The user approved the selected product and delegated implementation/setup choices. The home and working screens should explain the task quickly, minimize header space, and guide Sources → Review → Draft with familiar Google/NotebookLM interaction patterns. Keep the existing illustrated landing page as an optional product tour at /welcome; / opens the compact workspace. Use the official Next.js and shadcn setup. Actual cloud identifiers are operator configuration outside the public repository; Firebase and backend projects can differ.

The user subsequently requested a live shared conversation connecting the designer, client and observing agent. Separate designer/client pages must use independent authenticated identities, including in the local demo. The agent follows conversation changes and identifies scope questions. The designer freezes a reviewed conversation into a private draft project, chooses commercial terms, and explicitly shares the saved draft to the room. Messages and shared versions remain preserved. This is real local interaction, not a simulated second speaker or fabricated agent feed. See docs/room-contract.md for the agreed extension.

The user then authorized using their existing real Firebase database and requested entry without a login wall. Firebase anonymous identities establish ownership behind the scenes. A client joins through a QR invitation, link, or short room code. Optional Google linking keeps the guest's identity and work; an explicit returning owner action is available only before the current guest has saved work. Returning clients can recover Google-linked room access through a separate identity after server-verified membership, preserving their other guest rooms. The operator enabled Anonymous, Email/Password and Google providers; the product uses anonymous and federated access without a password form. The default fixture stack remains entirely local. The initial production checkpoint is now recorded in [production readiness](docs/production-readiness.md); further deployment requires authorization.

## Planned spatial extension

The user subsequently authorized a demo-sized integration of the separately tested Pascal house PoC on a different application branch. `/studio` now hosts synthetic single-floor fixtures and selected furniture, finish and lighting changes with session undo and local downloads. The workspace opens it in a separate tab. This checkpoint has no scene API persistence, image extraction or model calls; the wider spatial capabilities below remain planned. See [the demo contract and verification](docs/spatial-demo.md).

The next user-requested version adds home-plan and image upload, a whole-home editable 3D view, curated assets selected through model tools, direct visual editing, different viewpoints and walkthroughs. Visual changes connect to the existing designer/homeowner room and proposal workflow; a separate client inbox provides an immediate two-person testing environment. Preserve the initial connected version and existing theme. Research and complete planning precede implementation.

The user subsequently confirmed a wider direction: a designer publishes an agent onto their own website, a homeowner talks to it, the agent opens a project and builds their home in 3D, and the designer reviews what the crew did through a visual console rather than a transcript. Work is sequenced as three releases — see [the release plan](docs/plan/README.md), covering [v1](docs/plan/v1.md), [v2](docs/plan/v2.md), [v3](docs/plan/v3.md) and [who controls what](docs/plan/controls.md).

Confirmed product decisions: one complete floor first; a website launcher and intake opening the full studio in a dedicated tab with the same project; studio-owned projects with client-facing messages, uploads, options and decisions shared by default and disclosed on entry; autonomous, reversible AI edits to working options that the homeowner can compare and choose; and a complete product roadmap including walkthroughs and optional human review. Professional notes and existing private records retain their privacy. Routine work needs no per-action approval; commercial commitments, structural changes and external outreach require human action.

Planned implementation: three shared Cloud Run agent services using TypeScript ADK, Skills and MCP, plus a request-driven media worker using Cloud Tasks. A worker pool requires a separate workload justification. SDK compatibility is checked during implementation. [Controls](docs/plan/controls.md) and [platform contracts](docs/plan/v2.md#platform-contracts) define the defaults and boundaries; they supersede older preview-only/private-option assumptions in [the technical reference](docs/spatial-home-studio-plan.md). The [surface brief](docs/spatial-studio-brief.md) preserves the visual direction. These spatial capabilities are planned, not claims of implemented functionality.

## Brand Commitments

Working name: VibeEstimate. Plain, calm language. Make next steps clear and avoid exposing backend implementation details in the customer-facing proposal.

Confirmed on 5 September 2026: preserve the navy/red theme, self-hosted Poppins and DM Sans, and original generated illustrations established by the Petpooja reference. The user explicitly wants to retain that landing page, its images, and its explanatory flows while simplifying onboarding and the working interface. Google/NotebookLM informs the workspace structure; it does not replace the brand or imply an affiliation. DESIGN.md records the route-specific composition.

## Evidence on Hand

The public docs contain the selected workflow, fictional examples, and implementation guidance. Private research and real Firebase configuration stay outside this repository. No actual customers, measured savings, adoption, or independently validated market advantage.

## Product Principles

- Show the evidence behind a proposed change.
- Ask when meaning, quantity, or price is unclear.
- Keep review separate from approval.
- Make mistakes visible and repairable.
- Protect each owner's private project records.
- Let a first-time owner start without a login wall; use an anonymous identity for private saving and let a returning owner resume saved work. Offer Google linking as a way to keep access across browsers.
- Reward actual completion with a clear saved state and useful next action. Do not invent progress, urgency, savings, or client approval.

## Accessibility & Inclusion

Implementation target: keyboard-operable controls, labeled inputs, readable contrast, visible focus, reduced-motion support, and usable mobile layouts. This is an engineering target; conformance must be checked.
