import { test, expect, type APIRequestContext, type Page, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import type { Analysis, Project, ProposalInput } from "../../backend/src/types";

const api = "http://127.0.0.1:8080";
const authEmulator = "http://127.0.0.1:9099";
const synthetic = {
  scope: "Kitchen lighting: a 3m LED strip is included in the agreed scope. Display lights are excluded and require a separate draft proposal.",
  messages: "Client: Could we add 4 display lights?\nDesigner: I will confirm the unit price separately.\nClient: Maybe 6 would work better. I have not chosen the quantity yet.\nClient: Please remember the included kitchen lighting. No additional work has been approved.",
  clarification: "As the project owner, prepare the draft for exactly 6 display lights in a matte white finish. I confirm the unit price is INR 2000.50 for each display light. The included kitchen LED strip stays in the original scope and must not be charged again. This is only my draft choice; client approval has not been collected.",
  description: "Matte white display lights"
};

test.skip(process.env.LIVE_GEMINI_TEST !== "1", "Opt in with LIVE_GEMINI_TEST=1 after starting Gemini with local Firebase emulators.");

function localApiResponse(path: string, method: string) {
  return (response: Response) => response.url() === api + path && response.request().method() === method;
}

async function projectResponse(response: Response) {
  expect(response.status(), "The local API must complete the requested step successfully.").toBe(200);
  return (await response.json() as { project: Project }).project;
}

function sourceLinked(analysis: Analysis, project: Project) {
  expect(analysis.provider, "A real Gemini review is required; fixture output must fail this opt-in test.").toBe("gemini");
  expect(analysis.evidence.length).toBeGreaterThan(0);
  for (const evidence of analysis.evidence) {
    expect(["scope", "messages"]).toContain(evidence.source);
    expect(project[evidence.source]).toContain(evidence.quote);
  }
  expect(analysis.included.join(" ")).toMatch(/kitchen|LED strip/i);
  expect(analysis.proposed.join(" ")).toMatch(/display lights/i);
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function isolatedAccount(request: APIRequestContext) {
  const response = await request.post(authEmulator + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    data: { returnSecureToken: true }
  });
  expect(response.ok()).toBe(true);
  const data = await response.json() as { idToken: string };
  // Tokens are local emulator session data and must never appear in attachments.
  expect(Boolean(data.idToken)).toBe(true);
  return { Authorization: "Bearer " + data.idToken };
}

test("live source review, owner clarification, private saved draft and preserved revision", async ({ page, request }, testInfo) => {
  const healthResponse = await request.get(api + "/health");
  expect(healthResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  expect(health).toMatchObject({ status: "ok", aiProvider: "gemini", storage: "firestore", auth: "emulator" });

  // There are exactly two permitted live review requests per viewport. This
  // guard prevents accidental background calls or a future UI retry loop.
  let liveReviewRequests = 0;
  await page.route(api + "/api/projects/*/analyze", async route => {
    if (route.request().method() !== "POST") return route.continue();
    liveReviewRequests += 1;
    if (liveReviewRequests > 2) {
      return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({
        error: { code: "TEST_CALL_BUDGET", message: "The live verification call limit was reached." }
      }) });
    }
    return route.continue();
  });

  await page.goto("/proposals");
  await expect(page.getByText("Local workspace · Gemini enabled")).toBeVisible();
  await page.getByRole("button", { name: "Start a project", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add your sources", exact: true })).toBeVisible();
  const projectName = "Synthetic live lighting " + testInfo.project.name;
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page.getByLabel("Agreed scope", { exact: true }).fill(synthetic.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Client messages", { exact: true }).fill(synthetic.messages);
  const createdResponse = page.waitForResponse(localApiResponse("/api/projects", "POST"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const initialProject = (await created.json() as { project: Project }).project;
  const projectPath = "/api/projects/" + initialProject.id;
  const authorization = await created.request().headerValue("authorization");
  expect(Boolean(authorization?.startsWith("Bearer "))).toBe(true);
  const owner = { Authorization: authorization! };
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();

  // These denials happen before model invocation and must consume no Gemini calls.
  expect((await request.get(api + projectPath)).status()).toBe(401);
  const stranger = await isolatedAccount(request);
  for (const suffix of ["", "/export"]) {
    expect((await request.get(api + projectPath + suffix, { headers: stranger })).status()).toBe(404);
  }
  expect((await request.post(api + projectPath + "/analyze", { headers: stranger, data: {} })).status()).toBe(404);
  expect((await request.post(api + projectPath + "/proposals", { headers: stranger, data: {
    quantity: 1, unitPricePaise: 100, description: synthetic.description, requestId: crypto.randomUUID()
  } })).status()).toBe(404);
  const foreignList = await request.get(api + "/api/projects", { headers: stranger });
  expect((await foreignList.json() as { projects: Project[] }).projects.some(project => project.id === initialProject.id)).toBe(false);

  const firstReviewResponse = page.waitForResponse(localApiResponse(projectPath + "/analyze", "POST"), { timeout: 45000 });
  await page.getByRole("button", { name: "Review scope and messages", exact: true }).click();
  const initialReviewResponse = await firstReviewResponse;
  await testInfo.attach("initial-live-review-response", { body: await initialReviewResponse.text(), contentType: "application/json" });
  const firstReviewProject = await projectResponse(initialReviewResponse);
  const firstReview = firstReviewProject.analysis!;
  sourceLinked(firstReview, firstReviewProject);
  expect(firstReview.questions.join(" "), "Unchosen quantity and missing price should lead to useful questions.").toMatch(/quantity|how many|number of|4|four|6|six/i);
  expect(firstReview.questions.join(" ")).toMatch(/price|rate|cost/i);
  await expect(page.getByText("Gemini review", { exact: true })).toBeVisible();
  await expect(page.getByText("Sample review", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Quantity", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("initial-live-review.png"), fullPage: true });

  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?", { exact: true }).fill(synthetic.clarification);
  const clarificationResponse = page.waitForResponse(localApiResponse(projectPath + "/analyze", "POST"), { timeout: 45000 });
  await page.getByRole("button", { name: "Update review", exact: true }).focus();
  await page.keyboard.press("Enter");
  const updatedReviewResponse = await clarificationResponse;
  await testInfo.attach("clarified-live-review-response", { body: await updatedReviewResponse.text(), contentType: "application/json" });
  const clarifiedProject = await projectResponse(updatedReviewResponse);
  const clarifiedReview = clarifiedProject.analysis!;
  sourceLinked(clarifiedReview, clarifiedProject);
  const clarifiedFindings = [clarifiedReview.summary, ...clarifiedReview.proposed].join(" ");
  expect(clarifiedFindings, "The second review must use the owner's new finish, absent from the original source.").toMatch(/matte[ -]+white/i);
  expect(clarifiedFindings).toMatch(/\b(?:6|six)\b/i);
  expect(clarifiedFindings.replace(/,/g, "")).toMatch(/2000\.50?\b/);
  expect(clarifiedReview).not.toEqual(firstReview);
  expect(clarifiedProject.scope).toBe(synthetic.scope);
  expect(clarifiedProject.messages).toBe(synthetic.messages);
  await expect(page.getByLabel("What should the review take into account?", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).not.toBeVisible();
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("clarified-live-review.png"), fullPage: true });

  // Gemini's review is not an approval or permission to guess a price.
  await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).toHaveValue("");
  await page.getByLabel("Proposed work", { exact: true }).fill(synthetic.description);
  await page.getByLabel("Quantity", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  expect(await page.getByLabel("Confirmed unit price (₹)", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toHaveCount(0);
  expect((await request.post(api + projectPath + "/proposals", { headers: owner, data: {
    quantity: 6, description: synthetic.description, requestId: crypto.randomUUID()
  } })).status()).toBe(422);

  await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("2000.50");
  await expect(page.locator("output")).toHaveText("₹12,003");
  const draftResponse = page.waitForResponse(localApiResponse(projectPath + "/proposals", "POST"));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const savedResponse = await draftResponse;
  const firstDraftProject = await projectResponse(savedResponse);
  expect(firstDraftProject.proposals).toHaveLength(1);
  const firstDraft = firstDraftProject.proposals[0];
  expect(firstDraft).toMatchObject({ description: synthetic.description, quantity: 6, unitPricePaise: 200050, totalPaise: 1200300, status: "draft" });
  await expect(page.getByRole("heading", { name: "Your saved draft", exact: true })).toBeVisible();

  // Replaying the exact successful save keeps the same revision, with no AI call.
  const originalSave = savedResponse.request().postDataJSON() as ProposalInput;
  const replayedResponse = await request.post(api + projectPath + "/proposals", { headers: owner, data: originalSave });
  expect(replayedResponse.ok()).toBe(true);
  expect((await replayedResponse.json() as { project: Project }).project.proposals).toEqual(firstDraftProject.proposals);

  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await expect(page.locator("output")).toHaveText("₹8,002");
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toBeDisabled();
  const revisionResponse = page.waitForResponse(localApiResponse(projectPath + "/proposals", "POST"));
  await page.getByRole("button", { name: "Save revision", exact: true }).click();
  const revisedProject = await projectResponse(await revisionResponse);
  expect(revisedProject.proposals).toHaveLength(2);
  expect(revisedProject.proposals[0]).toEqual({ ...firstDraft, status: "superseded" });
  expect(revisedProject.proposals[1]).toMatchObject({ description: synthetic.description, quantity: 4, unitPricePaise: 200050, totalPaise: 800200, status: "draft" });
  expect(revisedProject.proposals[1].id).not.toBe(firstDraft.id);
  await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("₹12,003");
  await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("Previous version");
  await expect(page.getByRole("row", { name: /Draft 2/ })).toContainText("₹8,002");
  await expect(page.getByText("Approval not collected", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).toHaveValue("2000.5");
  await expect(page.getByLabel("Proposed work", { exact: true })).toHaveValue(synthetic.description);
  await page.getByRole("link", { name: "Jump to draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your saved draft", exact: true })).toBeInViewport();
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("persisted-live-revision.png"), fullPage: true });
  const persistedResponse = await request.get(api + projectPath, { headers: owner });
  expect(persistedResponse.ok()).toBe(true);
  const persistedProject = (await persistedResponse.json() as { project: Project }).project;
  expect(persistedProject.proposals).toEqual(revisedProject.proposals);
  expect(persistedProject.analysis).toEqual(clarifiedReview);
  expect(persistedProject.scope).toBe(synthetic.scope);
  expect(persistedProject.messages).toBe(synthetic.messages);

  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft", exact: true }).click();
  const download = await downloaded;
  const downloadPath = await download.path();
  expect(Boolean(downloadPath)).toBe(true);
  const exported = await fs.readFile(downloadPath!, "utf8");
  expect(exported).toContain("DRAFT PROPOSAL");
  expect(exported).toContain("Revision 2");
  expect(exported).toContain("Quantity: 4");
  expect(exported).toContain("Unit price: ₹2,000.50");
  expect(exported).toContain("Draft total: ₹8,002.00");
  expect(exported).toContain(synthetic.description);
  expect(exported).toContain("Client approval has not been collected.");
  expect(exported).toContain("Already included (excluded from this extra):");
  expect(exported).toContain(synthetic.scope);
  expect(exported).toContain(synthetic.messages);

  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(projectName) }).click();
  await expect(page.locator("output")).toHaveText("₹8,002");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  expect(liveReviewRequests).toBe(2);

  // Only synthetic project/model data is retained as reproducible local evidence.
  await testInfo.attach("live-gemini-verification", {
    body: JSON.stringify({
      verifiedAt: new Date().toISOString(), viewport: testInfo.project.name, health,
      liveReviewRequests, sources: { scope: synthetic.scope, messages: synthetic.messages },
      ownerClarification: synthetic.clarification, initialReview: firstReview,
      clarifiedReview, proposals: persistedProject.proposals,
      checks: ["emulator authentication", "cross-user denial", "source-linked Gemini output", "owner clarification reflected", "missing-price denial", "integer-paise totals", "idempotent save", "preserved revision", "reload and reopen", "draft export", "keyboard and accessibility"]
    }, null, 2),
    contentType: "application/json"
  });
  await testInfo.attach("synthetic-draft-export", { body: exported, contentType: "text/plain" });
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("output")).toHaveText("₹8,002");
});
