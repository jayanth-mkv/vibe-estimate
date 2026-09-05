# Spatial home studio: research and decisions

Researched on 5 September 2026. This is primary-source research and proposed engineering, not evidence that spatial features have been built or benchmarked. The existing connected application is recorded in [verification.md](verification.md). The implementation sequence and acceptance gates are in [the spatial plan](spatial-home-studio-plan.md).

## Main finding

Build an editable home from a reviewed plan graph. Use Gemini to interpret the uploaded source and propose changes; use application geometry and a curated asset catalog to render and validate the result. A pleasing generated image can support a style discussion, but cannot serve as the editable, dimensioned home. The distinction matters when a homeowner moves furniture, walks through a doorway, or asks what a proposed addition will cost.

## What the sources establish

| Evidence | Implication for this application |
| --- | --- |
| [Gemini 3.7 Flash specification](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash) lists image/PDF input, structured output and function calling. It does not support the Gemini Live API. | Retain the verified model and request-based backend. Test the new multimodal/tool paths independently. A live collaborative room does not require the Gemini Live API. |
| Google's [image limitations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/image-understanding#limitations) and [document limitations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/document-understanding#limitations) identify imprecise spatial localization and recognition problems. | Treat extracted walls, dimensions and labels as candidates. Keep source overlays, calibration, editable assumptions and manual correction in the main journey. Do not promise accurate one-click reconstruction of arbitrary plans. |
| [Structured-output guidance](https://ai.google.dev/gemini-api/docs/structured-output#best-practices) still requires semantic validation. [Function calling](https://ai.google.dev/gemini-api/docs/function-calling#how-function-calling-works) leaves execution with the application. | Validate tool arguments, geometry, ownership and revision before execution. The model returns operations over known entities and assets; it never supplies executable scene code. |
| The [document input guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/document-understanding) constrains private Cloud Storage URI inputs to the requesting project. | Prefer bounded inline page images initially. Keep the proposed private binary bucket in the authorized backend/Vertex project. Do not expose a private plan publicly to make model input work. |
| [React Three Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation) pairs Fiber 9 with React 19; [Drei's package](https://github.com/pmndrs/drei/blob/master/package.json) declares its peers. [Next lazy-loading guidance](https://nextjs.org/docs/app/guides/lazy-loading) restricts the client-only dynamic import pattern. | Fit the current React 19 application with a lazy client canvas. Pin one compatible dependency tree and test it before adoption. Keep Three.js out of the home/tour entry bundle. |
| [Three renderer guidance](https://threejs.org/manual/en/webgpurenderer) describes WebGPU migration and remaining limitations. Fiber offers a [canvas fallback](https://r3f.docs.pmnd.rs/api/canvas). | Start with WebGL 2 and a usable 2D/list editor. Evaluate WebGPU later against the same scene and devices. |
| Three provides [extrusion](https://threejs.org/docs/pages/ExtrudeGeometry.html), [transform controls](https://threejs.org/docs/pages/TransformControls.html), [pointer-lock camera controls](https://threejs.org/docs/pages/PointerLockControls.html) and [GLB export](https://threejs.org/docs/pages/GLTFExporter.html). | These are building blocks. Our code must supply correct wall joins/openings, topology, constrained placement, collision-aware walking, accessibility and history. |
| [Firestore limits](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields) cap a document at 1 MiB. | Store binary plans/textures/models separately. Use bounded revision manifests/chunks and subcollections instead of adding entire scenes to the existing room arrays. |
| [Firebase Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) now require Blaze. The existing Firebase project was verified without billing in the initial setup. | Recommend a private GCS bucket in the already billed backend project, managed through Terraform, while keeping current Firebase Auth/Firestore configuration. This is a proposed resource, not an existing bucket or a promise of free storage. |
| [Cloud Storage signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) and resumable session URIs are bearer capabilities. | Use a bounded authenticated backend upload/download proxy initially, compatible with the existing short-lived profile credential. Reconsider direct uploads only with explicit signing/expiry and disclosure controls. |
| [Cloud Tasks delivery](https://docs.cloud.google.com/run/docs/triggering/using-tasks) can run asynchronous Cloud Run work; its [limitations](https://docs.cloud.google.com/tasks/docs/common-pitfalls#duplicate_execution) include duplicate execution. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) can also rerun. | Persist job attempts and idempotency outside provider calls. Never invoke Gemini inside a transaction or rely on exactly-once queue delivery. Deployment infrastructure remains deferred. |

The model's existing text-review success does not establish plan-recognition accuracy, multimodal tool reliability, scene-generation latency or graphics performance. Those require the new evaluation gates.

## Product patterns worth adopting

| Primary source | Observed pattern | Proposed use |
| --- | --- | --- |
| [Sweet Home 3D user guide](https://www.sweethome3d.com/users-guide/) | A known distance calibrates an imported plan; 2D and 3D remain connected; aerial and visitor views serve different tasks. | A short check against the source before the whole-home reveal; explicit Overview, Inside and Plan modes. |
| [Floorplanner personal workflow](https://floorplanner.com/personal) | Uploaded drawings, scaling, dimensional editing and 3D exploration coexist. | Keep numeric controls available beside direct visual manipulation. |
| [Planner 5D upload guidance](https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan) | Distinguishes suitable floor plans from perspective images; recognition includes selection and correction. | Explain accepted inputs with a preview. A room photo becomes a room reference, not an implicit measured plan. |
| [SketchUp scenes](https://help.sketchup.com/en/sketchup/creating-scenes) and [walking](https://help.sketchup.com/en/sketchup/walking-through-model) | Named views preserve useful positions; placing a camera, looking and walking are different actions. | Room bookmarks, matched-angle comparison and explicit walkthrough entry/exit. |
| [Matterport Showcase introduction](https://matterport.com/matterport-academy/intro-to-showcase/intro-to-showcase) | Whole-space, floor-plan and inside navigation orient visitors. | Begin with the entire home, then let the homeowner choose a room. Do not imply our scene is a measured Matterport scan. |
| W3C [dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [keyboard access](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) and [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Non-drag pointer alternatives and keyboard access are separate needs; interaction motion can need disabling. | Tap-to-place, explicit move/rotate buttons, numeric properties, a semantic object list and instant viewpoint transitions. |

These are workflow observations, not competitive performance claims. The proposed advantage is a source-linked connection from a visual change to discussion, a reviewed scope item and a preserved proposal revision. Demand and ease of use still need observation with actual designers/homeowners.

## Implementation approaches compared

| Approach | Role | Decision |
| --- | --- | --- |
| Reviewed graph + procedural shell + curated GLB furniture | Stable IDs, known dimensions, edit history and deterministic exports. | Recommended core. It needs real geometry/correction work, but matches the product's evidence requirements. |
| [Blueprint3D Modern](https://github.com/charmlinn/blueprint3d-modern) | MIT reference for plan editing and snapping. Its own roadmap leaves important features incomplete. | Inspect algorithms and UX; do not treat it as a complete whole-home engine or copy it wholesale. |
| [FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d) | Offline conversion experiment using Python, Blender and OpenCV, with documented detection limits. | Separate optional spike. GPL-3.0 and its [older pinned dependencies](https://github.com/grebtsew/FloorplanToBlender3d/blob/master/requirements.txt) require adoption review. Not a default runtime dependency. |
| [CubiCasa5K](https://github.com/CubiCasa/CubiCasa5k) | Segmentation research and evaluation reference. | Its [CC BY-NC licence](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE) is not an unrestricted commercial asset/data licence. Do not silently bundle its data or trained outputs into the product. |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) | Individual object reconstruction; documented defaults require approximately 6 GB VRAM. | Possible later decoration pipeline. Inferred meshes do not verify building dimensions. |
| [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | Generated object assets; official setup specifies Linux and at least 24 GB NVIDIA GPU memory. | Optional later service evaluation; unsuitable as an assumed capability of this local Windows stack. |
| Raster image generation | Material concepts, mood boards, catalog presentation art and optional illustrative views. | Useful companion. A generated render remains visibly separate from the saved editable scene; it cannot silently alter dimensions or become the walkthrough. |

No converter, GPU model or 3D library was installed or benchmarked during this planning stage. Do not infer suitability from a demo screenshot alone.

## Asset strategy

Start with a small authored collection of approximately 24 consistent furnishings, plus procedural architectural pieces. Record provenance and verified dimensions for every admitted item. The [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) offers CC0 furniture suitable for a lightweight baseline; [Poly Haven's asset licence](https://polyhaven.com/license) covers CC0 models, materials and HDRIs. Website renders and other site content are separate. Download and normalize a deliberate selection instead of copying web screenshots or making room load depend on a third-party catalog API. A future live Poly Haven integration must follow its [current API terms](https://polyhaven.com/our-api).

Use [glTF Transform](https://gltf-transform.dev/cli) to inspect and optimize selectively, retaining separate editable objects. Check geometry and texture memory as well as transfer size; [Three's texture guide](https://threejs.org/manual/en/textures.html) explains why a small compressed image can consume substantial GPU memory. Validate GLBs with the [Khronos validator](https://github.com/KhronosGroup/glTF-Validator). Generate our own thumbnails from the exact admitted geometry so the catalog matches what users place.

Exports need a fresh scene assembled from the canonical document. The [Three exporter](https://threejs.org/docs/pages/GLTFExporter.html) has visibility-related defaults; exporting the current cutaway display directly can omit parts of the home. Project JSON retains editing semantics; GLB is an interoperable derived view, not the full project database.

## Security and operating evidence

Follow [OWASP's file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): permit only required formats, verify decoded content, cap bytes/pages/pixels, generate storage names, isolate parsers and authorize retrieval. Model-visible text inside an image or PDF stays untrusted evidence. Catalog IDs, source references and typed operations prevent it from becoming arbitrary executable instructions.

The [implementation plan](spatial-home-studio-plan.md) links these risks to concrete controls and tests. All latency, accuracy, correction-effort and frame-rate numbers there are acceptance targets to measure, not achieved results. No plan upload, paid model request, cloud resource change, outreach or deployment occurred during this research.
