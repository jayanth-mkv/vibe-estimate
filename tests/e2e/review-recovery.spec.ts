import { test, expect, type Page, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { appOrigin, apiOrigin } from "./target";

const responseFor = (suffix: string) => (response: Response) => response.url().startsWith(appOrigin + "/api/") && response.url().endsWith(suffix) && response.request().method() === "POST";
test.beforeAll(async ({ request }) => {
  for (const origin of [appOrigin, apiOrigin]) {
    const health = await request.get(origin + "/health");
    expect(health.status()).toBe(200);
    expect(await health.json(), "Recovery tests require a fixture on demo Firebase emulators.").toMatchObject({ runtime: "local", aiProvider: "fixture", auth: "emulator", storageConnection: "emulator" });
  }
});
async function example(page: Page, which = "lighting") {
  await page.goto("/");
  const creating = page.waitForResponse(responseFor("/api/projects"));
  await page.getByRole("button", { name: `Try the ${which} example`, exact: true }).click();
  expect((await creating).status()).toBe(201);
}
async function review(page: Page) {
  const reviewing = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Review scope and messages", exact: true }).click();
  const response = await reviewing;
  expect(response.status()).toBe(200);
  return (await response.json()).project;
}
async function accessible(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("a lost successful clarification resumes after reload without superseding a later saved draft", async ({ page }) => {
  test.setTimeout(90000);
  let dispatches = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/analyze") && !request.postDataJSON().resumeOnly) dispatches++; });
  await example(page);
  const original = await review(page);
  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?", { exact: true }).fill("Quote 6 lights");
  let completed: { id: string; analysis: unknown } | undefined;
  await page.route(appOrigin + `/api/projects/${original.id}/analyze`, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    completed = (await response.json()).project;
    await route.abort("connectionfailed");
  }, { times: 1 });
  const submitting = page.waitForRequest(r => r.url().endsWith("/analyze") && r.method() === "POST");
  await page.getByRole("button", { name: "Update review", exact: true }).click();
  const firstBody = (await submitting).postDataJSON();
  await expect(page.getByRole("button", { name: "Check review status", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update review", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry review", exact: true })).toHaveCount(0);
  await accessible(page);
  await page.getByRole("tab", { name: "Draft", exact: true }).click();
  await page.getByLabel("Number of display lights", { exact: true }).fill("6");
  await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("2000");
  const saving = page.waitForResponse(responseFor("/proposals"));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const saved = (await (await saving).json()).project;
  expect(saved.proposals).toHaveLength(1);
  expect(saved.analysis).toEqual(completed?.analysis);
  await page.reload();
  await expect(page.getByRole("button", { name: "Check review status", exact: true })).toBeVisible();
  await expect(page.getByLabel("Number of display lights", { exact: true })).toHaveValue("6");
  const checking = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Check review status", exact: true }).focus();
  await page.keyboard.press("Enter");
  const checked = await checking;
  expect(checked.request().postDataJSON()).toEqual({ requestId: firstBody.requestId, resumeOnly: true });
  expect(checked.status()).toBe(200);
  const restored = (await checked.json()).project;
  expect(restored.proposals).toEqual(saved.proposals);
  expect(restored.proposals[0].status).toBe("draft");
  expect(restored.analysis).toEqual(completed?.analysis);
  await expect(page.getByRole("heading", { name: "Check what happened to your review", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Number of display lights", { exact: true })).toHaveValue("6");
  expect(dispatches).toBe(2);
  await accessible(page);
});

test("an unaccepted review checks safely after reload before an explicit new request", async ({ page }) => {
  test.setTimeout(90000);
  await example(page);
  await page.route(appOrigin + "/api/projects/*/analyze", route => route.abort("internetdisconnected"), { times: 1 });
  const attempting = page.waitForRequest(r => r.url().endsWith("/analyze") && r.method() === "POST");
  await page.getByRole("button", { name: "Review scope and messages", exact: true }).click();
  const attempt = (await attempting).postDataJSON();
  await expect(page.getByRole("button", { name: "Check review status", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Review scope and messages", exact: true })).toBeDisabled();
  const checking = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Check review status", exact: true }).click();
  const checked = await checking;
  expect(checked.request().postDataJSON()).toEqual({ requestId: attempt.requestId, resumeOnly: true });
  expect(checked.status()).toBe(404);
  expect((await checked.json()).error.code).toBe("REVIEW_REQUEST_NOT_FOUND");
  await expect(page.getByText("No review was started for that request. Your text is still here. Start a review when you’re ready.", { exact: true })).toBeVisible();
  const starting = page.waitForRequest(r => r.url().endsWith("/analyze") && r.method() === "POST");
  const result = await review(page);
  const next = (await starting).postDataJSON();
  expect(next.requestId !== attempt.requestId).toBe(true);
  expect(next.resumeOnly).toBeUndefined();
  expect(result.analysis.provider).toBe("fixture");
  await accessible(page);
});

test("checking a lost first review opens a draft saved by the same owner in another tab", async ({ page, context }) => {
  test.setTimeout(90000);
  await example(page);
  let projectId = "";
  let authorization = "";
  await page.route(appOrigin + "/api/projects/*/analyze", async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    projectId = (await response.json()).project.id;
    authorization = (await route.request().headerValue("authorization"))!;
    await route.abort("connectionfailed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Review scope and messages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check review status", exact: true })).toBeVisible();
  let response;
  try {
    response = await context.request.post(appOrigin + `/api/projects/${projectId}/proposals`, { headers: { Authorization: authorization }, data: { requestId: randomUUID(), description: "Display lights", quantity: 6, unitPricePaise: 200000 } });
  } catch { throw new Error("Synthetic second-tab draft save failed; request credentials withheld."); }
  expect(response.status()).toBe(200);
  const saved = (await response.json()).project;
  const checking = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Check review status", exact: true }).click();
  const checked = await checking;
  expect(checked.request().postDataJSON().resumeOnly).toBe(true);
  expect((await checked.json()).project.proposals).toEqual(saved.proposals);
  await page.getByRole("tab", { name: "Draft", exact: true }).click();
  await expect(page.getByLabel("Number of display lights", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).toHaveValue("2000");
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toBeEnabled();
});

test("a real fixture-provider failure allows only an explicit retry and retains the saved sources", async ({ page }) => {
  test.setTimeout(90000);
  await example(page);
  await review(page);
  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?", { exact: true }).fill("Paint the whole house purple.");
  const failing = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Update review", exact: true }).click();
  const failure = await failing;
  expect(failure.ok()).toBe(false);
  const error = (await failure.json()).error;
  expect(error.reviewRequest).toMatchObject({ status: "failed", retryAllowed: true });
  await expect(page.getByRole("button", { name: "Retry review", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update review", exact: true })).toBeDisabled();
  await page.reload();
  const checking = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Check review status", exact: true }).click();
  const checked = await checking;
  expect(checked.status()).toBe(409);
  expect(checked.request().postDataJSON()).toEqual({ requestId: error.reviewRequest.requestId, resumeOnly: true });
  await accessible(page);
  await page.getByLabel("Clarification for this retry (optional)", { exact: true }).fill("Quote 6 lights");
  const retrying = page.waitForResponse(responseFor("/analyze"));
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  const retried = await retrying;
  const body = retried.request().postDataJSON();
  expect(body.retryOf).toBe(error.reviewRequest.requestId);
  expect(body.requestId !== error.reviewRequest.requestId).toBe(true);
  expect(body.clarification).toBe("Quote 6 lights");
  expect(retried.status()).toBe(200);
  expect((await retried.json()).project.analysis.provider).toBe("fixture");
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(page.getByRole("region", { name: "Original project sources", exact: true })).toContainText("Kitchen lighting: 3m LED strip included. Display lights excluded.");
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toHaveCount(0);
});
