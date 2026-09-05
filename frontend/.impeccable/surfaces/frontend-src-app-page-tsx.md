---
version: 1
slug: "frontend-src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/project-view.tsx", "src/app/globals.css", "src/components/onboarding.tsx", "src/components/onboarding.module.css", "src/lib/examples.ts", "src/app/welcome/page.tsx", "src/app/landing.css", "src/components/landing.tsx", "src/app/layout.tsx"]
---

# VibeEstimate home, product tour, and project review

Modes: Onboard for first use, Operate for the project workspace, Persuade for the optional product tour.

The user pinned Petpooja's visual style on 5 September 2026, then requested a simpler Google/NotebookLM-style workflow with less header space. The latest clarification retains the existing landing page, generated images, explanatory flows, and navy/red theming. Preserve both intents: / is the compact workspace; /welcome retains the illustrated product tour. Link the tour from the workspace and the workspace from the tour. Do not reopen brand or concept selection.

Home: a compact white header, navy/red brand, one-sentence purpose, Sources → Review → Draft, and Start a project. Let owners enter sources in two steps before sign-in is required at Save project. Keep one-click fictional example creation and show saved projects first for returning owners. Use real persisted state for row labels and useful next actions.

Workspace: pair original sources with one active Review or Draft pane. Stack on phones, with sources initially collapsed and opened/focused by the Sources action or citations. Distinguish included work, proposed additions, and unresolved details. Continue to draft introduces owner-entered description, quantity, and confirmed price. Later clarifications must not overwrite those draft choices. Preserve APIs, original wording, exact evidence links, leave protection, revision history, and export. Only confirmed writes earn saved milestones; client approval is not collected.

Tour: retain the navy hero and white headline, red actions, overlapping laptop/phone preview, four workflow tabs, illustrated feature region, and final action. Keep original art in frontend/public/images and readable fictional preview text in HTML. Scope tour styles to avoid changing the compact workspace after navigation.

DESIGN.md owns shared typography, tokens, route composition, responsive behavior, and accessibility. Do not adopt Google or Petpooja identity, invent customers or savings, or add fake progress and urgency. Keep safe retry and real unsaved/error states.

Verification must cover both routes and navigation between them, first-save onboarding, keyboard/mobile interactions, source focus, review/clarification, pricing, revisions, persistence, download, and failure recovery. Tests, the shadcn audit, and the completed-pass Impeccable detector are required evidence to collect; execution results belong in docs/verification.md.
