import { test, expect, type APIRequestContext, type Page, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import { FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../../backend/src/fixtures";
import { decodedQr } from "./qr";
import { apiOrigin, appOrigin } from "./target";

const api = apiOrigin;
const authEmulator = "http://127.0.0.1:9099";
const clientRequest = "Could we quote 6 display lights?";
const designerReply = "I will prepare a draft for 6 display lights at ₹2,000 each.";
const clientReminder = "Please keep the kitchen lighting in the agreed scope.";
type Headers = { Authorization: string };
type SharedDraft = {
  id: string; version: number; projectId: string; description: string;
  quantity: number; unitPricePaise: number; totalPaise: number;
  createdAt: string; sharedAt: string; messageCount: number;
};
type Room = {
  id: string; projectId: string; name: string; scope: string; sourceMessages: string;
  role: "designer" | "client"; clientJoined: boolean;
  messages: { id: string; role: "designer" | "client"; text: string; createdAt: string }[];
  observer: {
    status: string; provider: string; reviewedMessageCount: number; callsUsed: number; callLimit: number;
    analysis?: { included: string[]; proposed: string[]; evidence: { source: "scope" | "messages"; quote: string }[] };
    error?: string;
  };
  draftProjectId?: string; shareableDraft?: SharedDraft; sharedDrafts: SharedDraft[];
};

test.beforeAll(async ({ request }) => {
  for (const origin of new Set([apiOrigin, appOrigin])) {
    const response = await request.get(origin + "/health");
    expect(response.ok()).toBe(true);
    expect(await response.json(), "Room regression must fail before any observer call on a live/non-emulator stack.")
      .toMatchObject({ status: "ok", runtime: "local", aiProvider: "fixture", auth: "emulator", storage: "firestore", storageConnection: "emulator" });
  }
});

const responseFor = (path: string, method: string) => (response: Response) =>
  response.url() === appOrigin + path && response.request().method() === method;

async function account(request: APIRequestContext): Promise<Headers> {
  const response = await request.post(authEmulator + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    data: { returnSecureToken: true }
  });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(Boolean(data.idToken)).toBe(true);
  return { Authorization: "Bearer " + data.idToken };
}

async function getRoom(request: APIRequestContext, id: string, headers: Headers): Promise<Room> {
  const response = await request.get(api + "/api/rooms/" + id, { headers });
  expect(response.ok()).toBe(true);
  return (await response.json()).room;
}

async function observerReady(request: APIRequestContext, id: string, headers: Headers, count: number) {
  await expect.poll(async () => {
    const room = await getRoom(request, id, headers);
    return { status: room.observer.status, reviewedMessageCount: room.observer.reviewedMessageCount };
  }, { timeout: 20000, intervals: [300, 500, 1000] }).toEqual({ status: "ready", reviewedMessageCount: count });
  const room = await getRoom(request, id, headers);
  expect(room.observer.provider).toBe("fixture");
  expect(room.observer.callsUsed).toBeLessThanOrEqual(room.observer.callLimit);
  expect(room.observer.analysis?.included.join(" ")).toMatch(/kitchen/i);
  return room;
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function roomPanel(page: Page, name: "Chat" | "Scope agent" | "Drafts") {
  await expect(page.getByText(/^(Designer|Client) view$/)).toBeVisible();
  const tab = page.getByRole("tab", { name: name === "Drafts" ? /^Drafts/ : name, exact: name !== "Drafts" });
  if (await tab.isVisible()) {
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
}

async function visibleMessage(page: Page, text: string) {
  await roomPanel(page, "Chat");
  await expect(page.getByRole("log", { name: "Room conversation", exact: true }).getByText(text, { exact: true })).toBeVisible();
}

async function sendMessage(page: Page, id: string, text: string) {
  await roomPanel(page, "Chat");
  await page.getByLabel("Message the room", { exact: true }).fill(text);
  const saved = page.waitForResponse(responseFor("/api/rooms/" + id + "/messages", "POST"));
  await page.getByRole("button", { name: "Send message", exact: true }).focus();
  await page.keyboard.press("Enter");
  const response = await saved;
  expect(response.ok()).toBe(true);
  await expect(page.getByLabel("Message the room", { exact: true })).toHaveValue("");
  return { room: (await response.json()).room as Room, body: response.request().postDataJSON() as { text: string; requestId: string } };
}

async function sendMessageAfterLostResponse(page: Page, id: string, text: string) {
  await roomPanel(page, "Chat");
  await page.route(appOrigin + "/api/rooms/" + id + "/messages", async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("connectionfailed");
  }, { times: 1 });
  const firstRequest = page.waitForRequest(request => request.url() === appOrigin + "/api/rooms/" + id + "/messages" && request.method() === "POST");
  await page.getByLabel("Message the room", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const firstBody = (await firstRequest).postDataJSON();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Your inputs are still here");
  await expect(page.getByLabel("Message the room", { exact: true })).toHaveValue(text);
  const saved = page.waitForResponse(responseFor("/api/rooms/" + id + "/messages", "POST"));
  await page.getByRole("button", { name: "Retry message", exact: true }).focus();
  await page.keyboard.press("Enter");
  const response = await saved;
  expect(response.ok()).toBe(true);
  const body = response.request().postDataJSON() as { text: string; requestId: string };
  expect(body, "A lost response retries the same persisted message request.").toEqual(firstBody);
  const room = (await response.json()).room as Room;
  expect(room.messages).toHaveLength(1);
  await expect(page.getByLabel("Message the room", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry message", exact: true })).toHaveCount(0);
  return { room, body };
}

async function createApiRoom(request: APIRequestContext, owner: Headers) {
  const projectResponse = await request.post(api + "/api/projects", {
    headers: owner, data: { name: "Synthetic shared lighting", scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES }
  });
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()).project;
  const response = await request.post(api + "/api/projects/" + project.id + "/room", { headers: owner, data: {} });
  expect(response.ok()).toBe(true);
  const data = await response.json() as { room: Room; inviteToken: string };
  expect(Boolean(data.inviteToken)).toBe(true);
  return { ...data, project };
}

test("independent designer and client exchange messages, preserve shared revisions, and reopen their room", async ({ page, browser, request }, testInfo) => {
  test.setTimeout(150000);
  await page.goto("/");
  const created = page.waitForResponse(responseFor("/api/projects", "POST"));
  await page.getByRole("button", { name: "Try the lighting example", exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const originalProject = (await createdResponse.json()).project;
  const ownerAuthorization = await createdResponse.request().headerValue("authorization");
  expect(Boolean(ownerAuthorization?.startsWith("Bearer "))).toBe(true);
  const owner = { Authorization: ownerAuthorization! };

  const started = page.waitForResponse(responseFor("/api/projects/" + originalProject.id + "/room", "POST"));
  await page.getByRole("button", { name: "Start shared room", exact: true }).click();
  const startedResponse = await started;
  expect(startedResponse.ok()).toBe(true);
  const initialRoom = (await startedResponse.json()).room as Room;
  const roomPath = "/api/rooms/" + initialRoom.id;
  await expect(page).toHaveURL(new RegExp("/rooms/" + initialRoom.id + "$"));
  await expect(page.getByText("Designer view", { exact: true })).toBeVisible();
  expect(initialRoom.observer).toMatchObject({ provider: "fixture", callsUsed: 0 });
  expect(initialRoom.scope).toBe(originalProject.scope);
  expect(initialRoom.sourceMessages).toBe(originalProject.messages);

  await page.getByRole("button", { name: "Invite client", exact: true }).click();
  await page.getByRole("button", { name: "Create invite link", exact: true }).click();
  const inviteLink = page.getByRole("link", { name: "Open client demo", exact: true });
  await expect(inviteLink).toBeVisible();
  const inviteUrl = await inviteLink.getAttribute("href");
  expect(Boolean(inviteUrl)).toBe(true);
  const parsedInvite = new URL(inviteUrl!, page.url());
  expect(parsedInvite.origin).toBe(appOrigin);
  const inviteToken = new URLSearchParams(parsedInvite.hash.slice(1)).get("invite");
  expect(Boolean(inviteToken)).toBe(true);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Invite client", exact: true })).toBeFocused();

  const clientContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 1000 },
    isMobile: Boolean(testInfo.project.use.isMobile),
    hasTouch: Boolean(testInfo.project.use.hasTouch)
  });
  const clientPage = await clientContext.newPage();
  try {
    const joined = clientPage.waitForResponse(responseFor(roomPath + "/join", "POST"));
    await clientPage.goto(parsedInvite.toString());
    const joinedResponse = await joined;
    expect(joinedResponse.ok()).toBe(true);
    const clientAuthorization = await joinedResponse.request().headerValue("authorization");
    expect(Boolean(clientAuthorization?.startsWith("Bearer "))).toBe(true);
    expect(ownerAuthorization !== clientAuthorization, "Designer and client must use distinct authenticated identities.").toBe(true);
    const client = { Authorization: clientAuthorization! };
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(clientPage.url()).hash === "", { timeout: 10000 }).toBe(true);
    await expect(clientPage.getByRole("button", { name: "Prepare draft", exact: true })).toHaveCount(0);
    await expect(clientPage.getByRole("button", { name: "Share saved draft", exact: true })).toHaveCount(0);

    const clientMessage = await sendMessageAfterLostResponse(clientPage, initialRoom.id, clientRequest);
    await visibleMessage(page, clientRequest);
    const designerMessage = await sendMessage(page, initialRoom.id, designerReply);
    await visibleMessage(clientPage, designerReply);
    const reviewed = await observerReady(request, initialRoom.id, owner, 2);
    expect(reviewed.messages.map(message => ({ role: message.role, text: message.text }))).toEqual([
      { role: "client", text: clientRequest }, { role: "designer", text: designerReply }
    ]);
    expect(reviewed.observer.callsUsed).toBeGreaterThan(0);
    expect(reviewed.observer.callsUsed).toBeLessThanOrEqual(2);
    await roomPanel(page, "Scope agent");
    await expect(page.getByText("Review up to date", { exact: true })).toBeVisible();
    await roomPanel(clientPage, "Scope agent");

    for (const [headers, body] of [[client, clientMessage.body], [owner, designerMessage.body]] as const) {
      const replay = await request.post(api + roomPath + "/messages", { headers, data: body });
      expect(replay.ok()).toBe(true);
      const replayed = (await replay.json()).room as Room;
      expect(replayed.messages).toEqual(reviewed.messages);
      expect(replayed.observer.callsUsed).toBe(reviewed.observer.callsUsed);
    }

    await accessible(page);
    await accessible(clientPage);
    await page.screenshot({ path: testInfo.outputPath("designer-room-review.png"), fullPage: true });
    await clientPage.screenshot({ path: testInfo.outputPath("client-room-review.png"), fullPage: true });

    const prepared = page.waitForResponse(responseFor(roomPath + "/prepare-draft", "POST"));
    await page.getByRole("button", { name: "Prepare draft", exact: true }).focus();
    await page.keyboard.press("Enter");
    const preparedResponse = await prepared;
    expect(preparedResponse.ok()).toBe(true);
    const frozenProject = (await preparedResponse.json()).project;
    expect(frozenProject.id).not.toBe(originalProject.id);
    expect(frozenProject.scope).toBe(originalProject.scope);
    expect(frozenProject.messages).toContain(clientRequest);
    expect(frozenProject.messages).toContain(designerReply);
    expect(frozenProject.analysis.provider).toBe("fixture");
    for (const evidence of frozenProject.analysis.evidence as { source: "scope" | "messages"; quote: string }[]) {
      expect(frozenProject[evidence.source]).toContain(evidence.quote);
    }
    await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
    await page.getByLabel("Number of display lights", { exact: true }).fill("6");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    expect(await page.getByLabel("Confirmed unit price (₹)", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("2000");
    await expect(page.locator("output")).toHaveText("₹12,000");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your saved draft", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to room", exact: true }).click();
    await roomPanel(page, "Drafts");
    await page.getByRole("button", { name: "Share saved draft", exact: true }).click();
    await roomPanel(clientPage, "Drafts");
    await expect(clientPage.getByRole("article", { name: "Shared draft 1", exact: true })).toContainText("₹12,000");
    const firstShare = await getRoom(request, initialRoom.id, owner);
    expect(firstShare.sharedDrafts).toHaveLength(1);
    expect(firstShare.sharedDrafts[0]).toMatchObject({ version: 1, quantity: 6, unitPricePaise: 200000, totalPaise: 1200000, messageCount: 2 });
    const firstSnapshot = structuredClone(firstShare.sharedDrafts[0]);
    const repeatedShare = await request.post(api + roomPath + "/share-draft", { headers: owner, data: {} });
    expect(repeatedShare.ok()).toBe(true);
    expect((await repeatedShare.json()).room.sharedDrafts).toEqual(firstShare.sharedDrafts);

    const reopened = page.waitForResponse(responseFor(roomPath + "/prepare-draft", "POST"));
    await roomPanel(page, "Scope agent");
    await page.getByRole("button", { name: "Prepare draft", exact: true }).click();
    expect((await (await reopened).json()).project.id).toBe(frozenProject.id);
    await expect(page.getByLabel("Number of display lights", { exact: true })).toHaveValue("6");
    await page.getByLabel("Number of display lights", { exact: true }).fill("4");
    await expect(page.locator("output")).toHaveText("₹8,000");
    await page.getByRole("button", { name: "Save revision", exact: true }).click();
    await expect(page.getByRole("row", { name: /Draft 2/ })).toContainText("₹8,000");
    await expect(page.getByRole("row", { name: /Draft 1/ })).toContainText("₹12,000");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download draft", exact: true }).click();
    const download = await downloadEvent;
    const exportFile = await download.path();
    expect(Boolean(exportFile)).toBe(true);
    const exportText = await fs.readFile(exportFile!, "utf8");
    expect(exportText).toMatch(/8,?000/);
    expect(exportText.toLowerCase()).toContain("approval has not been collected");
    expect(exportText).toContain(clientRequest);
    await page.getByRole("button", { name: "Back to room", exact: true }).click();
    await roomPanel(page, "Drafts");
    await page.getByRole("button", { name: "Share saved draft", exact: true }).click();
    await expect(clientPage.getByRole("article", { name: "Shared draft 2", exact: true })).toContainText("₹8,000");
    const secondShare = await getRoom(request, initialRoom.id, owner);
    expect(secondShare.sharedDrafts).toHaveLength(2);
    expect(secondShare.sharedDrafts[0]).toEqual(firstSnapshot);
    expect(secondShare.sharedDrafts[1]).toMatchObject({ version: 2, quantity: 4, unitPricePaise: 200000, totalPaise: 800000, messageCount: 2 });
    expect(secondShare.observer.callsUsed, "Preparing, saving, exporting, and sharing must not call the observer again.").toBe(reviewed.observer.callsUsed);

    await sendMessage(clientPage, initialRoom.id, clientReminder);
    await visibleMessage(page, clientReminder);
    await observerReady(request, initialRoom.id, owner, 3);
    expect((await getRoom(request, initialRoom.id, owner)).sharedDrafts).toEqual(secondShare.sharedDrafts);
    const originalAgain = await request.get(api + "/api/projects/" + originalProject.id, { headers: owner });
    const retainedOriginal = (await originalAgain.json()).project;
    expect(retainedOriginal.scope).toBe(originalProject.scope);
    expect(retainedOriginal.messages).toBe(originalProject.messages);
    const frozenAgain = await request.get(api + "/api/projects/" + frozenProject.id, { headers: owner });
    expect((await frozenAgain.json()).project.messages).toBe(frozenProject.messages);

    await page.reload();
    await clientPage.reload();
    await expect(page.getByText("Designer view", { exact: true })).toBeVisible();
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    for (const current of [page, clientPage]) {
      await roomPanel(current, "Drafts");
      await expect(current.getByRole("article", { name: "Shared draft 1", exact: true })).toContainText("₹12,000");
      await expect(current.getByRole("article", { name: "Shared draft 2", exact: true })).toContainText("₹8,000");
      await accessible(current);
      await visibleMessage(current, clientReminder);
      await accessible(current);
    }
    await roomPanel(clientPage, "Drafts");
    await clientPage.screenshot({ path: testInfo.outputPath("client-shared-revisions.png"), fullPage: true });

    const stranger = await account(request);
    expect((await request.get(api + roomPath)).status()).toBe(401);
    expect((await request.get(api + roomPath, { headers: stranger })).status()).toBe(404);
    expect((await request.post(api + roomPath + "/join", { headers: stranger, data: { inviteToken } })).status()).toBe(403);
    expect((await request.post(api + roomPath + "/join", { headers: client, data: { inviteToken } })).ok()).toBe(true);
    for (const endpoint of ["invite", "observer", "prepare-draft", "share-draft"]) {
      const data = endpoint === "observer" ? { action: "pause" } : {};
      expect((await request.post(api + roomPath + "/" + endpoint, { headers: client, data })).status()).toBe(403);
    }
    for (const id of [originalProject.id, frozenProject.id]) {
      expect((await request.get(api + "/api/projects/" + id, { headers: client })).status()).toBe(404);
      expect((await request.get(api + "/api/projects/" + id + "/export", { headers: client })).status()).toBe(404);
    }
    const clientRoom = await getRoom(request, initialRoom.id, client);
    expect(clientRoom.draftProjectId).toBeUndefined();
    expect(clientRoom.shareableDraft).toBeUndefined();
    expect(JSON.stringify(clientRoom)).not.toMatch(/"(?:ownerId|ownerUid|clientUid|senderUid|inviteHash|requestId|privateHistory)"\s*:/);
  } finally {
    await clientContext.close();
  }
});

test("room API enforces roles, replay and paused-observer boundaries before preparing a snapshot", async ({ request }) => {
  test.setTimeout(45000);
  const owner = await account(request);
  const client = await account(request);
  const stranger = await account(request);
  const { room, inviteToken, project } = await createApiRoom(request, owner);
  const roomPath = "/api/rooms/" + room.id;
  expect(room.observer.callsUsed).toBe(0);
  const repeated = await request.post(api + "/api/projects/" + project.id + "/room", { headers: owner, data: {} });
  expect((await repeated.json()).room.id).toBe(room.id);
  // Re-creation may rotate an unused invite, so explicitly request the current one.
  const rotated = await request.post(api + roomPath + "/invite", { headers: owner, data: {} });
  expect(rotated.ok()).toBe(true);
  const freshInvite = (await rotated.json()).inviteToken;
  expect(Boolean(freshInvite)).toBe(true);
  expect((await request.post(api + roomPath + "/join", { headers: client, data: { inviteToken } })).status()).toBe(403);
  expect((await request.post(api + roomPath + "/join", { headers: client, data: { inviteToken: freshInvite } })).ok()).toBe(true);

  expect((await request.post(api + roomPath + "/prepare-draft", { headers: owner, data: {} })).status()).toBe(409);
  expect((await request.post(api + roomPath + "/messages", { data: { text: clientRequest, requestId: crypto.randomUUID() } })).status()).toBe(401);
  expect((await request.post(api + roomPath + "/messages", { headers: stranger, data: { text: clientRequest, requestId: crypto.randomUUID() } })).status()).toBe(404);
  expect((await request.post(api + roomPath + "/messages", { headers: client, data: { text: clientRequest, requestId: crypto.randomUUID(), role: "designer" } })).status()).toBe(422);
  expect((await request.post(api + roomPath + "/share-draft", { headers: owner, data: { totalPaise: 1, approved: true } })).status()).toBe(422);
  expect((await getRoom(request, room.id, owner)).observer.callsUsed).toBe(0);

  expect((await request.post(api + roomPath + "/observer", { headers: owner, data: { action: "pause" } })).ok()).toBe(true);
  const firstBody = { text: clientRequest, requestId: crypto.randomUUID() };
  const secondBody = { text: designerReply, requestId: crypto.randomUUID() };
  for (const [headers, data] of [[client, firstBody], [owner, secondBody]] as const) {
    expect((await request.post(api + roomPath + "/messages", { headers, data })).ok()).toBe(true);
  }
  const replay = await request.post(api + roomPath + "/messages", { headers: client, data: firstBody });
  expect(replay.ok()).toBe(true);
  const paused = (await replay.json()).room as Room;
  expect(paused.observer).toMatchObject({ status: "paused", callsUsed: 0 });
  expect(paused.messages).toHaveLength(2);
  expect((await request.post(api + roomPath + "/messages", { headers: client, data: { ...firstBody, text: clientReminder } })).status()).toBe(409);
  expect((await request.post(api + roomPath + "/prepare-draft", { headers: owner, data: {} })).status()).toBe(409);

  expect((await request.post(api + roomPath + "/observer", { headers: owner, data: { action: "resume" } })).ok()).toBe(true);
  const ready = await observerReady(request, room.id, owner, 2);
  expect(ready.observer.callsUsed).toBe(1);
  const prepared = await request.post(api + roomPath + "/prepare-draft", { headers: owner, data: {} });
  expect(prepared.ok()).toBe(true);
  const frozen = (await prepared.json()).project;
  const preparedAgain = await request.post(api + roomPath + "/prepare-draft", { headers: owner, data: {} });
  expect((await preparedAgain.json()).project.id).toBe(frozen.id);
  expect((await getRoom(request, room.id, owner)).observer.callsUsed).toBe(1);
});

test("unsupported fixture messages remain saved with a visible observer failure and bounded explicit retry", async ({ request, page }) => {
  test.setTimeout(45000);
  await page.goto("/");
  const created = page.waitForResponse(responseFor("/api/projects", "POST"));
  await page.getByRole("button", { name: "Try the lighting example", exact: true }).click();
  const projectResponse = await created;
  const project = (await projectResponse.json()).project;
  const authorization = await projectResponse.request().headerValue("authorization");
  expect(Boolean(authorization)).toBe(true);
  const owner = { Authorization: authorization! };
  const started = page.waitForResponse(responseFor("/api/projects/" + project.id + "/room", "POST"));
  await page.getByRole("button", { name: "Start shared room", exact: true }).click();
  const room = (await (await started).json()).room as Room;
  const unsupported = "Please quote a marble feature wall.";
  await sendMessage(page, room.id, unsupported);
  await visibleMessage(page, unsupported);
  await roomPanel(page, "Scope agent");
  await expect(page.getByText("Review needs attention", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Prepare draft", exact: true })).toBeDisabled();
  const failed = await getRoom(request, room.id, owner);
  expect(failed.observer).toMatchObject({ status: "error", provider: "fixture", callsUsed: 1 });
  expect(failed.observer.analysis).toBeUndefined();
  await page.getByRole("button", { name: "Retry review", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await getRoom(request, room.id, owner)).observer.callsUsed).toBe(2);
  await expect(page.getByText("Review needs attention", { exact: true })).toBeVisible();
  await page.reload();
  await visibleMessage(page, unsupported);
  await roomPanel(page, "Scope agent");
  await expect(page.getByText("Review needs attention", { exact: true })).toBeVisible();
  expect((await getRoom(request, room.id, owner)).observer.callsUsed).toBe(2);
  await accessible(page);
});

test("guest room codes and scannable invitations support rotation, keyboard entry, and private membership", async ({ page, browser, request }, testInfo) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  const created = page.waitForResponse(responseFor("/api/projects", "POST"));
  await page.getByRole("button", { name: "Try the lighting example", exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const project = (await createdResponse.json()).project;
  const ownerAuthorization = await createdResponse.request().headerValue("authorization");
  expect(Boolean(ownerAuthorization?.startsWith("Bearer "))).toBe(true);
  const owner = { Authorization: ownerAuthorization! };
  const started = page.waitForResponse(responseFor("/api/projects/" + project.id + "/room", "POST"));
  await page.getByRole("button", { name: "Start shared room", exact: true }).click();
  const room = (await (await started).json()).room as Room;
  const roomPath = "/api/rooms/" + room.id;
  const invite = page.getByRole("button", { name: "Invite client", exact: true });
  await invite.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Create invite link", exact: true }).click();
  const code = dialog.getByLabel("Room code", { exact: true });
  await expect(code).toHaveText(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
  const oldCode = (await code.innerText()).replace(/[\s-]/g, "");
  const oldHref = await dialog.getByRole("link", { name: "Open client demo", exact: true }).getAttribute("href");
  expect(Boolean(oldHref)).toBe(true);
  expect((await decodedQr(dialog.getByRole("img", { name: "Scan to join the project room", exact: true }))) === oldHref,
    "The displayed QR code must resolve to the exact current client invitation.").toBe(true);
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(invite).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(code).toHaveText(new RegExp(oldCode.match(/.{4}/g)!.join("-")));
  const rotated = page.waitForResponse(responseFor(roomPath + "/invite", "POST"));
  await dialog.getByRole("button", { name: "Create a new invitation", exact: true }).click();
  const rotatedResponse = await rotated;
  expect(rotatedResponse.ok()).toBe(true);
  const freshInvite = await rotatedResponse.json();
  const freshCode = freshInvite.joinCode as string;
  expect(Boolean(freshCode && freshCode.replace(/[\s-]/g, "") !== oldCode)).toBe(true);
  await expect(code).toHaveText(freshCode);
  const freshHref = await dialog.getByRole("link", { name: "Open client demo", exact: true }).getAttribute("href");
  expect(Boolean(freshHref && freshHref !== oldHref)).toBe(true);
  expect((await decodedQr(dialog.getByRole("img", { name: "Scan to join the project room", exact: true }))) === freshHref).toBe(true);
  await page.keyboard.press("Escape");

  const clientContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 1000 },
    isMobile: Boolean(testInfo.project.use.isMobile), hasTouch: Boolean(testInfo.project.use.hasTouch)
  });
  const clientPage = await clientContext.newPage();
  try {
    await clientPage.goto("/");
    await clientPage.getByRole("link", { name: "Join a room", exact: true }).focus();
    await clientPage.keyboard.press("Enter");
    await expect(clientPage).toHaveURL(/\/join$/);
    await expect(clientPage.getByRole("heading", { name: "Join your project room.", exact: true })).toBeVisible();
    const input = clientPage.getByLabel("Room code", { exact: true });
    const submit = clientPage.getByRole("button", { name: "Join room", exact: true });
    let codeRequests = 0;
    clientPage.on("request", request => { if (request.url() === appOrigin + "/api/rooms/join" && request.method() === "POST") codeRequests += 1; });
    for (const invalid of ["", "ABCD", "IIII-OOOO-LLLL"]) {
      await input.fill(invalid);
      await submit.focus();
      await clientPage.keyboard.press("Enter");
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(clientPage.getByRole("main").getByRole("alert")).toHaveText("Enter the 12-character room code from your designer. Spaces and hyphens are optional.");
    }
    expect(codeRequests, "Malformed input must be rejected before authentication or a join request.").toBe(0);
    await expect(input).toHaveAttribute("maxlength", "32");
    if (testInfo.project.name.includes("mobile")) await clientPage.setViewportSize({ width: 320, height: 740 });
    await accessible(clientPage);
    await input.fill(oldCode.toLowerCase());
    const rejected = clientPage.waitForResponse(responseFor("/api/rooms/join", "POST"));
    await submit.click();
    const rejectedResponse = await rejected;
    expect(rejectedResponse.status()).toBe(403);
    expect((await rejectedResponse.json()).error.code).toBe("INVITE_INVALID");
    await expect(input).toHaveValue(oldCode);
    await expect(clientPage.getByRole("main").getByRole("alert")).toBeVisible();

    // Case, spaces, and hyphens are accepted without changing the room identity.
    const formatted = freshCode.replace(/-/g, "").toLowerCase().match(/.{4}/g)!.join(" - ");
    await input.fill(formatted);
    const joined = clientPage.waitForResponse(responseFor("/api/rooms/join", "POST"));
    await submit.focus();
    await clientPage.keyboard.press("Enter");
    const joinedResponse = await joined;
    expect(joinedResponse.ok()).toBe(true);
    const clientAuthorization = await joinedResponse.request().headerValue("authorization");
    expect(Boolean(clientAuthorization && clientAuthorization !== ownerAuthorization)).toBe(true);
    const client = { Authorization: clientAuthorization! };
    await expect(clientPage).toHaveURL(new RegExp("/client/rooms/" + room.id + "$"));
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    expect(codeRequests).toBe(2);
    await roomPanel(clientPage, "Scope agent");
    await expect(clientPage.getByRole("button", { name: "Prepare draft", exact: true })).toHaveCount(0);
    await accessible(clientPage);
    await clientPage.reload();
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    expect((await getRoom(request, room.id, client)).role).toBe("client");
    expect((await request.get(api + "/api/projects/" + project.id, { headers: client })).status()).toBe(404);
    const repeated = await request.post(api + "/api/rooms/join", { headers: client, data: { joinCode: freshCode } });
    expect(repeated.ok()).toBe(true);
    const outsider = await account(request);
    expect((await request.post(api + "/api/rooms/join", { headers: outsider, data: { joinCode: freshCode } })).status()).toBe(403);
    expect((await request.get(api + roomPath, { headers: outsider })).status()).toBe(404);
    expect((await getRoom(request, room.id, owner)).observer.callsUsed).toBe(0);
    await expect(page.getByRole("button", { name: "Client access", exact: true })).toBeVisible();
  } finally { await clientContext.close(); }
});
