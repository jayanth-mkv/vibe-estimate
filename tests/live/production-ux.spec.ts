import { test, expect, type BrowserContext, type Page, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { examples, type SourceInput } from "../../frontend/src/lib/examples";

test.skip(process.env.CONNECTED_FIREBASE_TEST !== "1", "Requires explicit authorized production verification.");
test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });

const baseURL = process.env.VERIFICATION_BASE_URL ?? "";
type GuardState = { blocked: number; projectCreates: number };
const states = new WeakMap<BrowserContext, GuardState>();
const responseFor = (pathname: string, method = "POST") => (response: Response) =>
  response.url() === baseURL + pathname && response.request().method() === method;

test.beforeEach(async ({ context, request }) => {
  if (!baseURL) throw new Error("An explicit production origin is required.");
  const target = new URL(baseURL);
  expect(target.protocol, "These checks target the authorized HTTPS production service.").toBe("https:");
  expect(target.origin).toBe(baseURL);
  const state: GuardState = { blocked: 0, projectCreates: 0 };
  states.set(context, state);
  await context.route("**/*", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method());
    const sourceSave = request.method() === "POST" && pathname === "/api/projects";
    // A narrow write allowlist also blocks future model endpoints. Firebase SDK
    // sign-up/token requests are outside /api and still establish real guests.
    const forbidden = /(?:^|\/)analyze(?:\/|$)/.test(pathname)
      || pathname.startsWith("/internal/")
      || (pathname.startsWith("/api/") && mutation && !sourceSave);
    if (forbidden) {
      state.blocked += 1;
      return route.fulfill({ status: 429, json: { error: {
        code: "ZERO_MODEL_VERIFICATION", message: "This verification permits source saves only; model-triggering requests are blocked."
      } } });
    }
    if (sourceSave) state.projectCreates += 1;
    return route.continue();
  });
  const health = await request.get(baseURL + "/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ runtime: "production", auth: "firebase", storageConnection: "cloud", aiProvider: "gemini" });
});

