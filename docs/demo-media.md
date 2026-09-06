# Public walkthrough media

The user requested the reviewed video and useful images in the public README on September 6, 2026. The media is included in the repository and served by the existing application under `/demo/`; no additional hosting service is used.

| Asset | Origin |
| --- | --- |
| [walkthrough.mp4](../frontend/public/demo/walkthrough.mp4) | The previously reviewed, passing live production narrative. Copied without re-encoding or further editing. |
| [walkthrough-poster.png](../frontend/public/demo/walkthrough-poster.png) | The reviewed final video frame showing the reopened home in both participant views. |
| [Home previews](../frontend/public/homes/) | Existing deterministic renders of the canonical floor plans, already used by the application. |

The video is **175.60 seconds**, H.264 MP4, **1904×1080**, 25fps, without audio, and **5,764,582 bytes**. SHA-256: `e5f904c18f57b28325f732bb5fcfa45f8f2ee8a543ee719b1d940fc3b45ae0be`.

It records the application at `f5986336a6ceb061f4b0017b1b574fdff325c70e` with the passing capture harness at `6b41b221aee005d1fb2a2c61ad1b3262d5741c61`. That production run passed two tests: a no-model three-home/access baseline and the three-job Gemini narrative. Full source provenance and later release verification are in [V1 verification](v1-verification.md).

The designer and homeowner are distinct authenticated synthetic demonstration identities. Actual pointer movement, click ripples and role labels are capture overlays. Invitations were masked before rendering; no browser chrome, invitation fragments, credentials or real customer content are included.

The presentation retains original timing with no internal cuts. The only trim removes 1.76 seconds of final screenshot cleanup. Brief screenshot resizing at 27.32–27.76, 100.80–101.12 and 144.88–145.16 seconds, and actual partial-wall redraw around 98–110 seconds, remain visible. Settled geometry and reopened scenes passed separate renderer checks. The original recordings remain private and unmodified.

The public player uses native controls, chapter buttons and a full text alternative for the silent recording. It does not create an account, load the design engine or make model/API requests. The video is not fetched until playback is requested. The download remains available independently of the chapter script.

Source attribution for local models and fonts remains in the existing catalog admission records and [font licenses](../frontend/public/fonts/README.md). These are actual product captures, not generated marketing mockups.

## Public presentation verification — September 6, 2026

Nine distinct headed Playwright checks passed across 1440, 390 and 320 pixel widths: lazy loading and all six chapter seeks with keyboard/touch, native playback, and a deliberately missing-video response with a readable error and intact transcript. The downloaded bytes matched the published SHA-256 at every width. Axe reported zero violations, with no horizontal overflow, JavaScript errors, external requests or application/model API calls.

Results span three focused runs rather than a single clean nine-test run: the core checks passed in `public-walkthrough-llREwI`, native playback in `public-walkthrough-91ucAR`, and the repaired source-error checks in `public-walkthrough-xxSdW0`. Earlier native-control test-coordinate mistakes and the real nested-source error failure remain in the ignored local evidence. The fix captures the source element's error event so native playback failure is announced.

The README and player were also reviewed visually through Playwright MCP on desktop and mobile. All 68 local documentation/player references resolved, all three floor-plan images decoded at 720×520, and the submission description measured 939 characters. Scoped JavaScript syntax/lint, the repository public-content scan and whitespace checks passed. These static presentation checks supplement the separately recorded application and live Gemini verification; they do not claim another paid-model rehearsal.
