import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import { FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../../backend/src/fixtures";

const api = "http://127.0.0.1:8080";

test.beforeAll(async ({ request }) => {
  const response = await request.get(api + "/health");
  expect(response.ok()).toBe(true);
  expect(await response.json(), "UI regression must never invoke a live model.").toMatchObject({ aiProvider: "fixture", auth: "emulator", storage: "firestore" });
});

async function openExample(page: Page) {
  await page.goto("/");
  let creations = 0;
  const countCreation = (request: import("@playwright/test").Request) => {
    if (request.url() === api + "/api/projects" && request.method() === "POST") creations += 1;
  };
  page.on("request", countCreation);
  const example = page.getByRole("button", { name: "Try the lighting example", exact: true });
  await expect(example).toBeEnabled();
  await example.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Asha’s home renovation", exact: true })).toBeVisible();
  expect(creations, "The signed-out example should authenticate and create once from one activation.").toBe(1);
  page.off("request", countCreation);
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toBeDisabled();
}
async function review(page: Page) {
  await page.getByRole("button", { name: "Review scope and messages" }).click();
  await expect(page.getByRole("heading", { name: "Already included", exact: true })).toBeVisible();
}
async function openDraft(page: Page) {
  await expect(page.getByLabel("Confirmed unit price (₹)")).not.toBeVisible();
  await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toHaveAttribute("aria-selected", "true");
}
async function price(page: Page, quantity = "6") {
  await page.getByLabel("Number of display lights").fill(quantity);
  await page.getByLabel("Confirmed unit price (₹)").fill("2000");
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("source review, keyboard clarification, saved revision, reload, and draft download", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Turn client changes into clear drafts.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open local workspace" })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("welcome.png"), fullPage: true });
  await openExample(page);
  await review(page);
  await expect(page.getByText("Should the draft include 4 or 6 display lights?", { exact: true })).toBeVisible();
  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?").fill("Quote 6 lights");
  await page.getByRole("button", { name: "Update review" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Should the draft include 4 or 6 display lights?", { exact: true })).toHaveCount(0);
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("review.png"), fullPage: true });
  await openDraft(page);
  await page.getByLabel("Number of display lights").fill("6");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download draft" })).toHaveCount(0);
  expect(await page.getByLabel("Confirmed unit price (₹)").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await price(page);
  await expect(page.locator("output")).toHaveText("₹12,000");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your saved draft" })).toBeVisible();
  await price(page, "4");
  await expect(page.locator("output")).toHaveText("₹8,000");
  await expect(page.getByRole("button", { name: "Download draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Save revision", exact: true }).click();
  await expect(page.getByRole("row", { name: /Draft 2/ })).toContainText("₹8,000");
  await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("₹12,000");
  await page.reload();
  await expect(page.getByLabel("Number of display lights")).toHaveValue("4");
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "Jump to draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your saved draft", exact: true })).toBeInViewport();
  await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("Previous version");
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("draft.png"), fullPage: true });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft" }).click();
  const download = await downloaded;
  const file = await download.path();
  expect(file).toBeTruthy();
  const text = await fs.readFile(file!, "utf8");
  expect(text.toLowerCase()).toContain("draft");
  expect(text).toMatch(/8,?000/);
  expect(text.toLowerCase()).toContain("approval has not been collected");
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByRole("button", { name: /Asha’s home renovation/ }).click();
  await expect(page.locator("output")).toHaveText("₹8,000");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open local workspace" })).toBeVisible();
});

