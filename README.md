# VibeEstimate

Choose a complete home, describe your ideas, and explore the saved design together. Gemini selects from admitted furniture, lights and finishes; deterministic geometry checks keep each change inside its selected area. A designer and homeowner can share the same home, refine it through chat, review an exact saved version, and keep its draft agreement in one shared library.

The primary journey is **New project → Choose a home → Generate design → Design together → Accept and approve → Download draft agreement**. Descriptive briefs and agreement drafts are prepared for review. Prices, legal signatures and permission to start work are never inferred by AI.

The existing source-linked scope and pricing workflow remains at /proposals. /studio redirects to the home library. The independent Pascal proof of concept remains outside this checkout; the application retains frontend/, backend/ and reusable scene packages.

## Try locally

Requires Node.js 22.17+, Java 21 and a browser-capable desktop. Dependencies, browser binaries, emulators and generated reports stay inside this checkout.

~~~sh
rtk npm ci
rtk npm run setup
rtk npm run build
rtk npm run start:v1
~~~

Open **http://127.0.0.1:3100**. This runner builds a fresh production frontend and starts the API on 8181, Auth emulator on 9299 and Firestore emulator on 8285. It refuses occupied ports and preserves the connected development environment on 3000/8080.

The default provider is an explicitly labelled deterministic fixture. It exercises the complete interface and persistence without paid model calls or production Firebase data. Use the supplied prompt suggestions in fixture mode. Arbitrary requests require the real Gemini provider; a model failure is never replaced by a fixture response.

For separately authorized live Gemini with isolated local identities and storage:

~~~sh
rtk npm run start:v1 -- --gemini-config ../docs/private/vertex-local.json
~~~

The configuration must be an existing private operator file, outside this public repository. See [local setup](docs/local-setup.md) and [connected setup](docs/connected-setup.md) for the separate connected Firebase workflow.

## The six demonstration flows

1. Create and generate a design in each of the three complete home layouts.
2. Add ceiling lights throughout a home; inspect actual lighting inside and adjust one lamp.
3. Refine one room, including a table, while neighbouring rooms remain unchanged.
4. Change one shared wall face and verify the opposite face is preserved.
5. Recover from a failed request, compare saved options, reopen and export the design.
6. Invite a separate homeowner identity, make chat changes together, accept and approve one version, then store and download its draft agreement.

Follow the [recording walkthrough](docs/demo-walkthrough.md). The [v1 plan](docs/plan/v1.md) defines acceptance gates and current scope; the [API contract](docs/v1-home-contract.md) describes persistence and collaboration. Historical PoC and production evidence remains labelled with the version it tested.

Home templates are authored concept layouts with disclosed assumed ceiling heights. Catalog models are local assets with bounds and admission records. Lighting is illustrative and does not model wall occlusion. Upload extraction, additional floors and the wider agent service architecture remain later work; the interface does not advertise unavailable actions.

## Verify

~~~sh
rtk npm run verify:v1
~~~

This command runs configuration/startup checks, typecheck, lint, frontend/backend and geometry tests, production build, Firebase Rules, headed desktop/mobile browser journeys, legacy proposal regressions, public-content scanning and offline Terraform checks. The browser stage starts its own empty local stack and saves screenshots, renderer reports and videos under .cache/v1/.

Live inference is a separate bounded rehearsal. It runs five explicit model jobs, at most two reserved provider attempts each, with no test retries:

~~~sh
rtk npm run test:v1:browser -- --gemini-config ../docs/private/vertex-local.json
~~~

A fixture pass establishes deterministic behaviour, not live model accuracy. A local pass also does not establish deployment readiness: the exact deployed Git SHA and production journeys require their own evidence. See [verification records](docs/verification.md) and [build provenance](docs/ai-studio-evidence.md).

Verify an already-built local production image with `npm run test:v1:container -- --image <local-tag> --expected-sha <embedded-full-commit> --context <local-docker-context>`. The probe starts only its own containers, disables networking and uses synthetic configuration. It checks both servers, local assets, authentication denial and failure before server startup when production settings are missing.

## Project structure

| Path | Responsibility |
| --- | --- |
| frontend/ | Next.js App Router, shadcn/ui, home and shared-room interfaces |
| backend/ | Verified Firebase identity, ownership, immutable revisions, bounded Gemini jobs and money |
| packages/scene-schema/ | Strict versioned scene, patch, selection and catalog contracts |
| packages/scene-core/ | Renderer-independent geometry, scoped changes and deterministic descriptions |
| packages/pascal-adapter/ | Pascal rendering mirror, native selection and actual geometry inspection |
| infra/ | Terraform infrastructure and runtime release configuration |
| tests/ and scripts/ | Local tools, security and browser verification, recordings |
| PRODUCT.md / DESIGN.md | Confirmed product context and interface decisions |

## Automatic deployment

One Cloud Run image serves the frontend and API on the same origin. The Terraform-managed GitHub main trigger checks the source, builds an immutable image and applies the runtime plan. Follow the [deployment guide](docs/deployment.md); account/project values and Terraform state stay in private operator configuration.

The repository is the authentic agent-assisted build record for the submission. Publication, outreach and submission are separate activities. The app does not collect legal signatures or payments, and does not claim verified savings.
