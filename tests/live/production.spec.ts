import { test, expect, type Response, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";

test.skip(process.env.CONNECTED_FIREBASE_TEST !== "1", "Requires explicit authorized cloud verification.");
const baseURL = process.env.VERIFICATION_BASE_URL!;
const responseFor = (suffix: string, method = "POST") => (response: Response) => response.url().startsWith(baseURL + "/api/") && response.url().endsWith(suffix) && response.request().method() === method;
const source = {
  scope: "Kitchen lighting: a 3m LED strip is included in the agreed scope. Display lights are excluded and require a separate draft proposal.",
  messages: "Client: Could we add 4 display lights?\nDesigner: I will confirm the unit price separately.\nClient: Maybe 6 would work better. I have not chosen the quantity yet.\nClient: Please remember the included kitchen lighting. No additional work has been approved.",
};
function safeApi(raw: APIRequestContext): Pick<APIRequestContext, "get" | "post"> {
  return {
    async get(...args) { try { return await raw.get(...args); } catch { throw new Error("API read failed; credentials withheld."); } },
    async post(...args) { try { return await raw.post(...args); } catch { throw new Error("API write failed; credentials withheld."); } },
  };
}

test("production mobile onboarding recovers from an offline save without losing inputs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Cloud workspace · Gemini enabled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start a project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Synthetic recovery check");
  await page.getByLabel("Agreed scope", { exact: true }).fill(source.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Client messages", { exact: true }).fill(source.messages);
  await page.route(baseURL + "/api/projects", async route => route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your inputs are still here" })).toBeVisible();
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveValue(source.messages);
  await page.unroute(baseURL + "/api/projects");
  const saved = page.waitForResponse(responseFor("/api/projects"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Synthetic recovery check", exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(v => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("production real multi-turn review, revision, reload, export and ownership denials", async ({ page, browser, request: rawRequest }, testInfo) => {
  const request = safeApi(rawRequest);
  let calls = 0;
  await page.route(baseURL + "/api/projects/*/analyze", async route => {
    calls++;
    if (calls > 2) return route.fulfill({ status: 429, json: { error: { message: "Verification budget reached." } } });
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start a project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Synthetic production review");
  await page.getByLabel("Agreed scope", { exact: true }).fill(source.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Client messages", { exact: true }).fill(source.messages);
  const creating = page.waitForResponse(responseFor("/api/projects"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const original = (await created.json()).project;
  const owner = { Authorization: (await created.request().headerValue("authorization"))! };
  const projectPath = baseURL + "/api/projects/" + original.id;
  expect((await request.get(projectPath)).status()).toBe(401);
  expect((await request.post(baseURL + "/internal/observer", { headers: owner, data: { roomId: original.id } })).status()).toBe(401);
  const firstResponse = page.waitForResponse(responseFor("/analyze"), { timeout: 65000 });
  await page.getByRole("button", { name: "Review scope and messages", exact: true }).click();
  const first = await firstResponse;
  expect(first.status()).toBe(200);
  const firstProject = (await first.json()).project;
  expect(firstProject.analysis.provider).toBe("gemini");
  expect(firstProject.analysis.questions.length).toBeGreaterThan(0);
  // Test foreign-owner analysis only after an owner review exists. Even an
  // ownership regression must not turn this assertion into another paid call.
  const strangerContext = await browser.newContext();
  try {
    const strangerPage = await strangerContext.newPage();
    const listing = strangerPage.waitForResponse(responseFor("/api/projects", "GET"));
    await strangerPage.goto(baseURL);
    const stranger = { Authorization: (await (await listing).request().headerValue("authorization"))! };
    expect(Boolean(stranger.Authorization && stranger.Authorization !== owner.Authorization)).toBe(true);
    for (const suffix of ["", "/export"]) expect((await request.get(projectPath + suffix, { headers: stranger })).status()).toBe(404);
    expect((await request.post(projectPath + "/analyze", { headers: stranger, data: {} })).status()).toBe(404);
  } finally { await strangerContext.close(); }

  const clarification = "Prepare a draft for exactly 6 matte white display lights. I confirm INR 2000.50 per light. The included kitchen strip must not be charged again. Client approval has not been collected.";
  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?", { exact: true }).fill(clarification);
  const secondResponse = page.waitForResponse(responseFor("/analyze"), { timeout: 65000 });
  await page.getByRole("button", { name: "Update review", exact: true }).click();
  const second = await secondResponse;
  expect(second.status()).toBe(200);
  const reviewed = (await second.json()).project;
  expect(reviewed.analysis).not.toEqual(firstProject.analysis);
  expect(JSON.stringify(reviewed.analysis)).toMatch(/matte[ -]+white/i);
  for (const item of reviewed.analysis.evidence) expect(source[item.source as keyof typeof source]).toContain(item.quote);
  expect(reviewed.analysis.included.join(" ")).toMatch(/kitchen|LED/i);
  await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
  await page.getByLabel("Proposed work", { exact: true }).fill("Matte white display lights");
  await page.getByLabel("Quantity", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  expect(await page.getByLabel("Confirmed unit price (₹)", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("2000.50");
  const saving = page.waitForResponse(responseFor("/proposals"));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const firstSave = await saving;
  expect(firstSave.status()).toBe(200);
  const draft = (await firstSave.json()).project;
  expect(draft.proposals[0].totalPaise).toBe(1200300);
  const replay = await request.post(projectPath + "/proposals", { headers: owner, data: firstSave.request().postDataJSON() });
  expect((await replay.json()).project.proposals).toHaveLength(1);
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  const revising = page.waitForResponse(responseFor("/proposals"));
  await page.getByRole("button", { name: "Save revision", exact: true }).click();
  const revision = (await (await revising).json()).project;
  expect(revision.proposals).toHaveLength(2);
  expect(revision.proposals[0]).toEqual({ ...draft.proposals[0], status: "superseded" });
  expect(revision.proposals[1].totalPaise).toBe(800200);
  await page.reload();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("4");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft", exact: true }).click();
  const download = await downloading;
  const exported = await fs.readFile((await download.path())!, "utf8");
  expect(exported).toContain("Revision 2"); expect(exported).toContain("₹8,002.00");
  expect(exported).toContain("Client approval has not been collected."); expect(exported).toContain(source.scope);
  expect(calls).toBe(2);
  await testInfo.attach("production-review-evidence", { contentType: "application/json", body: JSON.stringify({ verifiedAt: new Date().toISOString(), first: firstProject.analysis, clarified: reviewed.analysis, proposals: revision.proposals, checks: ["real multi-turn Gemini", "source validation", "cross-user denial", "unauthenticated denial", "task identity denial", "missing price", "duplicate save", "revision", "persistence", "export"] }) });
});
