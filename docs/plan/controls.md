# Who controls what

Cross-cutting across [v1](v1.md), [v2](v2.md) and [v3](v3.md). Related: [release map](README.md)

**Principle: every setting names the problem it solves and has a safe default. No setting exists to demonstrate flexibility.**

A designer who never opens settings must still get a crew that is safe on day one — nothing sent without them, no price ever stated, the client's plan private. **Defaults are the product; settings exist for the cases where the default is wrong for this particular person.**

Three rules the whole document encodes, and the tests must prove: **the crew can never share, never set a price, and never read an unsubmitted client attachment.**

---

## The designer

| Real problem | What they control | Safe default | Release |
| --- | --- | --- | --- |
| *"I can't watch this all day, but I can't let it loose either."* | **Autonomy per action class** — not a global slider. Answer general questions · build the 3D home · propose furniture and material changes · send anything to the client · state a price · change a wall. Each is `auto`, `preview for me`, or `always me`. | Answer, build and propose are `auto` and preview-only. Send, price and wall changes are `always me`. | v2 |
| *"It must never quote a number I haven't agreed."* | **Pricing authority** — the crew never states a price, or may cite my rate card as indicative, or may quote from my rate card. Plus the rate card itself. | Never states a price. | v2 |
| *"Bad leads waste more of my time than no leads."* | **Intake qualification** — service area, minimum budget band, project types I take. Out-of-scope enquiries are declined politely or captured and flagged, not pushed at me as if they were work. | Capture and flag. Never auto-decline. | v2 |
| *"How much is this costing me?"* | **Budget caps** per month and per conversation, with an explicit exhausted-action: queue for me, tell the client I'll follow up, or stop. Visible spend per conversation. | A conservative monthly cap; on exhaustion, queue for me. | v2 |
| *"I want to know when to step in — and not before."* | **Handoff triggers** — the client mentions budget · uploads a plan · requests a structural change · asks for a call · repeats themselves. Each independently on or off. | Plan upload, structural change and call request on. | v2 |
| *"It should sound like me."* | **`designer-voice`** skill — editable, versioned, revocable, in their private namespace. | A neutral house voice until they write one. | v2 |
| *"Don't imply I'm sitting here at 11pm."* | **Availability** — the crew states honestly when a human reply will realistically come. | Says a person will reply; never implies immediacy. | v2 |
| *"First proposals shouldn't look generic."* | **House style defaults** — the materials and finishes they actually use. Later, their own catalog through a vendor MCP server. | The admitted CC0 catalog. | v2 / v3 |
| *"Prove the crew didn't do something odd."* | **Fleet Ribbon and `AgentTrace`**, plus a daily digest: what the crew did, what it declined, what is waiting on me. | Ribbon on; digest opt-in. | v2 |
| *"Units and tax."* | mm or ft, INR, GST treatment. | mm, INR, and **no tax added silently, ever**. | v3 |

**Why autonomy per action class rather than a slider.** A single "how autonomous?" control forces a solo designer to choose between an agent that is useless and one they cannot trust. The real question is not *how much* but *which things* — and the honest answer is that answering questions and building a 3D home are safe to automate, while sending a message, stating a price and moving a wall are not. Splitting the control along that line is what makes the product usable without supervision.

---

## The homeowner

| Real problem | What they control | Safe default | Release |
| --- | --- | --- | --- |
| *"I don't want an account just to ask a question."* | Nothing — already solved by the anonymous identity. Optionally: keep my work on this device, or save it across devices through Google linking. | Anonymous; work kept on this device. | v1 |
| *"Where does my floor plan end up?"* | **Explicit sharing state, visible rather than buried** — the plan and each photo shown as shared-with-this-designer or private. Reference photos in a private option stay private until sent. | The plan is shared with the designer they are talking to, which is the point. Private-option photos stay private until sent. | v2 |
| *"My phone can't run this."* | **Quality mode** — auto, smooth, or plan-only. When the device struggles it says so and drops to plan view instead of freezing. | Auto, with an honest downgrade notice. | v1 |
| *"Am I talking to a person?"* | Nothing to configure — the crew is always labelled, and **get a human** is always available. It creates a *Needs you* item rather than promising a call. | Always labelled; the button is always present. | v2 |
| *"I want to try things without committing."* | Private options with an explicit **Send to designer**. Stated plainly: nothing here is seen until you send it. | Private. | v2 |
| *"Don't flood me."* | Notifications — when the designer replies, all crew updates, or none. | Designer replies only. | v2 |
| *"I don't know what things cost."* | A budget band **with a "not sure" option**. The crew never treats a band as a quote. | Not sure. | v2 |
| *"The interface fights me."* | **Reduced motion, larger targets, keyboard-first and plan-only as real settings**, not only OS media queries — someone may want them regardless of their system setting. | Follow the OS, overridable. | v1 |
| *"I want to write in my own language."* | Language preference; evidence preserved verbatim in the original. | Follow the browser. | v3 |

---

## The operator

Operational controls, not product surface:

- Per-tenant model budget and rate limits.
- A **kill switch per agent role**, so a misbehaving Sourcer can be disabled without a redeploy.
- Prompt and skill version pinning per tenant, with rollback.
- The existing fail-closed provider gate in `backend/src/config.ts`, which must reject any new provider, transport or service that has not been added to it.

---

## Access matrix

Enforced server-side on every route. This is a security artifact, not a description of the UI. Rows are what exists; columns are who may reach it.

| | Designer | Homeowner | Crew | Anonymous visitor |
| --- | --- | --- | --- | --- |
| Their own scene revisions | full | — | via context bundle only | — |
| Shared scene snapshot | full | read | via context bundle only | — |
| Original plan file | read | read (their own upload) | Surveyor only, via bundle | — |
| Client's unsent private option | — | full | via bundle, that client's tasks only | — |
| Client's unsubmitted photos | **no** | full | no | — |
| Rate card and prices | full | — | cite only if permitted; never set | — |
| Agent traces | own tenant | — | write own | — |
| Sharing a scene or draft | yes | — | **never** | — |
| Wall or opening changes | yes | request only | propose only | — |
| Export | yes | not in v2 | — | — |

Ownership checks live in exactly two places and must be extended rather than duplicated: `assertOwner` in `backend/src/store.ts`, and `memberRole` / `requireDesigner` in `backend/src/room-domain.ts`. A foreign ID returns 404, never 403, so IDs stay indistinguishable.

---

## Required tests

Every cell of the matrix, plus:

- The [v2 defaults](#the-designer) hold for a designer who never opens settings.
- Changing an autonomy class takes effect on the next task and cannot be changed by the crew itself.
- A budget cap cannot be reset by creating a new conversation, option or request ID.
- A homeowner's private-option attachment is unreachable by the designer before submission, and only the selected versions become reachable after it.
- Pricing authority set to *never states a price* survives a direct request from the homeowner to state one.
- The kill switch removes a role from dispatch without restarting other services.
