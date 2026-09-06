import { test, expect, type APIRequestContext, type BrowserContext, type Page, type Response, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import type { Analysis, Project } from "../../backend/src/types";
import type { Room } from "../../backend/src/room-types";

const api = "http://127.0.0.1:8080";
const synthetic = {
  scope: "Kitchen lighting: a 3m LED strip is included in the agreed scope. Display lights are excluded and require a separate draft proposal.",
  messages: "Client: I would like to discuss display lighting.\nDesigner: We will confirm any additional scope, quantity and unit price in our shared room.\nClient: The kitchen LED strip stays in the original scope. No additional work has been approved.",
  clientMessage: "Could we quote 6 matte white display lights? Please keep the kitchen lighting in the agreed scope. No additional work has been approved.",
  designerMessage: "I will prepare a draft for exactly 6 matte white display lights at INR 2000.50 each. Kitchen lighting stays included. This is a draft for review; client approval has not been collected.",
  description: "Matte white display lights"
};
type Headers = { Authorization: string };
const responseFor = (path: string, method: string) => (response: Response) => response.url() === api + path && response.request().method() === method;

test.skip(process.env.LIVE_GEMINI_TEST !== "1", "Use the explicit live runner with Gemini and local Firebase emulators.");

async function readRoom(request: APIRequestContext, path: string, headers: Headers): Promise<Room> {
  const response = await request.get(api + path, { headers });
  expect(response.ok()).toBe(true);
  return (await response.json()).room;
}

async function reviewedRoom(request: APIRequestContext, path: string, headers: Headers, count: number) {
  await expect.poll(async () => {
    const room = await readRoom(request, path, headers);
    expect(room.observer.provider, "Fixture output cannot satisfy live-room verification.").toBe("gemini");
    expect(room.observer.callsUsed, "Only one observation is allowed for each of the two deliberately separated messages.").toBeLessThanOrEqual(count);
    return { status: room.observer.status, reviewed: room.observer.reviewedMessageCount, calls: room.observer.callsUsed };
  }, { timeout: 60000, intervals: [500, 1000, 1500] }).toEqual({ status: "ready", reviewed: count, calls: count });
  return readRoom(request, path, headers);
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

function sourceLinked(analysis: Analysis, project: Pick<Project, "scope" | "messages">) {
  expect(analysis.provider).toBe("gemini");
  expect(analysis.evidence.length).toBeGreaterThan(0);
  for (const evidence of analysis.evidence) {
    expect(["scope", "messages"]).toContain(evidence.source);
    expect(project[evidence.source]).toContain(evidence.quote);
  }
  expect(analysis.included.join(" ")).toMatch(/kitchen|LED strip/i);
  expect(analysis.proposed.join(" ")).toMatch(/display lights/i);
}

async function send(page: Page, path: string, text: string) {
  await page.getByLabel("Message the room", { exact: true }).fill(text);
  const saved = page.waitForResponse(responseFor(path + "/messages", "POST"));
  await page.getByRole("button", { name: "Send message", exact: true }).focus();
  await page.keyboard.press("Enter");
  expect((await saved).ok()).toBe(true);
  await expect(page.getByLabel("Message the room", { exact: true })).toHaveValue("");
}

test("live shared room observes two people and preserves owner-priced shared draft revisions", async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "The additional paid room journey is desktop-only.");
  test.setTimeout(210000);
  const healthResponse = await request.get(api + "/health");
  expect(healthResponse.ok()).toBe(true);
  const health = await healthResponse.json();
  expect(health).toMatchObject({ status: "ok", aiProvider: "gemini", geminiTransport: "vertex", storage: "firestore", auth: "emulator" });

  let messageRequests = 0;
  let blockedRequests = 0;
  let owner: Headers | undefined;
  let roomPath: string | undefined;
  let clientContext: BrowserContext | undefined;
  const guard = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const url = new URL(route.request().url());
    const message = /^\/api\/rooms\/[^/]+\/messages$/.test(url.pathname);
    const forbidden = /^\/api\/projects\/[^/]+\/analyze$/.test(url.pathname) || /^\/api\/rooms\/[^/]+\/observer$/.test(url.pathname);
    if (message) messageRequests += 1;
    if (forbidden || message && messageRequests > 2) {
      blockedRequests += 1;
      return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: {
        code: "TEST_CALL_BUDGET", message: "The live room verification permits exactly two messages and no review retries."
      } }) });
    }
    return route.continue();
  };
  await page.route(api + "/api/**", guard);

  try {
    await page.goto("/proposals");
    await expect(page.getByText("Local workspace · Gemini enabled", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start a project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Synthetic live shared lighting");
    await page.getByLabel("Agreed scope", { exact: true }).fill(synthetic.scope);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Client messages", { exact: true }).fill(synthetic.messages);
    const created = page.waitForResponse(responseFor("/api/projects", "POST"));
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const original = (await createdResponse.json()).project as Project;
    const ownerAuthorization = await createdResponse.request().headerValue("authorization");
    expect(Boolean(ownerAuthorization?.startsWith("Bearer "))).toBe(true);
    owner = { Authorization: ownerAuthorization! };
    const started = page.waitForResponse(responseFor("/api/projects/" + original.id + "/room", "POST"));
    await page.getByRole("button", { name: "Start shared room", exact: true }).click();
    const startResponse = await started;
    expect(startResponse.ok()).toBe(true);
    const room = (await startResponse.json()).room as Room;
    roomPath = "/api/rooms/" + room.id;
    expect(room.observer).toMatchObject({ provider: "gemini", callsUsed: 0, reviewedMessageCount: 0 });
    await expect(page.getByText("Designer view", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Invite client", exact: true }).click();
    await page.getByRole("button", { name: "Create invite link", exact: true }).click();
    const invitation = page.getByRole("link", { name: "Open client demo", exact: true });
    await expect(invitation).toBeVisible();
    const inviteHref = await invitation.getAttribute("href");
    expect(Boolean(inviteHref)).toBe(true);
    const inviteUrl = new URL(inviteHref!, page.url());
    expect(inviteUrl.origin).toBe("http://127.0.0.1:3000");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

    clientContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await clientContext.route(api + "/api/**", guard);
    const clientPage = await clientContext.newPage();
    const joined = clientPage.waitForResponse(responseFor(roomPath + "/join", "POST"));
    await clientPage.goto(inviteUrl.toString());
    const joinedResponse = await joined;
    expect(joinedResponse.ok()).toBe(true);
    const clientAuthorization = await joinedResponse.request().headerValue("authorization");
    expect(Boolean(clientAuthorization?.startsWith("Bearer "))).toBe(true);
    expect(clientAuthorization !== ownerAuthorization).toBe(true);
    const client = { Authorization: clientAuthorization! };
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(clientPage.url()).hash === "").toBe(true);
    expect((await request.get(api + roomPath)).status()).toBe(401);
    expect((await request.post(api + roomPath + "/prepare-draft", { headers: client, data: {} })).status()).toBe(403);
    expect((await request.post(api + roomPath + "/share-draft", { headers: client, data: {} })).status()).toBe(403);

    // Deliberately await the first real observation before the designer replies.
    // This demonstrates two genuine turns and avoids a single debounced request.
    await send(clientPage, roomPath, synthetic.clientMessage);
    await expect(page.getByRole("log", { name: "Room conversation", exact: true }).getByText(synthetic.clientMessage, { exact: true })).toBeVisible();
    const firstRoom = await reviewedRoom(request, roomPath, owner, 1);
    const firstReview = firstRoom.observer.analysis!;
    expect(firstReview.questions.join(" ")).toMatch(/price|rate|cost/i);
    expect([firstReview.summary, ...firstReview.proposed].join(" ")).toMatch(/matte[ -]+white/i);
    await testInfo.attach("first-live-room-observation", { body: JSON.stringify(firstRoom.observer, null, 2), contentType: "application/json" });

    await send(page, roomPath, synthetic.designerMessage);
    await expect(clientPage.getByRole("log", { name: "Room conversation", exact: true }).getByText(synthetic.designerMessage, { exact: true })).toBeVisible();
    const secondRoom = await reviewedRoom(request, roomPath, owner, 2);
    expect(secondRoom.messages.map(message => ({ role: message.role, text: message.text }))).toEqual([
      { role: "client", text: synthetic.clientMessage }, { role: "designer", text: synthetic.designerMessage }
    ]);
    const secondReview = secondRoom.observer.analysis!;
    const findings = [secondReview.summary, ...secondReview.proposed].join(" ");
    expect(findings).toMatch(/matte[ -]+white/i);
    expect(findings).toMatch(/\b(?:6|six)\b/i);
    expect(findings.replace(/,/g, "")).toMatch(/2000\.50?\b/);
    expect(secondReview).not.toEqual(firstReview);
    await expect(page.getByText("Review up to date", { exact: true })).toBeVisible();
    await accessible(page);
    await accessible(clientPage);
    await page.screenshot({ path: testInfo.outputPath("live-designer-room-review.png"), fullPage: true });
    await clientPage.screenshot({ path: testInfo.outputPath("live-client-room-review.png"), fullPage: true });

    const prepared = page.waitForResponse(responseFor(roomPath + "/prepare-draft", "POST"));
    await page.getByRole("button", { name: "Prepare draft", exact: true }).click();
    const preparedResponse = await prepared;
    expect(preparedResponse.ok()).toBe(true);
    const frozen = (await preparedResponse.json()).project as Project;
    expect(frozen.id).not.toBe(original.id);
    expect(frozen.scope).toBe(synthetic.scope);
    expect(frozen.messages).toContain(synthetic.messages);
    expect(frozen.messages).toContain(synthetic.clientMessage);
    expect(frozen.messages).toContain(synthetic.designerMessage);
    const secondMessageBoundary = "\n\n[Room message 2 — Designer]\n";
    expect(frozen.messages).toContain(secondMessageBoundary);
    // The first observation's quotations must belong to the earlier transcript,
    // before the designer supplied the later price confirmation.
    sourceLinked(firstReview, { scope: frozen.scope, messages: frozen.messages.split(secondMessageBoundary)[0] });
    sourceLinked(secondReview, frozen);
    expect(frozen.analysis).toEqual(secondReview);
    const projectPath = "/api/projects/" + frozen.id;
    await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
    await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).toHaveValue("");
    await page.getByLabel("Proposed work", { exact: true }).fill(synthetic.description);
    await page.getByLabel("Quantity", { exact: true }).fill("6");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    expect(await page.getByLabel("Confirmed unit price (₹)", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("2000.50");
    await expect(page.locator("output")).toHaveText("₹12,003");
    const saved = page.waitForResponse(responseFor(projectPath + "/proposals", "POST"));
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.ok()).toBe(true);
    const firstProject = (await savedResponse.json()).project as Project;
    expect(firstProject.proposals).toHaveLength(1);
    expect(firstProject.proposals[0]).toMatchObject({ quantity: 6, unitPricePaise: 200050, totalPaise: 1200300, status: "draft" });
    await expect(page.getByRole("heading", { name: "Your saved draft", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to room", exact: true }).click();
    await page.getByRole("button", { name: "Share saved draft", exact: true }).click();
    await expect(clientPage.getByRole("article", { name: "Shared draft 1", exact: true })).toContainText("₹12,003");
    const sharedOnce = await readRoom(request, roomPath, owner);
    expect(sharedOnce.sharedDrafts).toHaveLength(1);
    expect(sharedOnce.sharedDrafts[0]).toMatchObject({ version: 1, quantity: 6, unitPricePaise: 200050, totalPaise: 1200300, messageCount: 2 });
    const firstSnapshot = structuredClone(sharedOnce.sharedDrafts[0]);

    // Revise the same owner project without posting another room message.
    await page.getByRole("link", { name: "Open private draft workspace", exact: true }).click();
    await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("6");
    await page.getByLabel("Quantity", { exact: true }).fill("4");
    await expect(page.locator("output")).toHaveText("₹8,002");
    const revised = page.waitForResponse(responseFor(projectPath + "/proposals", "POST"));
    await page.getByRole("button", { name: "Save revision", exact: true }).click();
    const revisedResponse = await revised;
    expect(revisedResponse.ok()).toBe(true);
    const revisionProject = (await revisedResponse.json()).project as Project;
    expect(revisionProject.proposals).toHaveLength(2);
    expect(revisionProject.proposals[0]).toEqual({ ...firstProject.proposals[0], status: "superseded" });
    expect(revisionProject.proposals[1]).toMatchObject({ quantity: 4, unitPricePaise: 200050, totalPaise: 800200, status: "draft" });
    await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("₹12,003");
    await expect(page.getByRole("row", { name: /Draft 2/ })).toContainText("₹8,002");
    await page.reload();
    await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("4");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download draft", exact: true }).click();
    const download = await downloaded;
    const downloadPath = await download.path();
    expect(Boolean(downloadPath)).toBe(true);
    const exported = await fs.readFile(downloadPath!, "utf8");
    expect(exported).toContain("Revision 2");
    expect(exported).toContain("Quantity: 4");
    expect(exported).toContain("Unit price: ₹2,000.50");
    expect(exported).toContain("Draft total: ₹8,002.00");
    expect(exported).toContain("Client approval has not been collected.");
    expect(exported).toContain(synthetic.scope);
    expect(exported).toContain(synthetic.clientMessage);
    expect(exported).toContain(synthetic.designerMessage);
    await page.getByRole("button", { name: "Back to room", exact: true }).click();
    await page.getByRole("button", { name: "Share saved draft", exact: true }).click();
    await expect(clientPage.getByRole("article", { name: "Shared draft 2", exact: true })).toContainText("₹8,002");
    await page.reload();
    await clientPage.reload();
    for (const current of [page, clientPage]) {
      await expect(current.getByRole("article", { name: "Shared draft 1", exact: true })).toContainText("₹12,003");
      await expect(current.getByRole("article", { name: "Shared draft 2", exact: true })).toContainText("₹8,002");
      await accessible(current);
    }
    const retained = await readRoom(request, roomPath, owner);
    expect(retained.sharedDrafts).toHaveLength(2);
    expect(retained.sharedDrafts[0]).toEqual(firstSnapshot);
    expect(retained.sharedDrafts[1]).toMatchObject({ version: 2, quantity: 4, unitPricePaise: 200050, totalPaise: 800200, messageCount: 2 });
    expect(retained.observer).toMatchObject({ provider: "gemini", status: "ready", reviewedMessageCount: 2, callsUsed: 2 });
    expect(retained.observer.analysis).toEqual(secondReview);
    expect(retained.messages).toHaveLength(2);
    expect((await request.get(api + projectPath, { headers: client })).status()).toBe(404);
    expect((await request.get(api + projectPath + "/export", { headers: client })).status()).toBe(404);
    const originalAgain = await request.get(api + "/api/projects/" + original.id, { headers: owner });
    expect((await originalAgain.json()).project).toMatchObject({ scope: synthetic.scope, messages: synthetic.messages, proposals: [] });
    expect(messageRequests).toBe(2);
    expect(blockedRequests).toBe(0);
    await clientPage.screenshot({ path: testInfo.outputPath("live-client-shared-revisions.png"), fullPage: true });
    await testInfo.attach("live-shared-room-verification", { body: JSON.stringify({
      verifiedAt: new Date().toISOString(), health, messageRequests, observerCalls: retained.observer.callsUsed,
      sources: { scope: synthetic.scope, messages: synthetic.messages }, roomMessages: retained.messages,
      firstReview, secondReview, frozenSources: { scope: frozen.scope, messages: frozen.messages },
      proposals: revisionProject.proposals, sharedDrafts: retained.sharedDrafts,
      checks: ["independent emulator identities", "two real Gemini observations", "exact source quotes", "owner-confirmed price", "integer-paise totals", "immutable shared snapshots", "preserved revision", "client access denial", "reload persistence", "export", "keyboard and accessibility"]
    }, null, 2), contentType: "application/json" });
    await testInfo.attach("synthetic-room-draft-export", { body: exported, contentType: "text/plain" });
  } finally {
    // Pause future observation without retrying or starting a model request,
    // including when a browser assertion ends this bounded live journey early.
    if (owner && roomPath) {
      const paused = await request.post(api + roomPath + "/observer", { headers: owner, data: { action: "pause" } });
      expect(paused.ok()).toBe(true);
    }
    await clientContext?.close();
  }
});
