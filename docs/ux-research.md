# Compact onboarding and workspace research

Research date: 5 September 2026. Scope: the user's request for a compact Google/NotebookLM-style onboarding and workspace, retaining VibeEstimate's navy/red theming. The latest clarification preserves the existing Petpooja-style landing, original images, and explanatory flows as a separate product tour at /welcome. The compact workspace lives at / with a Product tour link; the existing source review, clarification, draft, revision, privacy, and export behavior remains authoritative.

This is a review of Google's primary documentation and published product announcements, followed by design inferences for VibeEstimate. It is not a usability study, an endorsement, or a claim that Google's authenticated interface was tested. The project-local Impeccable onboarding and Operate guidance was also read. Root owns the resulting frontend, DESIGN.md, and surface-brief implementation.

## Evidence and application decisions

| Primary evidence | What it establishes | VibeEstimate decision |
| --- | --- | --- |
| [Google: NotebookLM's redesigned interface](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024/) (13 December 2024) | The published design groups source management, source-based conversation, and generated outputs into Sources, Chat, and Studio. Related panes can be viewed together. | Keep original evidence, the review, and the draft in one project context. Use the domain labels Sources, Review, and Draft; a three-pane layout is unnecessary when two readable panes already serve the task. |
| [NotebookLM Help: add sources](https://support.google.com/notebooklm/answer/16215270?hl=en-GB) | The product accepts pasted text and lets a source be named on creation. Source-specific questions help narrow the material being reviewed. | Start with the supported inputs: project name, agreed scope, client messages. Give each field a short example. Preserve original wording and clearly distinguish scope from messages. Do not advertise imports the application does not implement. |
| [NotebookLM Help: source-grounded answers](https://support.google.com/notebooklm/answer/16164461?hl=en) | The help guide describes source-grounded responses with inline citations and identifies unclear phrasing or missing source information as reasons a question may not be answered. | Keep evidence close to each finding. Make a useful clarification the next step when quantity, meaning, or price is unresolved. Never fill a missing rate from an example or present a generated answer as approval. |
| [Google Drive Help: getting started](https://support.google.com/drive/answer/2424384?hl=en) and [Google's Drive Home announcement](https://workspaceupdates.googleblog.com/2023/11/introducing-new-homepage-view-in-google-drive.html) (28 November 2023) | Drive exposes a persistent New action. Home emphasizes relevant existing files, including recently opened or edited work, with filtering when needed. | Put New project beside the workspace heading and recent projects immediately below. Show project name, server-confirmed updated date, and a meaningful current state. A returning owner should open existing work directly. |
| [Google Drive Help: list and grid views](https://support.google.com/drive/answer/2375177?hl=en) | Drive supports both list and grid, with list as the documented default. | Prefer compact rows for text-heavy projects. Do not introduce decorative project thumbnails or duplicate view controls before there is a demonstrated need. If search is shown, it must filter actual projects and provide a clear no-results recovery. |
| [Google: adaptive navigation](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation) (updated 4 August 2026) and [adaptive layouts](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps) | Official Material-backed Android guidance adapts navigation to available space and uses related panes in expanded layouts while retaining state when a compact layout shows one pane. | Apply the principle to this web app: compact navigation on phones, evidence and decision side by side when readable, one sequence on narrow screens. Keep project, draft values, and keyboard focus continuity across resizing. These are design inferences, not a recommendation to add Android libraries. |
| [Google Drive Help: screen-reader navigation](https://support.google.com/drive/answer/12169158?hl=en) | Drive documents named interface regions and keyboard navigation for work, navigation, and commands. | Use named landmarks, plain control labels, visible focus, and a skip link. A keyboard user must be able to enter the workspace, inspect sources, add a clarification, save, revise, and download. |

These sources support structural patterns; they do not establish VibeEstimate's market demand, customer outcomes, or measured productivity.

## Recommended entry and home

Signed out at /: a compact branded header and one short onboarding panel. State the job in one sentence and offer Start a project. A two-step form introduces agreed scope, then client messages; require sign-in only at the final save. Keep existing-account access available separately. The first action should be visible without traversing promotional sections. Keep local environment status visible in the footer.

First visit: show the working fictional lighting example alongside the creation path. The example signs in as needed and creates one project using the real save/review/draft workflow. It is explicitly labeled fictional. The minimum concepts are agreed scope, client messages, and an owner-reviewed draft. Keep the complete illustrated product tour available at /welcome rather than making it a required step before work.

Returning visit: foreground recent saved projects. Keep creation available, but let the owner resume their last task in one project-selection action. Do not replay first-use instructions or discard the current project URL. Use a compact empty state when no projects exist, and a distinct recoverable error when projects fail to load.

Use navy for the wordmark and active navigation, red for primary actions, and light readable work surfaces with a compact white header. Keep the existing navy tour, original imagery, and larger display type at /welcome. A restrained fixed type scale suits the workspace. Preserve the generated shadcn primitives and their familiar focus/keyboard behavior; isolate route styles so visiting the tour does not change workspace layout.

## Next-step logic

| Confirmed state | Helpful next action | Information that stays visible |
| --- | --- | --- |
| No project | New project or Try the lighting example | Required source inputs; example is fictional |
| Project saved, no review | Review scope and messages | Original scope and conversation |
| Review saved, important detail unresolved | Add a clarification | The question and its supporting source wording |
| Review inspected, draft fields incomplete | Enter proposed work, quantity, and confirmed price | Included work, proposed additions, unresolved questions |
| Draft saved | Download draft or make a revision | Saved total and Approval not collected |
| Draft fields changed | Save revision | Unsaved status and last saved total; download requires the saved revision |
| Returning to an existing project | Resume its current saved step | Evidence, current draft, and previous versions |
| Model or save failed | Retry the failed action when available | Inputs and previously saved content; no false success state |

This table is a design proposal based on existing product states. It does not add automatic client approval, model-generated prices, or automatic outreach. A suggested clarification must never overwrite the owner's unsaved text or run a model call without an explicit action.

## Professional use cases

The examples below are synthetic task scenarios for an independent interior designer, not customer research.

| Designer's situation | Product task | Useful completion |
| --- | --- | --- |
| A homeowner asks to remember the kitchen lighting while discussing extra display lights. | Compare the original included-work clause with the new request. | The owner can identify the included kitchen lighting and keep it outside the additional-work total. |
| A client writes “could we do six?” after discussing four lights. | Read the conversation and clarify whether six means the final count or an addition. | The chosen quantity is explicit and linked to the relevant conversation; no approval is inferred. |
| A finish or fixture is requested without a confirmed rate. | Record the proposed work and identify the missing price. | The draft requires an owner-entered confirmed rate; the example amount is never silently substituted. |
| A budget conversation changes six display lights to four at the fixture's stated ₹2,000 each. | Revise the draft quantity. | The current fictional total is ₹8,000, while the previous ₹12,000 version remains visible. This is a revision demonstration, not a savings claim. |
| The designer leaves a site visit and resumes on a desktop. | Reopen the same saved project and inspect the next incomplete task. | Evidence, current draft, revision history, and saved state survive reload and device-size changes. |
| The designer prepares a proposal to discuss with the homeowner. | Review and download the current saved draft. | The artifact is clearly a draft, with no implication that the client signed or approved it. |

## Engagement through useful completion

Use completed work as the reason to return: a source-backed review, an answered clarification, a saved draft, or a revision kept in history. Confirm success briefly and expose the relevant next action.

Do not optimize for session length, endless conversation, model-call count, or repeated visits. Avoid streaks, artificial urgency, fabricated progress, repeated prompts after dismissal, automatically generated extra reviews, or notifications unrelated to actual project work. Respect stopping: an owner can save, leave, and return without losing context.

Progress should describe real state, such as Sources saved, Review saved, or Draft saved. Do not display completion percentages unless the denominator corresponds to real required steps. Client approval remains separate.

## Planned success criteria

These are acceptance targets for the compact redesign, not executed results or measured customer outcomes.

| Criterion | Evidence to collect |
| --- | --- |
| A first-time owner can explain the task and identify the start action after a brief look. | Moderated five-second comprehension check; ask what the product does and what they would select next. |
| At 390 × 844 and 1440 × 900, the signed-out start action and first-use project action are visible without scrolling through marketing sections. | Playwright viewport screenshots and bounding-box checks. |
| An owner can start a fictional project without a forced tutorial. | Keyboard and touch journey that creates exactly one project, signing in only when needed to save. |
| Source entry is understandable before sign-in and survives moving between its two steps. | Required-field errors, focus, Back/Continue retention, and no account/create request before Save project. |
| The retained tour remains useful without expanding the workspace header. | /welcome images, workflow tabs, anchors, and navigation in both directions; no route-style leakage. |
| A returning owner can reach a saved project with one selection from the workspace. | Reopen/reload journey with the current total and history verified. |
| The owner can distinguish included work, an addition, a question, and a draft without relying on color. | Task observation plus accessible names and text checks. |
| Missing price does not become an invented or automatically approved amount. | Required-field/API checks; preserved inputs after validation failure. |
| Each source-linked finding remains inspectable during clarification. | Desktop paired-pane and mobile disclosure/focus checks. |
| Draft save, revision, and download show truthful persistence. | Save/reload/version-history and duplicate-request/failure-recovery tests. |
| No essential action or content is lost at 320px, 390px, tablet width, or desktop width. | Overflow checks, keyboard navigation, focus visibility, mobile input sizing, and accessibility scan. |
| A model/service outage does not trap the owner or erase evidence. | Injected failure with explicit retry/recovery; no automatic fixture fallback in live mode. |

Track time to the first saved review only during a real usability evaluation and report the observed value; do not put an unmeasured “minutes saved” or “two-minute setup” claim in the interface.

## Scope and verification boundary

This document recommends presentation and onboarding changes within the existing MVP. It does not request Google Drive integration, new source import types, collaboration, search over external accounts, audio generation, billing, client approval, deployment, or paid model calls.

The earlier Petpooja visual implementation passed its fixture checks, but those results do not prove the new compact composition. Root must record the compact redesign's actual build, accessibility, desktop/mobile, and workflow verification separately in docs/verification.md.
