# Who controls what

Cross-cutting across [v1](v1.md), [v2](v2.md) and [v3](v3.md). Related: [release map](README.md)

**Principle: every setting names the problem it solves and has a safe default. No setting exists to demonstrate flexibility.**

A designer who never opens settings gets an autonomous crew: it answers the homeowner, researches, builds the home, updates the brief and saves reversible working options. New client-facing project activity is shared with that studio by default; professional notes remain private. **Defaults are the product; settings exist for the cases where the default is wrong for this particular person.**

Three rules the tests must prove: **the crew cannot expand an audience, commit a price or structural change, or bypass project permissions and user locks.** Automatic replies and working-option updates within the established project audience need no per-action approval.

---

## The designer

| Real problem | What they control | Safe default | Release |
| --- | --- | --- | --- |
| *"I can't watch this all day, but I can't let it loose either."* | **Autonomy per action class** — answer in the project, research, build 3D, maintain the brief, and edit working options can be `auto` or `preview for me`. Commercial commitments, structural changes, external sending and audience expansion remain `always me`. | Routine work is `auto`: validated edits save to a working option with compare/undo. No Apply for every edit. | v2 |
| *"It must never quote a number I haven't agreed."* | **Pricing authority** — no client-facing prices, or permitted indicative rate-card figures. The crew can prepare commercial drafts from authorized sources; confirmation and formal sharing remain human actions. | No client-facing prices until configured; no invented rates. | v2 |
| *"Bad leads waste more of my time than no leads."* | **Intake qualification** — service area, minimum budget band, project types I take. Out-of-scope enquiries are declined politely or captured and flagged, not pushed at me as if they were work. | Capture and flag. Never auto-decline. | v2 |
| *"How much is this costing me?"* | **Budget caps** per month and per conversation, with an explicit exhausted-action: queue for me, tell the client I'll follow up, or stop. Visible spend per conversation. | A conservative monthly cap; on exhaustion, queue for me. | v2 |
| *"I want to know when to step in — and not before."* | **Handoff triggers** — structural change, commercial decision, explicit request for a person, or an unresolved blocker. An escalation creates a queue item; it does not stop independent routine work. | Plan upload and ordinary edits continue automatically. Actual takeover pauses public replies and scene commits; private analysis may continue within budget until explicit Resume assistant. | v2 |
| *"It should sound like me."* | **`designer-voice`** skill — editable, versioned, revocable, in their private namespace. | A neutral house voice until they write one. | v2 |
| *"Don't imply I'm sitting here at 11pm."* | **Availability** — the crew states honestly when a human reply will realistically come. | Says a person will reply; never implies immediacy. | v2 |
| *"First proposals shouldn't look generic."* | **House style defaults** — the materials and finishes they actually use. Later, their own catalog through a vendor MCP server. | The admitted CC0 catalog. | v2 / v3 |
| *"Prove the crew didn't do something odd."* | **Fleet Ribbon and `AgentTrace`**, plus a daily digest: what the crew did, what it declined, what is waiting on me. | Ribbon on; digest opt-in. | v2 |
| *"Units and tax."* | mm or ft, INR, GST treatment. | mm, INR, and **no tax added silently, ever**. | v3 |

**Autonomy follows the consequence of the action.** The crew completes routine work and requests clarification only for missing information that blocks it. It can cite permitted indicative rates, but the designer confirms commercial terms and explicitly shares formal proposals. Source calibration is distinct from proposing a structural alteration. Selecting a working option records a design preference, never a signature or commercial approval.

---

## The homeowner

| Real problem | What they control | Safe default | Release |
| --- | --- | --- | --- |
| *"I don't want an account just to ask a question."* | Anonymous identity for cloud persistence; optional Google linking keeps access across devices. | Guest access on this browser; cloud saving is labelled accurately. | v1 |
| *"Where does my floor plan end up?"* | **Visible project audience** — entry explains that messages, uploads, options and decisions are available to this studio. Existing-room images and inspiration have explicit roles. | Shared with project members and task-authorized agents; no public access. Existing private records retain their grants. | v2 |
| *"My phone can't run this."* | **Quality mode** — auto, smooth, or plan-only. When the device struggles it says so and drops to plan view instead of freezing. | Auto, with an honest downgrade notice. | v1 |
| *"Am I talking to a person?"* | Nothing to configure — the crew is always labelled, and **get a human** is always available. It creates a *Needs you* item rather than promising a call. | Always labelled; the button is always present. | v2 |
| *"I want to try things without committing."* | Shared working options with compare, undo and **Use this option**. **Keep this** locks an object or material against agent changes. | Reversible and visible to the studio; choosing an option is not a commercial commitment. No new private scratchpad in v2. | v2 |
| *"Remember what I like."* | Preferences are saved automatically within the project, with edit/forget controls. **Remember for future projects** opts into reuse within this studio. | Project-scoped; no cross-project reuse without opt-in and no cross-studio reuse. | v2 |
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

| | Designer | Homeowner (including signed-in guests) | Crew | Unauthenticated visitor |
| --- | --- | --- | --- | --- |
| New project's client-facing revisions and working options | full | read and edit permitted working options | scoped tools; validated working-option commits | — |
| Frozen scene snapshot | read if granted | read if granted | via authorized bundle only | — |
| Project plans and reference photos | read if project member | upload/read in own project | role-relevant images via authorized bundle | — |
| Professional notes | owning designer only | — | only for an authorized private task; no client-facing disclosure | — |
| Existing private records | existing grants only | existing grants only | existing task grants only; no audience expansion | — |
| Private rate-card records | owning designer | — | task-scoped; cite only if permitted, never commit a price | — |
| Agent traces | project-authorized projection | own project's public progress and artifacts | append through API; scoped task context | — |
| Routine replies and working-option updates in the established audience | yes | yes | automatic | — |
| Expanding an audience or sharing a formal proposal | explicit authorized action | — | **never** | — |
| Wall or opening changes | yes | request only | propose only | — |
| Export | authorized project content | authorized client-facing scene/change sheet and shared proposal | prepare through scoped tools; no external sending | — |

Extend the shared authorization layer rooted in `assertOwner` in `backend/src/store.ts` and `memberRole` / `requireDesigner` in `backend/src/room-domain.ts` with studio/project grants; do not scatter checks across agents. A foreign ID returns 404; a known member lacking an action permission may receive 403. Traces, summaries, memories and exports inherit source audiences and never expose private professional content through derived output.

---

## Required tests

Every cell of the matrix, plus:

- The [v2 defaults](#the-designer) hold for a designer who never opens settings.
- Changing an autonomy class takes effect on the next task and cannot be changed by the crew itself.
- A budget cap cannot be reset by creating a new conversation, option or request ID.
- An authorized reference image can drive an automatic working-option edit; another project cannot retrieve it directly or through traces, summaries or memory.
- Compare/undo/Use this option works without per-edit Apply; locked objects and materials cannot be changed by an agent.
- Takeover rejects stale public replies and scene writes; Resume assistant uses fresh context. Private analysis cannot appear in client-facing output.
- Preference edits/deletion invalidate derived memory and caches; cross-project recall requires opt-in within the same studio.
- Pricing authority set to *no client-facing prices* survives a direct request from the homeowner to state one.
- The kill switch removes a role from dispatch without restarting other services.
