# Spatial studio surface brief

Status: proposed design brief for the next version, 5 September 2026. Planning only. This expands the established visual world; it does not replace [DESIGN.md](../DESIGN.md). [The full plan](spatial-home-studio-plan.md) specifies architecture, sequence and tests.

## Job, audience and mode

**Mode: Operate.** An independent designer wants to turn a client's home plan and requested changes into something both people can inspect and discuss. The homeowner may have no CAD experience and may arrive on a phone through a room invitation. Both need orientation before tools.

The primary task is to select a real part of the home, try a visible change, understand its difference and save/share a reviewed version. The first successful moment is seeing the complete checked home; the enduring value is a change that remains connected to evidence and a proposal.

## Selected direction

Use a **visual change-review workspace**. The scene occupies the centre; a small Rooms navigator maintains whole-home orientation; a contextual inspector exposes one task at a time. Starting-layout/Option comparison and visual change cards organize review. Permanent chat columns and dense CAD palettes do not control the first viewport.

The incumbent 56px header, navy #102b3f, action red #c52031, quiet white/cool-grey work surfaces, self-hosted Poppins/DM Sans and original illustrations remain authoritative. The home itself adds material colour. Selection uses an outline and label, not colour alone. Preserve the illustrated tour and the current source-only route.

Considered alternatives were a permanent 2D/3D split, an almost full-screen canvas with icon palettes, and a sequential room-by-room walkthrough. The chosen surface keeps the whole home visible and makes a proposed change understandable. Split view serves calibration/precision checks; a walkthrough serves inspection; neither becomes a mandatory workflow for every edit.

## First viewport and sequence

The entry page says **Upload a home plan. Explore it in 3D. Plan changes together.** It offers Upload a plan, a labelled complete-home example, recent projects and Join a room. Keep the original illustration at a supporting scale and avoid another tall hero.

Inside the studio, a roughly 220px room navigator and optional 300px inspector surround a flexible canvas. The header contains project identity, saved state, undo/redo and Share. Canvas controls name Overview, Inside, Plan, Compare and Reset view. A bottom view strip contains the whole home and actual room bookmarks; Changes and Discussion open contextual content.

The initial sequence is upload → check source/scale → whole-home reveal → choose a room → try an idea → compare → discuss/share → draft. A brief reveal may extrude the reviewed layout into the home; reduced-motion users get the final view directly. This is meaningful state change, not a loading performance.

## Editing and collaboration

Clicking a room focuses it. Clicking a surface exposes Material and relevant additions; selecting an object exposes Move, Rotate, Size where supported, Replace and Remove. A catalog shows actual model previews and dimensions. Every placement also supports tap-to-place and numeric adjustment. Confirm an AI preview through Apply; Discard returns to the unchanged saved scene.

Ask for a change is scoped to the selection and can accept a reference image. The response is visible geometry/material operations, questions or highlighted constraints. A short explanation supports the preview. Source references and missing-price prompts appear next to the relevant change, while detailed conversation remains available.

Before/after uses the same viewpoint and names its baseline, such as Starting layout v1 or Shared version 3. The original may show a current home, planned design or unknown state; inferred materials and prior options must not be labelled as physically existing. A visual change card includes the room, changed objects and the exact saved revision. Discuss this attaches that context to a real message. Client options and their reference photos are private until explicitly sent. Adopting an option creates a designer revision, and sharing a scene does not automatically disclose original plans, all photos or private scope documents.

Each person controls their own camera and selection. Following a presenter is explicit and easy to exit, bound to a shared snapshot accessible to both people. A different or unpublished revision cannot be opened silently; preserve the follower's work and offer the correct shared view. Receiving a comment or scene event must not steal focus. Client desk room lists and unread indicators come from authenticated memberships and per-identity read cursors, including the existing separate guest/Google identities. Read/presence/approval language is based on real events and existing product rules.

## Mobile and accessible operation

On phones, keep the canvas full-width. Rooms, Edit and Discussion open one bottom sheet at a time. Replace the desktop navigator with a room selector; retain visible viewpoints, Reset and the current primary action. Do not miniaturize the desktop panels.

Provide a semantic room/object list outside the canvas. Selection, move, rotate, material and size changes work through labelled controls; keyboard and non-drag touch alternatives are both required. Plan/list editing remains usable when WebGL is unavailable. A screen reader receives concise saved-state and selection updates instead of every camera frame.

Walkthroughs offer room stops and previous/next before optional free movement. Escape exits captured camera input; Reset view is always reachable. Stop controls, reduced-motion transitions and visible touch targets prevent the home becoming a navigation trap.

## States and honest feedback

| State | Visible response |
| --- | --- |
| Uploading/reading | Original preview and actual named processing stage; cancel/reopen after reload. |
| Unclear or unscaled plan | Select the specific uncertain part; confirm a measurement, correct the page or trace manually. |
| Approximate concept | Assumed dimensions are visible; confirmed quantity/area claims stay unavailable. |
| Empty scene | Upload, open the full-home example, or begin a simple plan; explain the resulting task. |
| Asset unavailable | Dimensioned placeholder labelled as unavailable; preserve identity and offer replacement. |
| Unsaved/offline | Keep edits and state Waiting to save; reconcile revisions before reporting Saved. |
| Newer revision | Compare with latest; preserve the user's option and explain any conflict. |
| Model failure/unknown outcome | Retain sources and scene; explicit retry with actual status and bounded usage. |
| Graphics/context failure | Keep plan/list and saved work available; retry the 3D view. |
| Successful step | A concise saved milestone and the next useful action; no fabricated completion or approval. |

## Acceptance and unresolved assumptions

Verify desktop, tablet, 390px and 320px; keyboard-only operation; tap-only placement; assistive names and focus; all viewpoint controls; source checks; edits/undo; separate identities; compare/share; failure recovery and exact saved export. Run shadcn review and one Impeccable detector after each completed UI pass, plus actual visual inspection. Planning does not count as executed UI verification.

The first scope assumes a complete single-floor home and private homeowner options. Floor count, real input quality, actual asset taste and hardware performance remain to be confirmed through the first benchmark and user feedback. The larger plan explicitly includes multiple floors, walkthroughs, visual estimates and a separate client inbox.
