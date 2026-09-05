# VibeEstimate design system

<!-- impeccable:design-schema 1 -->

## Confirmed direction

The September 6 redesign keeps the established navy/red identity and replaces the deprecated sources-first front door with one home-design journey. An independent designer creates a home, Gemini makes selected changes, and a homeowner joins to review the same saved design before both record their decisions and prepare a draft agreement.

Operate mode governs the product. People use the studio at a desk and on a phone in ordinary daylight, so controls use a light, readable surface around a dominant home canvas. Restrained neutrals and navy provide structure; red identifies the primary action and selection. Material colours belong inside the design.

## Routes and task structure

| Route | Purpose |
| --- | --- |
| / | Your homes: New project, measured layout previews, real recent projects and account access |
| /projects/:id | Persistent home: choose layout, describe change, inspect Plan/Overview/Inside, edit, compare/history and share |
| /rooms/:id | Designer room: shared home, conversation, assistant, review and agreement library |
| /client/rooms/:id | Homeowner room: same authorized design and conversation, homeowner acceptance and stored draft downloads |
| /join | Invitation/code entry using an independent client identity |
| /proposals | Existing source review and confirmed commercial proposal records |
| /welcome | Optional illustrated tour aligned to the current product |
| /studio | Redirect to the integrated home workspace |

A project has one stable URL and identity through creation, generation, saved changes and handoff. Desktop uses a narrow room navigator, dominant canvas and one active contextual panel. On phones, a compact room selector and progressive controls keep the canvas full-width. No miniature three-column desktop layout.

## Tokens and type

Keep self-hosted Poppins headings and DM Sans body/controls, with their existing OFL files under frontend/public/fonts. No remote font request.

- Action red #c52031, hover #a91929, pale red #fff3f4.
- Navy #102b3f, text #20303d, muted text #586673.
- White #ffffff, canvas #f7f8fa, muted surface #f0f3f5, border #dce2e7.
- Warning #745315 on #fbf5e8; error #9a3030 on #fff0ee.
- 56px compact header, 24–30px page headings, readable16px body, supporting text13px or larger where practical.
- Spacing follows4/8/12/16/24/32/40/48/64px. Standard targets44px with8px radius; work panels12px.
- Use clear3px focus outlines and reduced-motion preferences. Viewing controls do not mutate geometry.

## Home and layout choice

Lead with actual work: saved home names and dates when present; a concise outcome and New project when empty. Template previews depict actual canonical geometry and disclose room count, measured area and an authored starting point. Three distinct full homes are offered; test fixtures are not gallery choices.

Project creation establishes private ownership quietly. The next screen lets the person choose a layout, then describe their preferences. Suggested prompts populate the same editable composer and call the same endpoint. Gemini supplies useful title/brief defaults after a real generation. Preserve prompt text on failure.

## Studio

The house is the focal artifact. Plan, Overview, Inside, day/evening and Reset view are actual view controls. Highlight the selected room/object/face/region and name it semantically. Show affected entities and actual changes in human terms. Never make users read canonical IDs or JSON.

Design contains the prompt and factual change cards. Edit contains contextual catalog/property controls. History contains named saved versions and comparison/restoration. Show one task at a time; advanced dimensions and numeric region/transform controls are progressive.

Comparison names the baseline and preserves the camera across revisions. Saved is server-confirmed. Generation displays actual phases, a useful cancellation/check-result action and recoverable failure. Conflicting revisions are preserved and clearly distinguished. Local fixture mode is disclosed separately from live Gemini.

The admitted catalog uses actual model thumbnails and measured bounds. Lights have working enable/intensity/temperature controls. Disclose illustrative light behavior without cluttering the main task. Missing assets and graphics failures keep semantic controls and independent Plan available.

Remove session-reset/demo/fixture selectors, programmatic examples, raw workbench controls, renderer implementation names, intentional rejection buttons and inactive actions from the customer interface.

## Shared room and agreement

Preserve separate designer/homeowner identities and real attributed messages. Pair the shared design with a conversation and a named assistant. Asking for a design change freezes the current selection and base revision. Do not create a simulated agent feed or pretend another participant is online.

Homeowner acceptance and designer review name the exact saved design. A subsequent edit requires review again. Keep the history rather than relabelling an old decision as current. The agreement library contains real saved versions with exact design references and working downloads. Draft wording, unresolved commercial terms and the absence of a legal signature remain clear.

Invitations reuse generated Dialog and existing QR/link/code controls. Invalid joins retain input. Linking Google must preserve guest work. A client never gets private designer controls through a shared route.

## Retained proposal work and tour

The secondary proposal workspace retains original sources, citations, included/proposed/unknown findings, integer-money terms and immutable drafts. Its source content is not populated with invented client evidence. Confirmed price entry remains a human commercial action; descriptive fields can be prefilled from a proposed design with that provenance.

Preserve original tour illustrations, typography and their provenance, updating only the product story and real navigation. Tour styles remain isolated from operating screens.

## Components and verification

Use the officially generated shadcn Button, Input, Textarea, Dialog, AlertDialog and Tabs primitives. Keep named regions, skip links, semantic controls, visible focus, readable contrast, error recovery, keyboard arrows and non-drag touch alternatives. Scope new studio CSS to its surface.

Run meaningful frontend/backend/scene tests, production builds, Rules, renderer checks and headed browser journeys at1440,390 and320px. Inspect every journey with Playwright MCP and normal3D screenshots. Run the Impeccable detector once after the UI pass, then independent finish review and corrections. Record successful videos separately from failures and distinguish fixture/live results. Planned checks are not executed evidence.