test("review failure recovers and a lost save response retries without duplicate revisions", async ({ page }) => {
  await openExample(page);
  await page.route("**/api/projects/*/analyze", route => route.fulfill({
    status: 503, contentType: "application/json",
    body: JSON.stringify({ error: { code: "AI_UNAVAILABLE", message: "Review is temporarily unavailable. Please try again." } })
  }), { times: 1 });
  await page.getByRole("button", { name: "Review scope and messages" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("heading", { name: "Prepare the draft" })).toHaveCount(0);
  await review(page);
  await openDraft(page);
  await price(page);
  await page.route("**/api/projects/*/proposals", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("connectionfailed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your inputs are still here");
  await expect(page.getByLabel("Number of display lights")).toHaveValue("6");
  await expect(page.getByLabel("Confirmed unit price (₹)")).toHaveValue("2000");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("₹12,000");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("review tabs preserve owner pricing and unsaved edits require a keyboard-safe leave decision", async ({ page }) => {
  await openExample(page);
  await review(page);
  await openDraft(page);
  await price(page);
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByText("Add a clarification", { exact: true }).click();
  await page.getByLabel("What should the review take into account?").fill("Quote 4 lights");
  await page.getByRole("button", { name: "Update review", exact: true }).click();
  await expect(page.getByLabel("What should the review take into account?")).toHaveValue("");
  await page.getByRole("tab", { name: "Draft", exact: true }).click();
  await expect(page.getByLabel("Number of display lights")).toHaveValue("6");
  await expect(page.getByLabel("Confirmed unit price (₹)")).toHaveValue("2000");
  await expect(page.locator("output")).toHaveText("₹12,000");
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await accessible(page);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Number of display lights")).toHaveValue("6");
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard edits and leave" }).click();
  await expect(page.getByRole("heading", { name: "Your projects", exact: true })).toBeVisible();
});

test("guided sources validate each step, retain edits, save once, and resume without premature sign-in", async ({ page }, testInfo) => {
  let creations = 0;
  let signIns = 0;
  let reviews = 0;
  page.on("request", request => {
    if (request.method() !== "POST") return;
    if (request.url() === api + "/api/projects") creations += 1;
    if (request.url().startsWith("http://127.0.0.1:9099/") && request.url().includes("accounts:signUp")) signIns += 1;
    if (request.url().startsWith(api + "/api/projects/") && request.url().endsWith("/analyze")) reviews += 1;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Turn client changes into clear drafts.", exact: true })).toBeVisible();
  const start = page.getByRole("button", { name: "Start a project", exact: true });
  await expect(start).toBeInViewport();
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add your sources", exact: true })).toBeVisible();
  const wizard = page.getByRole("region", { name: "Add your sources", exact: true });
  await expect(wizard.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Client messages", { exact: true })).not.toBeVisible();

  const projectName = "Guided synthetic lighting " + testInfo.project.name;
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Agreed scope", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Agreed scope", { exact: true })).toBeFocused();
  await accessible(page);
  await page.getByLabel("Agreed scope", { exact: true }).fill(FIXTURE_SCOPE);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Client messages", { exact: true })).toBeVisible();
  await expect(wizard.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(page.getByRole("list", { name: "Source setup progress", exact: true }).locator('[aria-current="step"]')).toContainText("Client messages");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Client messages", { exact: true })).toBeFocused();
  expect({ creations, signIns, reviews }).toEqual({ creations: 0, signIns: 0, reviews: 0 });

  await page.getByLabel("Client messages", { exact: true }).fill(FIXTURE_MESSAGES);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(projectName);
  await expect(page.getByLabel("Agreed scope", { exact: true })).toHaveValue(FIXTURE_SCOPE);
  await page.getByRole("button", { name: "Continue", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveValue(FIXTURE_MESSAGES);
  expect({ creations, signIns, reviews }).toEqual({ creations: 0, signIns: 0, reviews: 0 });
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("guided-sources.png"), fullPage: true });

  const created = page.waitForResponse(response => response.url() === api + "/api/projects" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const saved = (await response.json()).project;
  expect(saved).toMatchObject({ name: projectName, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES, proposals: [] });
  expect(saved.analysis).toBeUndefined();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  expect({ creations, signIns, reviews }).toEqual({ creations: 1, signIns: 1, reviews: 0 });
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(projectName) }).click();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toBeDisabled();
  expect({ creations, signIns, reviews }).toEqual({ creations: 1, signIns: 1, reviews: 0 });
});

test("illustrated product tour preserves its imagery and keyboard flow without enlarging the workspace", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the illustrated product tour", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clearer Scope.Better Conversations.Considered Changes.");

  const workflow = page.getByRole("tablist", { name: "Explore the project workflow", exact: true });
  await workflow.getByRole("tab", { name: "Review", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(workflow.getByRole("tab", { name: "Draft", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "A considered proposal, ready for your review.", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(workflow.getByRole("tab", { name: "Revision", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Plans change. Keep the whole story.", exact: true })).toBeVisible();

  for (const name of [
    "An interior designer comparing a floor plan with a client message.",
    "Proposal papers with a revision arrow, a pencil, and a calculator."
  ]) {
    const illustration = page.getByRole("img", { name, exact: true });
    await illustration.scrollIntoViewIfNeeded();
    await expect(illustration).toBeVisible();
    await expect.poll(() => illustration.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("illustrated-tour.png"), fullPage: true });

  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/");
  await expect(page.getByRole("heading", { name: "Turn client changes into clear drafts.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a project", exact: true })).toBeInViewport();
  const header = await page.getByRole("banner").boundingBox();
  expect(header, "The workspace retains its compact header after the tour stylesheet has loaded.").not.toBeNull();
  expect(header!.height).toBeLessThan(65);
  await accessible(page);
});
