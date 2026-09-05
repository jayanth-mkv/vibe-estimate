# VibeEstimate frontend

Next.js App Router with TypeScript, React, Tailwind CSS, shadcn/ui, and the Firebase client SDK. The backend verifies Firebase ID tokens and owns all project persistence and proposal calculations. This frontend has no Gemini credentials.

## Official setup provenance

The project configuration comes from the official `create-next-app` App Router + Tailwind + TypeScript + ESLint + `src/` template. The temporary scaffold lives in ignored `.scaffold/vibeestimate`; its package versions, TypeScript options, PostCSS plugin, and ESLint configuration were integrated into this application while preserving the working review UI.

The exact successful generator arguments were:

```text
create-next-app .scaffold/vibeestimate --typescript --eslint --tailwind --app --src-dir --import-alias @/* --use-npm --skip-install --disable-git --yes
shadcn init --base radix --preset nova --no-monorepo --yes --no-rtl --no-reinstall
shadcn add button input textarea alert-dialog --yes
```

Use the checked-in, project-local tools for future component generation. CLI package downloads and preferences are kept in the root `.cache` directory; no global installation is required. shadcn owns the generated `components.json` and `src/components/ui` source, while application-specific colors and composition remain in `globals.css`.

References: [Next.js create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app), [shadcn Next.js installation](https://ui.shadcn.com/docs/installation/next).

## Local use

Run the root setup and development commands described in the repository README. They provide the demo Firebase configuration, start the emulators, and run frontend/backend processes. For the frontend alone, with the environment already supplied:

```text
rtk npm run dev --workspace @vibeestimate/frontend
rtk npm run typecheck --workspace @vibeestimate/frontend
rtk npm run lint --workspace @vibeestimate/frontend
rtk npm run build --workspace @vibeestimate/frontend
```

The browser is `http://127.0.0.1:3000`; the API is `http://127.0.0.1:8080`. `.env.example` contains demo values only. Actual deployment configuration stays outside the public checkout and must be injected when building, because Next.js public environment values are embedded at build time.

## First workflow

1. Choose **Open local workspace**. This creates a real anonymous Firebase Auth emulator session persisted in the browser.
2. Choose **Try the lighting example**, then **Review scope and messages**.
3. Inspect included work, proposed additions, open questions, and source excerpts. **Add a clarification** submits another turn.
4. Enter the proposed work, quantity, and confirmed unit price. Six lights at ₹2,000 produces a ₹12,000 draft.
5. Choose **Save draft**, change the quantity to four, and choose **Save revision**. The current draft becomes ₹8,000 while the previous version remains visible.
6. Reload the page to check persistence, then choose **Download draft** for an authenticated plain-text export.

The sample is explicitly fictional and fixture output is explicitly labeled. Connect live Gemini before representing this as an AI demo. Source text is preserved; a later analysis supersedes existing drafts and requires a fresh reviewed draft. Owner review does not collect client approval.

Signing out of the anonymous local session ends access through that session. A new anonymous sign-in creates a different owner; production uses Google sign-in for a recoverable account.

## Browser verification contract

Stable route: `/`, with `?project=<id>` for the selected project. Use accessible names instead of brittle DOM selectors. Main controls include **Try the lighting example**, **Review scope and messages**, **Add a clarification**, **Update review**, **Save draft**, **Save revision**, **Download draft**, **All projects**, and **Sign out**. Draft inputs are **Proposed work**, **Number of display lights**, and **Confirmed unit price (₹)**.

Root Playwright tests own full integration coverage with real emulator authentication. Inspect desktop/mobile layouts, keyboard focus, visible error recovery, draft revisions, downloads, and cross-user denial. Tests and visual inspection results must be recorded after execution, not inferred from this checklist.

Initial integration checks: standalone TypeScript check, the official Next.js ESLint configuration, and `next build` passed. Subsequent browser findings belong in the root verification report. The production build uses supplied build-time environment values; building successfully does not verify a live Gemini request or a cloud deployment.
