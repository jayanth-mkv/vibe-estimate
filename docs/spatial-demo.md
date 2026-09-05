# Integrated house demo

The user requested a quick integration of the tested sibling Pascal PoC on a separate application branch. This checkpoint promotes its three reusable packages into `packages/`, adds `/studio` to the Next.js frontend, and adds a separate-tab launch from the workspace. The API remains responsible for existing authentication, ownership, money and private proposals; this synthetic demo makes no new API or model call and does not associate its state with a saved project.

The clean checkout is `../vibeestimate-spatial-demo`, branch `feat/spatial-house-demo`. The original application's uncommitted infrastructure/documentation work is preserved in its existing checkout. No deployment or push is part of this checkpoint.

## Local demo

Run commands from this checkout:

```powershell
rtk npm ci
rtk npm run setup:spatial:browser
rtk npm run verify:spatial
rtk npm run start:spatial
rtk npm run review:spatial
```

Open http://127.0.0.1:3100/studio. The isolated production frontend preview leaves existing ports and connected development untouched. It does not start Firebase or the API; the existing proposal flow still needs the normal separately configured application stack. The studio uses only admitted same-origin GLBs and local fonts. Headed Chromium tests run at 1440, 390 and 320 pixels. Their production server is fresh for each suite. Use the production build for this demo: a development-mode WebGPU buffer initialization issue was observed in the PoC and is not counted as verified here.

Choose **Light every room → Apply patch → Evening → Inside**. Select `ceiling-living` to switch it off, dim it or change temperature. Other examples paint one shared-wall face and a floor, move/rotate the sofa, resize the table, place a lamp within a region and move a door in Plan. Deliberately invalid examples demonstrate atomic collision rejection, frozen selection and locked furniture. Session undo/redo and labelled PNG/JSON downloads are available. Reload resets the scene.

## Boundaries

- Synthetic six-room, 93.84 m² clear-area single floor; 200 mm walls and assumed 2.8 m ceiling. The measured 5 × 4 m and adjoining-room fixtures remain selectable.
- Seven authored MIT catalog models: sofa, table, chair, bed, cabinet, pendant and floor lamp. Local manifest and thumbnail checks live in `frontend/public/models/`. Regenerate with `rtk npm run assets:spatial -- --thumbnails`.
- Canonical integer-mm schemas and complete-patch validation remain renderer-independent. Model/asset/material IDs are admitted locally; arbitrary URLs, unknown operations, out-of-scope edits, collisions and locked changes fail before publication.
- Pascal's actual Viewer, architectural nodes and GLB item nodes render the scene. Host-owned Three point lights live inside that same canvas. Solid/Lambert shading and unshadowed light spill are illustrative; no wall occlusion, photometry or physical-device frame-rate claim.
- This is demo integration. Durable owner-scoped scene revisions, extraction from images, AI edits, room sharing and full I0/P3/P4 acceptance remain later work. Existing proposal/authentication/ownership contracts are unchanged.

## Verification

The standalone PoC passed 12 unit and 15 headed browser checks before promotion; its verified source checkpoint is `41b5bdd`. Its first native house run exposed a raw GLB material shader failure and redundant doorway slab geometry; all model materials now use explicit Pascal slots and only native room slabs cover wall bands. A React SVG title hydration mismatch was corrected. Model dimensions, real wall holes, receiving-surface illumination and independent wall faces are verified from rendered geometry and pixels.

The integrated verification command records actual results in `.cache/spatial/verification.json`; browser evidence goes to `.cache/spatial/browser.json`, `playwright-report/spatial/`, and `docs/screenshots/spatial/`. Retained executed results are recorded below. Planned checks are not counted as passes. Container packaging is updated to include the new workspace packages; building or deploying the container is outside this local demo checkpoint.

Executed individual commands passed: installation, frontend/backend typecheck, frontend lint, **44 frontend tests**, **183 backend tests**, **8 scene tests**, both production builds, and **12 headed browser tests**. The repeatable `verify:spatial` script combines those checks; this initial integration run executed them individually. The retained [machine-readable record](reports/spatial-demo.json) includes actual renderer and pixel evidence.

All three widths passed model bounds, real opening rays, independent wall-face painting, fixed-camera light switching, movement/rotation/resizing, replacement/removal, session undo/redo, invalid batch rejection, numeric Plan edits, PNG/JSON downloads, axe and no page overflow. The workspace opens the real studio in a second tab; client navigation back preserves workspace heading typography/colors. All normal scene tests reject external requests. Scene first-view encoded resource bodies were approximately 1.80 MB. The selected-light mean RGB difference was 47.98 on desktop, 49.60 at 390 pixels and 49.74 at 320 pixels. These are correctness observations, not physical-device performance or photometric measurements.

The [desktop Overview](screenshots/spatial/desktop-overview.png), [lights off](screenshots/spatial/desktop-lights-off.png), [narrow Overview](screenshots/spatial/narrow-overview.png) and [focused Plan](screenshots/spatial/mobile-focused-plan.png) were visually inspected after integration. The original generated app artwork and generated shadcn Button remain unchanged. Firebase Rules, live-model, deployment and container execution were not run for this frontend demo addition.
