# Local walkthrough

This is a fictional scenario for rehearsing the product flow. The default run uses a deterministic fixture; it is not a live Gemini demonstration.

This walkthrough describes the workflow **as it exists today**. The demonstration the product is being built towards — a homeowner uploading a plan on a designer's site, the crew revealing their home in 3D, and the designer reviewing a change card in a console — is specified separately in [v2](plan/v2.md#the-demonstration) and is not implemented.

Start with: "Asha thinks lighting was included. Her designer agrees about the kitchen strip, but the conversation also contains four display lights, then six. They need a clear decision before either person treats a message as a bill."

1. Open the home workspace and choose **Try the lighting example**. A guest identity supports private saving without a login form; the original agreement and conversation stay together. The illustrated product tour is still available at `/welcome`.
2. Choose **Review scope and messages**. Point to the exact excerpts: the kitchen strip is included, display lights are excluded, the supplied rate is ₹2,000, and the quantity still needs an answer.
3. Expand **Add a clarification**, enter **Quote 6 lights**, and choose **Update review**. This specifies a draft option; it does not collect client approval.
4. Choose **Continue to draft**, enter quantity **6** and unit price **2000**, then save the **₹12,000** draft. The app calculates this subtotal in integer paise; kitchen lighting is outside the extra-work total.
5. Say: "Now Asha wants the smaller option." Change quantity to **4** and save the **₹8,000** revision. Both versions remain visible. This difference is a changed scope, not a claimed saving.
6. Reload the page and download the saved draft. Point out the approval status and source evidence retained with the project.

To use your own sources, choose **Start a project**. First name it and paste the agreed scope; continue to client messages. Back preserves your text. Source persistence happens on **Save project**. The project then guides you through Review and Draft, while returning visits show each saved project's next step. In connected mode, **Save access with Google** optionally links the guest identity so its work can be reopened across devices.

For a real submission, repeat the flow with live Gemini enabled and show a context-dependent follow-up. Retain genuine AI Studio enhancement history, deployed authentication/persistence checks, and Cloud Run evidence. A local fixture cannot substitute for those requirements.

The product's useful difference is the connected workflow: evidence, ambiguity, owner-entered commercial terms, safe revisions, and private persistence. Whether that is valuable enough for designers to adopt needs interviews and actual usage; a generic chat response or a fictional demonstration does not establish demand.

## Shared-room demonstration

1. From home, choose **Try a shared room**. It creates a fictional lighting project and its designer room.
2. Choose **Invite client**, **Create invite link**, then **Open client demo** (or **Open client view** in connected mode). Keep both tabs visible. Alternatively, copy the room code, open **Join a room**, and enter it. The second tab is a separately authenticated client; room membership is enforced by the API. The QR encodes the same invitation and needs a reachable workspace address for another phone.
3. In the client tab, send **Could we quote 6 display lights?**. The designer receives it, and the agent checks the conversation after messages settle. The fixture labels this as a local sample; live Gemini uses the configured real model.
4. In the designer tab, send **I will prepare a draft for 6 display lights at ₹2,000 each.**. Wait for the current review. On mobile, use **Scope agent** to see the findings and their original source quotes.
5. Choose **Prepare draft**, then **Continue to draft**. Enter 6 lights at 2000 and save. The room transcript is frozen into this private project; original messages stay unchanged.
6. Choose **Back to room**, then **Share saved draft** (under **Drafts** on mobile). The client's **Drafts** tab now shows the saved ₹12,000 version, with approval uncollected.
7. Open the private draft workspace, change quantity to 4 and save a revision. Return and share it. Both people see the ₹8,000 version and the previous ₹12,000 shared version. Reload both tabs; download/export stays in the designer workspace.

The source context, conversation and saved draft are visible together on a wide desktop. The client has a focused chat/review/draft view and cannot change the designer's prices or access private projects. Each room has a ten-review limit and an explicit pause/retry control. Ordinary polling never invokes Gemini. Use the supplied demo suggestions in fixture mode; arbitrary messages require Gemini. A room keeps the provider mode in which it was created, so create a new demonstration room after switching from fixture to live mode.
