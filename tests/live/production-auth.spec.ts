import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";

test.skip(process.env.CONNECTED_FIREBASE_TEST !== "1", "Requires explicit authorized production verification.");
test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.setTimeout(90000);

const baseURL = process.env.VERIFICATION_BASE_URL ?? "";
const authorizedProject = process.env.CONNECTED_FIREBASE_PROJECT_ID;
const blockedRequests = new WeakMap<BrowserContext, number>();
const responseFor = (path: string, method = "GET") => (response: Response) => response.url() === baseURL + path && response.request().method() === method;

async function safeGet(request: APIRequestContext, url: string) {
  try { return await request.get(url); }
  catch { throw new Error("Production verification could not read the service; request details are withheld."); }
}

async function guestIdentity(response: Response) {
  let claims: { aud?: string; iss?: string; sub?: string; firebase?: { sign_in_provider?: string } } = {};
  try {
    const authorization = await response.request().headerValue("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch { throw new Error("The browser did not supply a valid guest identity; credentials are withheld."); }
  expect(Boolean(claims.aud === authorizedProject), "Guest identity must belong to the authorized Firebase project.").toBe(true);
  expect(Boolean(claims.iss === "https://securetoken.google.com/" + authorizedProject)).toBe(true);
  expect(Boolean(claims.firebase?.sign_in_provider === "anonymous" && typeof claims.sub === "string" && claims.sub.length > 0),
    "The UI must retain a real anonymous Firebase identity.").toBe(true);
  return claims.sub!;
}

async function openEmptyHome(page: Page) {
  const listing = page.waitForResponse(responseFor("/api/projects"));
  await page.goto(baseURL + "/");
  const response = await listing;
  expect(response.status()).toBe(200);
  expect((await response.json()).projects).toHaveLength(0);
  await expect(page.getByText("Cloud workspace · Gemini enabled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeEnabled();
  return guestIdentity(response);
}

async function cancelGooglePopup(page: Page, trigger: Locator) {
  const opened = page.waitForEvent("popup", { timeout: 20000 });
  await trigger.click();
  const popup = await opened;
  try {
    // Never assert or record the complete OAuth URL, which can contain auth state.
    await expect.poll(() => {
      try { return !popup.isClosed() && new URL(popup.url()).origin === "https://accounts.google.com"; }
      catch { return false; }
    }, { timeout: 30000, message: "The real Firebase popup must reach Google before cancellation." }).toBe(true);
  } finally {
    if (!popup.isClosed()) {
      try { await popup.close(); }
      catch { throw new Error("The Google popup could not be closed; session details are withheld."); }
    }
  }
  // No Google account is entered, selected, or approved by this check.
}

test.beforeEach(async ({ context, request }) => {
  blockedRequests.set(context, 0);
  await context.route("**/*", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const forbidden = request.method() === "POST" && (
      /^\/api\/projects\/[^/]+\/analyze\/?$/.test(pathname)
      || /^\/api\/rooms\/[^/]+\/(?:messages|observer)\/?$/.test(pathname)
      || /^\/internal(?:\/|$)/.test(pathname)
    );
    if (!forbidden) return route.continue();
    blockedRequests.set(context, (blockedRequests.get(context) ?? 0) + 1);
    return route.fulfill({ status: 429, json: { error: {
      code: "TEST_CALL_BUDGET", message: "Authentication verification does not send model requests."
    } } });
  });
  let productionOrigin = false;
  try { const target = new URL(baseURL); productionOrigin = target.protocol === "https:" && target.origin === baseURL; } catch { /* Fail below without disclosing configuration. */ }
  expect(productionOrigin && process.env.VERIFICATION_RUNTIME === "production", "An explicit production HTTPS origin is required.").toBe(true);
  expect(Boolean(authorizedProject && !authorizedProject.startsWith("demo-")), "The authorized real Firebase project must be supplied.").toBe(true);
  const response = await safeGet(request, baseURL + "/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", runtime: "production", aiProvider: "gemini", geminiTransport: "vertex", auth: "firebase", storage: "firestore", storageConnection: "cloud" });
});

test.afterEach(async ({ context }) => {
  expect(blockedRequests.get(context) ?? 0, "Google cancellation flows must never attempt a model-triggering request.").toBe(0);
});

test("production Google cancellation on an empty home preserves the guest workspace without model calls", async ({ page }) => {
  const before = await openEmptyHome(page);
  const google = page.getByRole("button", { name: "Continue with Google", exact: true });
  await cancelGooglePopup(page, google);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your current guest session is still here.");
  await expect(google).toBeEnabled();
  const listing = page.waitForResponse(responseFor("/api/projects"));
  await page.reload();
  const response = await listing;
  expect(response.status()).toBe(200);
  expect((await guestIdentity(response)) === before, "Cancellation and reload must retain the original guest UID.").toBe(true);
  expect((await response.json()).projects).toHaveLength(0);
  await page.getByRole("button", { name: "Start a project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeEditable();
});

test("production Google linking cancellation preserves a populated guest project and identity without model calls", async ({ page }) => {
  const before = await openEmptyHome(page);
  const creating = page.waitForResponse(responseFor("/api/projects", "POST"));
  await page.getByRole("button", { name: "Try the lighting example", exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  expect((await guestIdentity(created)) === before, "Saving the example must retain the established guest UID.").toBe(true);
  const project = (await created.json()).project;
  expect(project.analysis ?? null).toBeNull();
  expect(project.proposals).toHaveLength(0);
  const google = page.getByRole("button", { name: "Save access with Google", exact: true });
  await cancelGooglePopup(page, google);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Google connection was cancelled. Your guest workspace is still here; you can keep working.");
  await expect(google).toBeEnabled();
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toHaveCount(0);
  const listing = page.waitForResponse(responseFor("/api/projects"));
  const reopening = page.waitForResponse(responseFor("/api/projects/" + project.id));
  await page.reload();
  const [listResponse, projectResponse] = await Promise.all([listing, reopening]);
  expect(listResponse.status()).toBe(200);
  expect(projectResponse.status()).toBe(200);
  expect((await guestIdentity(listResponse)) === before && (await guestIdentity(projectResponse)) === before,
    "The populated guest must keep the same identity after the canceled link and reload.").toBe(true);
  const projects = (await listResponse.json()).projects as Array<{ id: string }>;
  expect(projects.length === 1 && projects[0].id === project.id, "Cancellation must preserve exactly the guest's saved project.").toBe(true);
  const reopened = (await projectResponse.json()).project;
  expect({ name: reopened.name, scope: reopened.scope, messages: reopened.messages, proposals: reopened.proposals, analysis: reopened.analysis ?? null })
    .toEqual({ name: project.name, scope: project.scope, messages: project.messages, proposals: [], analysis: null });
  await expect(page.getByRole("button", { name: "Review scope and messages", exact: true })).toBeEnabled();
});

test("production client Google recovery cancellation retains its guest identity and room-code recovery without model calls", async ({ page }) => {
  const roomId = randomUUID();
  const roomPath = "/api/rooms/" + roomId;
  const opening = page.waitForResponse(responseFor(roomPath));
  await page.goto(baseURL + "/client/rooms/" + roomId);
  const missing = await opening;
  expect(missing.status()).toBe(404);
  const before = await guestIdentity(missing);
  await expect(page.getByRole("heading", { name: "Saved access with Google?", exact: true })).toBeVisible();
  await cancelGooglePopup(page, page.getByRole("button", { name: "Continue with Google", exact: true }));
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Google connection was cancelled. Your guest rooms are unchanged;");
  expect(await page.evaluate(id => localStorage.getItem("vibeestimate:client-room:" + id + ":access") === null, roomId),
    "Canceled Google recovery must not select a different room identity.").toBe(true);
  const retrying = page.waitForResponse(responseFor(roomPath));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const retried = await retrying;
  expect(retried.status()).toBe(404);
  expect((await guestIdentity(retried)) === before, "Client recovery cancellation must retain the original client guest UID.").toBe(true);
  await page.getByRole("link", { name: "Join with a room code", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Join your project room.", exact: true })).toBeVisible();
  const code = page.getByLabel("Room code", { exact: true });
  await expect(code).toBeEditable();
  await page.getByRole("button", { name: "Join room", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter the 12-character room code from your designer.");
});
