# Home-to-agreement recording walkthrough

The story: a designer and homeowner should be able to see what they mean, change the same home, and leave with a clear saved record. Use synthetic project content for the demonstration. Announce whether the provider is live Gemini or the labelled local fixture; never describe fixture output as live inference.

Run `rtk npm run start:v1` for an isolated fixture rehearsal, or pass the existing private --gemini-config for an authorized live rehearsal. Open http://127.0.0.1:3100. The headed browser suite records flows, screenshots and actual Pascal geometry under .cache/v1/. Final evidence is indexed in the verification report after execution.

## Synchronized two-person capture

Local live Gemini verification stays headed and retains geometry/screenshots but disables video: the recorded-browser workload on this Windows host reproducibly stalls the local profile CLI. Deterministic videos and the separate production live capture remain enabled. Final live footage uses the verified deployment's server identity.

Install the pinned repository-local encoder with `rtk proxy node scripts/v1-video-tools.mjs`. With the isolated fixture preview ready, run `rtk proxy node scripts/v1-video-record.mjs`. It uses separate designer and homeowner identities, displays role labels and pointer/click indicators, masks invitation details before capture, and checks both chat directions and the saved agreement. It refuses a live or unexpected target.

Run `rtk proxy node scripts/v1-video-compose.mjs --manifest <story-directory>/dual-capture.json` on the completed story. The resulting `designer-homeowner.mp4` presents desktop and mobile side by side at their actual synchronized timing. Original clips, synchronization measurements, hashes and source mode remain in the evidence directory. A completed production rehearsal supplies the same manifest format and uses the same compositor; it is a separate live recording.

The reviewed live delivery is now included as [the public walkthrough video](../frontend/public/demo/walkthrough.mp4), with a [hosted player and transcript](https://vibe-estimate.xplormity.com/demo/index.html). Its 2:55.60 sequence includes actual Gemini, separate identities, both chat directions, exact design decisions, identical agreement downloads and reopening. [Media provenance](demo-media.md) records the original capture and unchanged file hash; the [verification record](v1-verification.md) identifies the passing production run and preserved private footage. The public README inclusion was requested separately. Social posting and form submission remain unperformed.

## 1. An idea becomes a home

Open **Your homes → New project**. Choose **Family home**. The measured single-floor layout appears immediately, with authored furniture and assumed ceiling height disclosed. Show **Plan**, then **Overview**. Enter “Add warm ceiling lights throughout the home” and choose **Generate design**. Wait for the saved result and explain the concrete changes. Repeat with **City apartment** and **Home with a study** to show every advertised layout works.

The assistant supplies the title and design description. Existing walls, openings and selected scope constrain its response.

## 2. See and adjust the lights

Choose **Evening**, select **Living & dining**, then open **Inside**. Show the real ceiling pendants and their effect on the room. In **Edit**, choose one light, switch it off and apply its settings. Turn it back on or use **Undo**. Lighting is illustrative; dimensions and electrical specifications still need confirmation.

## 3. Make one room work better

Set **Design area → Living & dining**. Ask for a smaller dining table and soft finishes while keeping the doorway clear. Inspect the changed table and unchanged neighbouring rooms in Plan and Overview. Use **Edit → Position and size** for a precise adjustment. An invalid move into another object shows a readable error and preserves the last saved design.

## 4. Choose the exact surface

Select a shared wall face in **Edit selection** or by picking it in the view. Ask “Make this wall warm clay and keep the rest as it is.” Show the changed room-facing surface, then inspect the opposite side. A shared wall is not permission to change both rooms.

## 5. Keep a useful saved option

Open **Options → Compare starting layout** and return to the current design with the same camera. Reopen the project from **Your homes** and demonstrate that its saved version survives reload. Prepare and download the design summary and floor-plan PNG.

Keep the failure rehearsal in test evidence: a model error preserves the scene, retry is explicit, and finishing a staged save makes no new model call. Do not induce a paid retry just to create a more dramatic submission clip.

## 6. Designer, homeowner and assistant agree on the same version

From **Share**, create the prefilled design assistant, then **Create shared room**. Choose **Invite client → Create invite link → Open client demo** in local mode. The client tab uses a distinct authenticated identity. In connected mode use the offered client link; another device requires a reachable application origin.

Keep both people visible. Send a human message describing the desired atmosphere. The homeowner selects the living room and asks the assistant for a table or light change. The designer sees the same saved geometry and requests a refinement. Ordinary conversation, viewing and polling do not call Gemini; **Ask assistant** is explicit.

The homeowner chooses **Accept this design**. The designer then chooses **Approve this design**. Both decisions refer to the exact current saved revision. Choose **Generate draft agreement** and open the **Shared agreement library**. Read and download the same draft from both identities, reload, and show it remains available.

The document preserves the design revision, recorded decisions, change schedule and conversation references. It is a draft for review, not a legal signature or permission to begin work. A later change requires fresh decisions while retaining the older agreement.

## Retained scope and pricing story

The independent proposal workflow is at /proposals. Its fictional lighting example preserves source-linked review, clarification, owner-entered commercial terms, integer-money totals, revisions and private export. Use it if the video needs the next commercial step. AI must not invent an agreed scope, client approval, rate or saving to prefill that record.

End the main recording with the saved shared agreement and a clear next step. Upload extraction and the wider agent service crew are later work.
