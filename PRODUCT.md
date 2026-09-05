# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

An independent interior designer and an invited homeowner developing a home design together before ordering products or beginning work. Each uses a separate identity. The designer's private projects remain private; room membership grants access to the explicitly shared home, conversation, design decisions and draft agreements.

## Product Purpose

Create a project, choose a measured home template, describe the desired home and see Gemini apply supported furniture, lighting and finish changes. Compare and reopen saved designs. Bring the homeowner and designer into the same room, review the same version and leave with a stored, downloadable draft agreement.

Confirmed on September 6: this complete journey replaces the sources-first homepage and session-only studio. The user wants six polished flows, AI-prefilled descriptive fields, actual Gemini integration, real browser review and video evidence before the authorized main-branch release. The current requirements are in [v1](docs/plan/v1.md).

## Operating Context

Designers work at a desk; homeowners may join from a phone. A project can start without a login wall through Firebase anonymous ownership. Google linking may retain access across devices without replacing guest work. Examples are synthetic and use the same real application endpoints. The product must never present fixture inference as live Gemini.

The first release starts with three complete, measured single-floor templates, actual local furniture assets and Plan/Overview/Inside views. A template represents an authored starting point, not a survey of a person's property. Ceiling heights, finishes and illustrative lighting remain disclosed assumptions.

## Capabilities and Constraints

Next.js frontend and Express API retain their respective responsibilities and are served together from the existing Cloud Run runtime. Firebase verifies identity, Firestore retains private records, Gemini runs server-side through the configured Google SDK, and Terraform owns infrastructure. Actual operator configuration and credentials stay outside the public repository.

AI fills project titles, design briefs, descriptions and summaries; code derives inventory and geometry. People supply preferences through a prompt or conversation. Do not force empty forms for information the app can safely derive. Do not invent agreed scope, client messages, prices, approval, site dimensions or signatures. Unknown commercial terms stay visibly unresolved.

A designer creates a named/configured design assistant and connects a home to a shared room. The homeowner joins through an invitation using a separate identity. Both can inspect the same saved layout and request selected design changes in chat. Preserve original messages and actor identity. Show only real assistant activity and stored results, never simulated participants or approval.

The homeowner explicitly accepts an exact saved design revision; the designer reviews and approves that same revision. A later edit requires fresh decisions. The resulting draft agreement stores its exact design, review records, source requests, factual change schedule and unresolved terms in that room. Both members can reopen and download preserved versions. Design acceptance is not an electronic signature or a legally executed contract.

Keep existing private scope reviews and proposals accessible through a secondary proposal workspace. Their source evidence, included-item treatment, integer-money calculations, missing-price checks, revisions and exports remain intact. The old proposal flow does not collect client approval; the new scene review has explicit design decisions.

## Brand Commitments

VibeEstimate uses a calm navy/red identity, self-hosted Poppins and DM Sans, and its original illustrations. Keep the header compact and the canvas central. The homepage presents real homes and the next action, with no competing demonstration controls. The optional tour must describe the delivered product. Use generated shadcn primitives and the project-local Impeccable workflow.

## Product Principles

- Make the home and the effect of a change visible.
- Protect private work and preserve original evidence.
- Constrain AI to the selected scope and admitted assets.
- Keep mistakes recoverable through immutable saved revisions.
- Record actual decisions against exact versions.
- Derive quantities in code and leave unknown prices unresolved.
- Report saved state and assistant progress only from real operations.
- Keep keyboard, touch, mobile and independent Plan fallback usable.

## Evidence and Release

The earlier connected proposal/room and standalone Pascal checks are preserved as historical evidence. They do not establish the replacement flows. V1 completion requires the six real journeys, meaningful security/persistence/renderer tests, Playwright MCP visual review, successful videos and verification of the matching deployed commit.

The user authorized final commit, merge and push to main after release checks. Publication, outreach and ideathon submission remain separate actions. There are no claimed customers, measured savings, independent accuracy guarantees, completed personal consent or collected legal signatures.

## Later Scope

Image interpretation requires private source preservation, scale and uncertainty review before publication. Wider website embedding, independently deployed agent services, multiple floors and external integrations retain separate gates. Do not expose unfinished controls for these features.
