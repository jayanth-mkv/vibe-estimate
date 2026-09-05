# VibeEstimate design system

<!-- impeccable:design-schema 1 -->

## Confirmed direction

On 5 September 2026 the user requested [Petpooja's](https://www.petpooja.com/) colors, typography, composition, and image format with original VibeEstimate imagery. The subsequent request simplifies onboarding and the project workspace using familiar Google/NotebookLM patterns. The latest clarification explicitly retains the existing landing page, illustrations, explanatory flows, and navy/red theme. These are complementary surfaces, not a replacement brand direction.

| Route | Purpose | Composition |
| --- | --- | --- |
| / | Start or resume a real project | Compact header, concise explanation, Sources → Review → Draft, useful fictional examples, and recent saved projects |
| /welcome | Optional product tour | Retained navy hero, red actions, overlapping laptop/phone preview, workflow tabs, illustrated feature sections, and final workspace action |

The workspace exposes a Product tour link; the tour leads back to the workspace. Users can begin without scrolling through marketing sections. Preserve the tour as a complete, findable route and isolate its styles so navigation does not alter the workspace layout.

Google's documented source/chat/output organization and Drive's emphasis on existing work inform the navigation. Apply those structural ideas to an interior designer's task using Sources, Review, and Draft. Do not copy Google identity or advertise unsupported integrations. See [the primary-source research and design inferences](docs/ux-research.md).

## Typography and tokens

Self-host Poppins for headings and DM Sans for body and controls, preserving the families observed in the Petpooja reference. Files and OFL licenses live in frontend/public/fonts; no browser or build-time font-service request.

- Shared brand: action red #c52031, hover #a91929, pale red #fff3f4, and workspace navy #102b3f.
- Work surfaces: white #ffffff, canvas #f7f8fa, muted surface #f0f3f5, text #20303d, muted text #586673, and border #dce2e7.
- Feedback: warning #745315 on #fbf5e8; danger #9a3030 on #fff0ee. Success uses navy and pale blue with explicit saved-state text.
- Tour: navy gradient #09151f → #0d2234, header #08151e, feature panels #132431 / #1c3040, white headings, and secondary #a9c2d6.
- Workspace heading: 30px; project title: 24px; section headings about 19px; body 16px/1.55; supporting text at least 13px where practical. Keep the tour's display scale: 68px desktop, 48px tablet, 32px mobile.
- Spacing follows 4/8/12/16/24/32/40/48/64/80/96px. Standard actions and form controls have a 44px target and 8px radius; work panels use 12px. Tour sections retain their larger rounded geometry.

## Compact workspace

Use a 56px white header with the navy wordmark and red mark, a quiet Product tour link, optional How it works help, and account access. Keep help dismissible and secondary to the task. The footer carries local-mode information rather than occupying the top of every screen. Shared fonts, accents, and illustrations connect both routes.

The workspace shell has a maximum width of 1240px and 28px desktop / 16px phone gutters. Avoid empty notice space and oversized title regions. A project pairs a readable source column with one active Review or Draft pane; the columns stack below 900px. Sources are open initially on desktop and collapsed initially on phones so the next action stays reachable. The Sources control and numbered citations open the evidence and move focus to the relevant original wording.

### First use and returning work

At /, explain the outcome directly: Turn client changes into clear drafts. Show the three concepts and Start a project. The fictional lighting example creates a real sample project through the same save/review flow. Additional wardrobe and finish examples use their own synthetic sources; only the supported lighting example is available in fixture mode.

The source form has two small steps: project name and agreed scope, then client messages. Continue validates the current step; Back retains text. Sign-in is required when saving the project, not before typing. Save project is the single persistence action. Fields remain editable when the project service is unavailable, with a visible reconnection path before save.

Returning owners see recent project rows before examples. Each row uses the real project name, saved update date, and a helpful next action derived from persisted state. Opening a saved draft resumes the draft pane. Do not add inactive search or view controls, decorative project metrics, or a repeated mandatory tour.

### Review, clarification, and draft

Keep Sources → Review → Draft visible. The first review screen states what the review will separate before the owner invokes it. Findings distinguish included work, proposed additions, and details to confirm in text as well as color. Numbered source controls make the original wording inspectable. Add a clarification is an optional explicit action with its own input and model request.

Continue to draft introduces commercial terms after the review. The owner enters the work description, quantity, and confirmed unit price. A later review must retain the owner's entered draft values. Compute totals in integer minor units, exclude included work from the additional-work total, and never derive approval from a source message or owner review.

Use actual progress as the reward: sources saved, review saved, draft saved, and earlier versions preserved. Confirm a completed write briefly and offer the next useful action. Keep Approval not collected visible on the draft and export. Do not fabricate completion percentages, streaks, urgency, adoption, savings, or client approval.

## Retained product tour and assets

The tour preserves the previous centered white headline, red action, HTML/CSS device preview, four workflow tabs, navy illustrated features, and final action. Its device preview uses readable HTML and clearly marked fictional data with no fake interactive controls. The sequence explains included kitchen lighting, proposed display lights, owner review, and a revision that retains the earlier draft.

Original raster illustrations show a designer comparing a floor plan with client messages, and proposal revisions with a pencil/calculator. Preserve flat contours, white/pale-rose fills, red details, and navy ground. Optimized responsive WebP assets, generation prompts, and provenance live in frontend/public/images. Do not copy third-party logos, customer names, testimonials, metrics, prices, or approval claims.

## Components, accessibility, and recovery

Use officially generated shadcn Button, Input, Textarea, AlertDialog, and Tabs with Radix Nova. Preserve their keyboard behavior. Review/Draft tabs and the tour's workflow tabs support arrow-key navigation. Keep the skip link, named regions, visible 3px focus outlines, source focus targets, and jump-to-draft action. Use light focus indicators on navy surfaces and respect reduced motion.

Preserve server-confirmed saved states, original evidence, prior revisions, safe retry, unsaved-change warnings, leave confirmation, and disabled conflicting actions. Download uses the saved revision and stays disabled while the draft differs. Model/save failures retain input and previously saved content. The local status explicitly distinguishes Local sample · Gemini not connected from Local workspace · Gemini enabled; live failures never silently become fixture results.

## Verification

Verify both routes at 1440px desktop, tablet, 390px, and 320px: readable layout, no page overflow, working route links, preserved tour art, keyboard tabs and focus, mobile sources, onboarding validation, sign-in/save timing, review, draft/revision/history, download, and failure recovery. Also verify navigating between routes does not leak tour styles into the workspace.

Run relevant frontend TypeScript, ESLint, production build, shadcn audit, one Impeccable detector after the completed UI pass, and meaningful workflow tests. These are acceptance requirements, not executed results. Record actual results and remaining limitations in docs/verification.md; earlier tour checks do not prove the new composition.
