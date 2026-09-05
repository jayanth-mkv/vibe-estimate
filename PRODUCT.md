# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

An independent interior designer reviewing client-requested changes before ordering materials or starting extra work. A homeowner reads the resulting proposal. The initial app has one project owner; it does not collect client signatures or approvals.

## Product Purpose

Turn an agreed scope and a short message history into a clear, source-linked draft proposal. Help the designer distinguish included work, proposed additions, and missing decisions; revise the draft while retaining the previous version.

## Positioning

An evidence-oriented scope review workflow for small providers. Existing change-order products and general assistants are competitors. Comparative advantage and customer demand are not yet validated.

## Operating Context

Text supplied by the user, INR example amounts, project review at a desk or on a phone, and a saved proposal that can be copied or downloaded. The first demonstration uses a synthetic family renovation involving included kitchen lighting and optional display lights.

## Capabilities and Constraints

Confirmed direction: Next.js frontend suitable for Vercel, backend suitable for Cloud Run, Firebase sign-in, multi-turn Gemini, private Firestore persistence, production Secret Manager, Terraform-managed infrastructure, local testing first.

The user approved the selected product and delegated implementation/setup choices. The home and working screens should explain the task quickly, minimize header space, and guide Sources → Review → Draft with familiar Google/NotebookLM interaction patterns. Keep the existing illustrated landing page as an optional product tour at /welcome; / opens the compact workspace. Use the official Next.js and shadcn setup. Actual cloud identifiers are operator configuration outside the public repository; Firebase and backend projects can differ.

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
- Let a first-time owner enter source material before sign-in is needed to save it; let a returning owner resume saved work directly.
- Reward actual completion with a clear saved state and useful next action. Do not invent progress, urgency, savings, or client approval.

## Accessibility & Inclusion

Implementation target: keyboard-operable controls, labeled inputs, readable contrast, visible focus, reduced-motion support, and usable mobile layouts. This is an engineering target; conformance must be checked.
