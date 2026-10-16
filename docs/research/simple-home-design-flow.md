# Show the furnished home first, then confirm

**Verdict.** The simplest flow that also looks best opens on a **pre-furnished sample home rendered in 3D** before any sign-in. The homeowner taps style chips to restyle it. A plan upload is read by Gemini and then corrected in code. Every number the user would otherwise type becomes something they confirm with a tap or adjust by dragging. Sign-in comes when they save or share, and they come back for project events (a designer revision, a pending approval), not for a daily habit.

Three findings drive this:

- **Scale is the hard part.** No product found sets scale from nothing. Every upload flow either reads printed dimensions or asks for one reference value ([Planner 5D](https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan), [Coohom](https://www.coohom.com/helpcenter/how-to-upload-a-cad-floor-plan-from-images-or-pdf), vendor docs).
- **General VLMs are weak at metric questions.** Gemini 3 Pro scores **62% on absolute distance against 69% for humans** ([ArchSIBench](https://arxiv.org/html/2605.20837)).
- **Absolute LLM coordinates fail; relations plus a solver work.** Holodeck's constraint solver reached **0% collisions and 0% out-of-bounds** ([Holodeck](https://arxiv.org/html/2312.09067); [Architect-Ant](https://arxiv.org/html/2606.10953v2), preprint).

The largest cost cut has nothing to do with the model. It is removing the **1.5 s and 2.5 s polling**, which keeps Cloud Run instances busy and spends Firestore reads for every open tab.

## 1. Recommended flow

1. **Onboard (0 inputs).** The landing page shows a furnished sample home. The 2D plan or a poster image is the LCP element (target ≤2.5 s, [web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)), and 3D loads lazily after it. One optional question: "Homeowner / Designer". The visitor works as an anonymous Firebase guest. NN/g reports users are "rarely more annoyed" than by login walls ([NN/g](https://www.nngroup.com/articles/login-walls/)). Duolingo reports about **+20% DAU** from moving sign-up later (anecdote, [Taplytics](https://taplytics.com/blog/duolingo-ab-test-onboarding)).
2. **Plan.** The user chooses one of three furnished templates or uploads a plan, with no typed values. Gemini returns room boxes, openings and every visible text string verbatim. Code snaps the walls and fits scale from the printed dimensions and area labels.
   - The user sees one confirmation: "Living ≈ 4.2 × 3.6 m — looks right?", with drag handles to adjust.
   - If the scale cues disagree, or the plan has no numbers, the user picks from chips of total-area candidates (taken from OCR or BHK bands) or drags a known door against the plan. No typing.
   - Scale stays editable later. magicplan's locked scale is a documented complaint ([magicplan community](https://community.magicplan.app/c/ask-the-community/inaccurate-measurements-in-floor-plan-redraws)).
3. **Furnish.** Chips for style, budget band and household build a visible prompt; free text is optional. This addresses the "articulation barrier" ([Nielsen](https://jakobnielsenphd.substack.com/p/prompt-augmentation)).
   - Gemini returns relations ("bed against wall A, faces door"). A deterministic solver places items at 0/90/180/270° and rejects collisions, out-of-bounds placements and door-swing intrusions.
   - The user gets 2–3 alternatives to shuffle, and can pin or re-roll a single item. RoomGPT-style tools cannot lock one element ([Krea](https://www.krea.ai/blog/roomgpt-review-and-alternatives-in-2026)).
   - Editing is direct: drag, snap the back to a wall, rotate with `R` or a 90° tap, and see alignment guides. The 2D plan is the edit surface on phones. The mm fields move into a collapsed "Advanced" panel.
4. **Share.** "Save this home" links Google to the guest account with `linkWithPopup`, so the UID and the guest's data are kept ([Firebase](https://firebase.google.com/docs/auth/web/account-linking)). The user then invites the designer or client to the shared room.
5. **Agree.** The client approves one exact saved version. The draft agreement states scope and a bounded number of revision rounds. Unlimited revisions are a documented e-design failure ([BoH](https://businessofhome.com/articles/is-e-design-over)).
6. **Return.** Batched, event-driven notifications: "revision awaits you", "client approved v3", mentions. Figma batches comment emails every 30 minutes ([Figma](https://help.figma.com/hc/en-us/articles/360039813234)). A visible "decision pending" state also helps against client ghosting ([Design Week](https://www.designweek.co.uk/does-the-design-industry-have-a-problem-with-ghosting/)).

## 2. Top 10 changes

| # | Change | Impact | Effort | Evidence |
|---|---|---|---|---|
| 1 | Replace polling with a Firestore listener on a tiny per-room/home `version` doc | High (cost and latency) | Low–Med | Strong (architecture; savings are estimates) |
| 2 | Pre-furnished sample home as the first screen, no login wall | High | Low | Moderate (NN/g qualitative; Canva and Duolingo anecdotes) |
| 3 | Gemini emits relations; the solver places items; validators report unmet rules | High | Med | Strong (Holodeck ablation: absolute coordinates MRR 0.364 vs constraints 0.706) |
| 4 | Drag, snap and rotate replace X/Z/degree fields | High | Med | Moderate (vendor patterns; [NN/g ~1 cm targets](https://www.nngroup.com/articles/touch-target-size/)) |
| 5 | Plan import: OCR strings, compute scale in code, tap to confirm | High | Med | Moderate (vendor docs; no accuracy benchmark) |
| 6 | Style, budget and household chips plus one-tap follow-ups | Med–High | Low | Weak–Moderate (expert opinion) |
| 7 | Guest → Google account linking at save or share | Med–High | Med (security change: anonymous UIDs, quotas) | Moderate |
| 8 | Version-bounded revisions in the draft agreement | Med | Low | Moderate (trade press) |
| 9 | Batched event notifications with per-type opt-out | Med | Med | Moderate (Figma docs) |
| 10 | Editable overlay with per-element confidence before a plan is saved | Med | Med | Strong (openings are the weakest class: [FloorplanVLM opening F1 0.73](https://arxiv.org/html/2602.06507v1); [CubiCasa door IoU 53.6](https://ar5iv.labs.arxiv.org/html/1904.01920)) |

**Cut:** the explicit "create project" step (auto-name it instead), the blank prompt box as the default, typed mm/degree inputs on the main path, up-front tutorials (they lowered ease ratings, [NN/g](https://www.nngroup.com/articles/mobile-tutorials/)), any style quiz before the first result, and web room scanning (iOS Safari has no WebXR, [caniuse](https://caniuse.com/webxr)).

**Automate:** wall snapping, scale fitting, placement, clearance checks ([NKBA 914 mm walkways](https://kb.nkba.org/uploads/2022/05/Kitchen-Planning-Guidelines.pdf)), project naming and price totals.

## 3. Cost: do it differently

These are the operator's live facts. Cloud Run runs with minScale 0, request-based CPU billing, maxScale 2, concurrency 8, 2 vCPU and 1 GiB. Polling at **1.5 s (rooms) and 2.5 s (studio)** produces about **1,440–2,400 requests per tab-hour**, each costing several Firestore reads. Under request billing, every one of those requests is billed instance time, and the instance never idles out while a tab is open. All savings below are **estimates of direction**, not measurements.

| Idea | Analogy | What changes | Estimated effect |
|---|---|---|---|
| **Push, not poll.** Clients listen to one member-readable `rooms/{id}/meta/version` doc (Rules-gated) and fetch through the API only when it changes | Firestore vs an always-on DB | ~2,400 → a few requests per tab-hour; Cloud Run reaches zero between edits | Largest single cut: request volume and polling reads fall by roughly 2–3 orders of magnitude for idle tabs |
| **Browser-side solver, snapping and validation**, with the server re-validating once on save | Edge compute vs a central server | No per-drag API calls; one authoritative check per save | Fewer, shorter requests. Keeps the server-side ownership and money checks |
| **Relation JSON, not geometry**; LOW/minimal thinking | Ship intent, not data | Smaller output. Output is the expensive side ($3.75 vs $0.75 per M) ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Likely tens of percent per furnish call (estimate) |
| **Media resolution per job**: low (280 tokens) for style-reference photos; medium/high (560–1,120) only for plan OCR ([docs](https://ai.google.dev/gemini-api/docs/media-resolution)) | Right-size the input | Plan import stays about **$0.01–0.015** ([notes' estimate](https://ai.google.dev/gemini-api/docs/pricing)) | Small: input is a minor share of the bill. Do not starve OCR |
| **Content-hash cache** of plan-extraction results, plus **precomputed style kits and pre-furnished samples** served as static assets | CDN vs recompute | Re-uploads and first-run demos cost $0 in model calls | Removes the guest trial's model cost entirely |
| **Batch API (half price)** for regenerating sample kits offline ([pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Off-peak batch jobs | Non-interactive generation only | 50% on that slice |
| **Local-first guest trial** in IndexedDB; nothing is written to Firestore until "Save" | Draft locally, commit once | No Firestore writes, docs or anonymous-account churn for visitors who bounce | Removes guest storage and abuse surface |
| **Client-side downscale/compress** before upload (long edge ~1,600 px, EXIF stripped) | Compress at source | Smaller egress and request time; 20 MB inline limit is never approached | Small but free |
| **Batched notifications** via Eventarc-triggered jobs or 30-minute digests, not an always-on worker | Cron vs daemon | Scales to zero | Avoids a second warm service |
| **Analytics from log sinks or exports queried ad hoc** with DuckDB over Parquet/JSON | DuckDB vs a 24/7 warehouse | No running warehouse or BI connector | Near-zero fixed cost at this scale |

**Price change ahead.** Gemini 3.6/3.8 Flash list prices **double on 1 Jan 2027** to $1.50 / $7.50 per M tokens ([pricing](https://ai.google.dev/gemini-api/docs/pricing)). Pricing for gemini-3.7-flash on Vertex was not verified. The model-side cuts above therefore matter more after January.

## 4. What stays human-confirmed

These steps need a person to confirm them:

- **The plan.** Detected rooms, openings and scale must be confirmed before anything becomes the scene model. Small rooms and doors are the most likely misses.
- **Prices.** They come only from the owner. The model never sets a price.
- **Furnishing.** Any AI furnish or change is a proposal until it is applied and saved.
- **Approval.** The client approves an exact version and the designer's draft agreement. Owner review is never treated as client approval.
- **Messages.** Room messages and text inside images are data, not instructions. Typographic injection reached 73–100% success in one 2026 study ([arXiv 2603.03637](https://arxiv.org/pdf/2603.03637)).

## 5. Key evidence gaps

- **No benchmark covers our main plan-reading step.** Nothing measures Gemini 3.x emitting room boxes, openings or scale from user-uploaded plans. Build a 30–50-plan internal evaluation: IoU after snapping, opening recall, scale error and valid-JSON rate.
- **No conversion data for guest-first vs login-first in AI or design apps.** Duolingo and Canva figures are anecdotes.
- **No independent accuracy figures for vendors' upload recognition**, and no door-width auto-scaling in any shipped product.
- **No retention lift is measured for any feature.** Ideabooks, notifications and approvals are all unmeasured; homeowner use is episodic ([Reforge](https://www.reforge.com/blog/iced-theory-growing-infrequent-products/)).
- **Cost savings are unmeasured.** Instrument requests per tab-hour, Firestore reads and tokens per action before and after the polling change.