test.afterEach(async ({ context }, testInfo) => {
  const state = states.get(context);
  if (!state) return;
  await testInfo.attach("zero-model-request-check", { contentType: "application/json", body: JSON.stringify({
    verifiedAt: new Date().toISOString(), blockedUnexpectedRequests: state.blocked, sourceSaveRequests: state.projectCreates
  }) });
  expect(state.blocked, "No analysis, room message, observer retry or other unexpected API write may occur.").toBe(0);
});

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function openFreshHome(page: Page) {
  await page.goto(baseURL + "/proposals");
  await expect(page.getByRole("heading", { name: "Turn client changes into clear drafts.", exact: true })).toBeVisible();
  await expect(page.getByText("Cloud workspace · Gemini enabled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a project", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
}

async function sourceView(page: Page, source: SourceInput) {
  await expect(page.getByRole("heading", { name: source.name, exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Draft", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review scope and messages", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  const evidence = page.getByRole("region", { name: "Original project sources", exact: true });
  await expect(evidence).toBeVisible();
  await expect(evidence.locator(".source-text").nth(0)).toHaveText(source.scope);
  await expect(evidence.locator(".source-text").nth(1)).toHaveText(source.messages);
  await expect(page.getByRole("button", { name: "Download draft", exact: true })).toHaveCount(0);
}

async function savedSource(response: Response, source: SourceInput) {
  expect(response.status()).toBe(201);
  const saved = (await response.json()).project;
  // Assert only synthetic content; do not put identity fields in failure output.
  expect({ name: saved.name, scope: saved.scope, messages: saved.messages, proposals: saved.proposals })
    .toEqual({ ...source, proposals: [] });
  expect(saved.analysis, "Source creation must not silently run a review.").toBeUndefined();
  return saved.id as string;
}

for (const width of [320, 390, 768, 1440]) {
  test(`production tour and workspace retain images, keyboard navigation and accessible layout at ${width}px without model calls`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFreshHome(page);
    const homeImage = page.locator('img[src*="designer-review"]');
    // The decorative home art is hidden on narrow layouts, so Chromium need
    // not load its lazy image. Decode it explicitly to verify the asset.
    await homeImage.evaluate(async (image: HTMLImageElement) => { image.loading = "eager"; await image.decode(); });
    await expect.poll(() => homeImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await accessible(page);

    // The current compact header has a help disclosure; the tour has no
    // hamburger menu. Exercise the actual keyboard-operated control.
    const help = page.locator('summary[aria-label="How it works"]');
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "A clear draft in three steps", exact: true })).toBeVisible();
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "A clear draft in three steps", exact: true })).not.toBeVisible();
    await expect(help).toBeFocused();

    await page.getByRole("link", { name: "Explore the illustrated product tour", exact: true }).click();
    await expect(page).toHaveURL(baseURL + "/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clearer Scope.Better Conversations.Considered Changes.");
    const navigation = page.getByRole("navigation", { name: "Product tour", exact: true });
    if (width > 840) {
      await expect(navigation).toBeVisible();
      await navigation.getByRole("link", { name: "Drafts & revisions", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(baseURL + "/welcome#drafts");
    } else {
      await expect(navigation).not.toBeVisible();
      await expect(page.getByRole("link", { name: "Open workspace", exact: true })).toBeVisible();
    }
    const workflow = page.getByRole("tablist", { name: "Explore the project workflow", exact: true });
    await workflow.getByRole("tab", { name: "Review", exact: true }).focus();
    for (const [name, heading] of [
      ["Draft", "A considered proposal, ready for your review."],
      ["Revision", "Plans change. Keep the whole story."],
      ["Scope", "Start with what was agreed."]
    ]) {
      await page.keyboard.press("ArrowRight");
      await expect(workflow.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
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
    await page.getByRole("link", { name: "Open workspace", exact: true }).click();
    await expect(page).toHaveURL(baseURL + "/proposals");
    await expect(page.getByRole("heading", { name: "Turn client changes into clear drafts.", exact: true })).toBeVisible();
    const header = await page.getByRole("banner").boundingBox();
    expect(header).not.toBeNull();
    expect(header!.height, "Tour styles must not enlarge the workspace header.").toBeLessThan(65);
    await expect(page.getByRole("button", { name: "Start a project", exact: true })).toBeInViewport();
    await accessible(page);
    expect(states.get(context)!.projectCreates).toBe(0);
  });
}

test("production source wizard validates, retains Back and cancelled-leave edits, discards explicitly, then saves and reloads without analysis", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshHome(page);
  const source: SourceInput = {
    name: "Synthetic production source UX " + new Date().toISOString(),
    scope: "Kitchen lighting: a 3m LED strip is included. Display lights are excluded and need a separate draft.",
    messages: "Client: Could we add four display lights?\nDesigner: I will confirm the unit price.\nClient: Please keep kitchen lighting included. No additional work is approved."
  };
  await page.getByRole("button", { name: "Start a project", exact: true }).click();
  const wizard = page.getByRole("region", { name: "Add your sources", exact: true });
  await expect(wizard.getByRole("heading", { level: 2 })).toBeFocused();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByLabel("Project name", { exact: true }).fill(source.name);
  await page.getByLabel("Agreed scope", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Agreed scope", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Agreed scope", { exact: true })).toBeFocused();
  await accessible(page);
  await page.getByLabel("Agreed scope", { exact: true }).fill(source.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(wizard.getByRole("heading", { level: 2 })).toBeFocused();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Client messages", { exact: true })).toBeFocused();
  await page.getByLabel("Client messages", { exact: true }).fill(source.messages);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(source.name);
  await expect(page.getByLabel("Agreed scope", { exact: true })).toHaveValue(source.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveValue(source.messages);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const leave = page.getByRole("alertdialog");
  await expect(leave).toBeVisible();
  await expect(leave.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await accessible(page);
  await page.keyboard.press("Enter");
  await expect(leave).toHaveCount(0);
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveValue(source.messages);
  expect(states.get(context)!.projectCreates).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await leave.getByRole("button", { name: "Discard edits and leave", exact: true }).click();
  await expect(wizard).toHaveCount(0);
  await page.getByRole("button", { name: "Start a project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Agreed scope", { exact: true })).toHaveValue("");
  await page.getByLabel("Project name", { exact: true }).fill(source.name);
  await page.getByLabel("Agreed scope", { exact: true }).fill(source.scope);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Client messages", { exact: true })).toHaveValue("");
  await page.getByLabel("Client messages", { exact: true }).fill(source.messages);
  const creation = page.waitForResponse(responseFor("/api/projects"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const id = await savedSource(await creation, source);
  await sourceView(page, source);
  await page.reload();
  await sourceView(page, source);
  await expect(page).toHaveURL(baseURL + "/proposals?project=" + id);
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(source.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await sourceView(page, source);
  await accessible(page);
  expect(states.get(context)!.projectCreates).toBe(1);
});

test("production lighting, wardrobe and finish example buttons save their own sources and reopen without analysis", async ({ page, context }) => {
  await openFreshHome(page);
  for (const example of examples) {
    await test.step(example.id, async () => {
      const disclosure = page.locator("summary").filter({ hasText: "Try a fictional example" });
      if (await disclosure.count()) await disclosure.click();
      const name = example.id === "lighting" ? "Try the lighting example" : `Try the ${example.id} example`;
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeEnabled();
      const creation = page.waitForResponse(responseFor("/api/projects"));
      await button.focus();
      await page.keyboard.press("Enter");
      const id = await savedSource(await creation, example.source);
      await sourceView(page, example.source);
      await page.reload();
      await sourceView(page, example.source);
      await expect(page).toHaveURL(baseURL + "/proposals?project=" + id);
      await page.getByRole("button", { name: "All projects", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your projects", exact: true })).toBeVisible();
      await page.getByRole("button").filter({ has: page.getByText(example.source.name, { exact: true }) }).click();
      await sourceView(page, example.source);
      await page.getByRole("button", { name: "All projects", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your projects", exact: true })).toBeVisible();
    });
  }
  await accessible(page);
  expect(states.get(context)!.projectCreates).toBe(3);
});
