import { test, expect, type APIRequestContext, type Page, type Response, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { decodedQr } from "../e2e/qr";
import type { Room } from "../../backend/src/room-types";

test.skip(process.env.CONNECTED_FIREBASE_TEST !== "1", "Requires the explicitly authorized production runner.");
const baseURL = process.env.VERIFICATION_BASE_URL!;
const responseFor = (path: string, method = "POST") => (response: Response) => response.url() === baseURL + path && response.request().method() === method;
const safeApi = (raw: APIRequestContext): Pick<APIRequestContext, "get" | "post"> => ({
  async get(...args) { try { return await raw.get(...args); } catch { throw new Error("Verification read failed; credentials withheld."); } },
  async post(...args) { try { return await raw.post(...args); } catch { throw new Error("Verification write failed; credentials withheld."); } },
});
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function panel(page: Page, name: "Chat" | "Scope agent" | "Drafts") {
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.isVisible()) {
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
}

test("production invitations, independent same-browser client, mobile room and safe message recovery without model calls", async ({ page, browser, context, request: raw }, testInfo) => {
  test.setTimeout(360000);
  const request = safeApi(raw);
  let blocked = 0;
  let messagesAllowed = false;
  const guard = async (route: Route) => {
    const r = route.request();
    const pathname = new URL(r.url()).pathname;
    if (r.method() === "POST" && (/\/analyze$/.test(pathname) || /^\/internal\//.test(pathname)
      || /\/messages$/.test(pathname) && !messagesAllowed
      || /\/observer$/.test(pathname) && !["pause", "resume"].includes(r.postDataJSON()?.action))) {
      blocked++;
      return route.fulfill({ status: 429, json: { error: { code: "TEST_CALL_BUDGET", message: "This verification permits no model calls." } } });
    }
    return route.continue();
  };
  await context.route(baseURL + "/api/**", guard);
  await page.goto("/");
  const creating = page.waitForResponse(responseFor("/api/projects"));
  await page.getByRole("button", { name: "Try the lighting example", exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const project = (await created.json()).project;
  const owner = { Authorization: (await created.request().headerValue("authorization"))! };
  const starting = page.waitForResponse(responseFor(`/api/projects/${project.id}/room`));
  await page.getByRole("button", { name: "Start shared room", exact: true }).click();
  const room = (await (await starting).json()).room as Room;
  const roomPath = `/api/rooms/${room.id}`;
  const read = async (headers = owner): Promise<Room> => {
    const response = await request.get(baseURL + roomPath, { headers });
    expect(response.status()).toBe(200);
    return (await response.json()).room;
  };
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    expect(room.observer.callsUsed).toBe(0);
    await page.getByRole("button", { name: "Pause agent", exact: true }).click();
    await expect.poll(async () => (await read()).observer.status).toBe("paused");
    await page.getByRole("button", { name: "Resume agent", exact: true }).click();
    await expect.poll(async () => (await read()).observer.status).toBe("watching");
    expect((await read()).observer.callsUsed).toBe(0);
    await page.getByRole("button", { name: "Pause agent", exact: true }).click();
    await expect.poll(async () => (await read()).observer.status).toBe("paused");
    await expect(page.getByRole("button", { name: "Prepare draft", exact: true })).toBeDisabled();
    const invite = page.getByRole("button", { name: "Invite client", exact: true });
    await invite.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create invite link", exact: true }).click();
    const code = dialog.getByLabel("Room code", { exact: true });
    await expect(code).toHaveText(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
    const oldCode = (await code.innerText()).replace(/-/g, "");
    const oldHref = (await dialog.getByRole("link", { name: "Open client view", exact: true }).getAttribute("href"))!;
    expect(await decodedQr(dialog.getByRole("img", { name: "Scan to join the project room", exact: true })) === oldHref).toBe(true);
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await accessible(page); }
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await dialog.getByRole("button", { name: "Copy room code", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText()) === await code.innerText()).toBe(true);
    await dialog.getByRole("button", { name: "Copy invite link", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText()) === oldHref).toBe(true);
    await page.keyboard.press("Escape"); await expect(invite).toBeFocused();
    await page.keyboard.press("Enter");
    const rotating = page.waitForResponse(responseFor(roomPath + "/invite"));
    await dialog.getByRole("button", { name: "Create a new invitation", exact: true }).click();
    expect((await rotating).status()).toBe(200);
    const freshCode = await code.innerText();
    const freshHref = (await dialog.getByRole("link", { name: "Open client view", exact: true }).getAttribute("href"))!;
    expect(freshCode.replace(/-/g, "") !== oldCode && freshHref !== oldHref).toBe(true);
    expect(await decodedQr(dialog.getByRole("img", { name: "Scan to join the project room", exact: true })) === freshHref).toBe(true);
    await page.keyboard.press("Escape");

    const outsiderPage = await other.newPage();
    await other.route(baseURL + "/api/**", guard);
    await outsiderPage.goto(baseURL + "/join");
    const input = outsiderPage.getByLabel("Room code", { exact: true });
    const submit = outsiderPage.getByRole("button", { name: "Join room", exact: true });
    let joinRequests = 0;
    outsiderPage.on("request", r => { if (r.url() === baseURL + "/api/rooms/join" && r.method() === "POST") joinRequests++; });
    for (const invalid of ["", "ABCD", "IIII-OOOO-LLLL"]) {
      await input.fill(invalid); await submit.focus(); await outsiderPage.keyboard.press("Enter");
      await expect(input).toBeFocused(); await expect(input).toHaveAttribute("aria-invalid", "true");
    }
    expect(joinRequests).toBe(0);
    await accessible(outsiderPage);
    await input.fill(oldCode.toLowerCase());
    const rejection = outsiderPage.waitForResponse(responseFor("/api/rooms/join"));
    await submit.click();
    const rejected = await rejection;
    expect(rejected.status()).toBe(403);
    expect((await rejected.json()).error.code).toBe("INVITE_INVALID");
    const stranger = { Authorization: (await rejected.request().headerValue("authorization"))! };
    const staleLink = await request.post(baseURL + roomPath + "/join", { headers: stranger, data: { inviteToken: new URL(oldHref).hash.slice(1).split("=")[1] } });
    expect(staleLink.status()).toBe(403);

    // Same browser, separate named Firebase apps: this must not adopt the owner.
    const clientPage = await context.newPage();
    const joining = clientPage.waitForResponse(responseFor(roomPath + "/join"));
    await clientPage.goto(freshHref);
    const joined = await joining;
    expect(joined.status()).toBe(200);
    const client = { Authorization: (await joined.request().headerValue("authorization"))! };
    const uid = (value: string) => JSON.parse(Buffer.from(value.slice(7).split(".")[1], "base64url").toString()).sub;
    expect(Boolean(uid(client.Authorization) && uid(client.Authorization) !== uid(owner.Authorization))).toBe(true);
    await expect.poll(() => new URL(clientPage.url()).hash === "").toBe(true);
    await expect(clientPage.getByText("Client view", { exact: true })).toBeVisible();
    expect((await read(client)).role).toBe("client");
    expect((await request.get(baseURL + roomPath)).status()).toBe(401);
    expect((await request.get(baseURL + roomPath, { headers: stranger })).status()).toBe(404);
    expect((await request.post(baseURL + "/api/rooms/join", { headers: stranger, data: { joinCode: freshCode } })).status()).toBe(403);
    for (const [suffix, data] of [["/invite", {}], ["/observer", { action: "pause" }], ["/prepare-draft", {}], ["/share-draft", {}]] as const) {
      expect((await request.post(baseURL + roomPath + suffix, { headers: client, data })).status()).toBe(403);
    }
    expect((await request.get(baseURL + `/api/projects/${project.id}/export`, { headers: client })).status()).toBe(404);

    messagesAllowed = true; // Server confirmed paused before any saved message.
    const text = "Synthetic retry check: keep the original scope. No work or price is approved.";
    await clientPage.route(baseURL + roomPath + "/messages", async route => {
      let response;
      try { response = await route.fetch(); } catch { throw new Error("Synthetic message save failed; credentials withheld."); }
      expect(response.ok()).toBe(true);
      await route.abort("connectionfailed");
    }, { times: 1 });
    const firstAttempt = clientPage.waitForRequest(r => r.url() === baseURL + roomPath + "/messages" && r.method() === "POST");
    await clientPage.getByLabel("Message the room", { exact: true }).fill(text);
    await clientPage.getByRole("button", { name: "Send message", exact: true }).click();
    const firstBody = (await firstAttempt).postDataJSON();
    await expect(clientPage.getByRole("button", { name: "Retry message", exact: true })).toBeVisible();
    await expect(clientPage.getByLabel("Message the room", { exact: true })).toHaveValue(text);
    const retrying = clientPage.waitForResponse(responseFor(roomPath + "/messages"));
    await clientPage.getByRole("button", { name: "Retry message", exact: true }).click();
    const retried = await retrying;
    expect(retried.status()).toBe(200);
    expect(retried.request().postDataJSON()).toEqual(firstBody);
    expect((await retried.json()).room.messages).toHaveLength(1);
    await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
    const reply = "Synthetic designer reply: the saved conversation is visible in both views.";
    const replying = page.waitForResponse(responseFor(roomPath + "/messages"));
    await page.getByLabel("Message the room", { exact: true }).fill(reply);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    expect((await replying).status()).toBe(200);
    await expect(clientPage.getByRole("log").getByText(reply, { exact: true })).toBeVisible();

    for (const current of [page, clientPage]) {
      for (const width of [320, 390, 768, 1440]) {
        await current.setViewportSize({ width, height: 1000 });
        for (const name of ["Chat", "Scope agent", "Drafts"] as const) { await panel(current, name); await accessible(current); }
      }
      await current.setViewportSize({ width: 390, height: 844 }); await panel(current, "Chat");
      await current.reload();
      await expect(current.getByRole("log").getByText(reply, { exact: true })).toBeVisible();
    }
    let dropped = 0;
    await clientPage.getByLabel("Message the room", { exact: true }).fill("Synthetic unsent message kept through reconnect.");
    await clientPage.route(baseURL + roomPath, async route => { if (route.request().method() === "GET") { dropped++; return route.abort("internetdisconnected"); } return route.continue(); });
    await expect(clientPage.getByText("Connection interrupted. Your saved conversation is here; reconnecting…", { exact: true })).toBeVisible();
    await expect(clientPage.getByLabel("Message the room", { exact: true })).toHaveValue("Synthetic unsent message kept through reconnect.");
    await clientPage.unroute(baseURL + roomPath);
    await expect(clientPage.getByText("Room synced", { exact: true })).toBeVisible();
    expect(dropped).toBeGreaterThan(0);
    await clientPage.getByRole("link", { name: "VibeEstimate", exact: true }).click();
    await expect(clientPage.getByRole("alertdialog")).toBeVisible();
    await clientPage.getByRole("button", { name: "Keep writing", exact: true }).click();
    await expect(clientPage.getByLabel("Message the room", { exact: true })).toHaveValue("Synthetic unsent message kept through reconnect.");
    await clientPage.getByLabel("Message the room", { exact: true }).fill("");
    const retained = await read();
    expect(retained.observer).toMatchObject({ status: "paused", callsUsed: 0 });
    expect(retained.messages).toHaveLength(2);
    expect(blocked).toBe(0);
    await testInfo.attach("production-access-checks", { contentType: "application/json", body: JSON.stringify({ verifiedAt: new Date().toISOString(), modelCalls: 0, viewports: [320, 390, 768, 1440], checks: ["QR decoding", "clipboard", "invitation rotation", "stale code/link denial", "direct link join", "same-browser independent guest apps", "client/stranger API denial", "paused observer", "lost successful message response retry", "both-direction persisted chat", "responsive room tabs and axe", "reload", "reconnect preserves composer", "unsent navigation cancellation"] }) });
  } finally {
    // Message writes are enabled only after the persisted paused state. There
    // is no later resume, so teardown cannot start or leave paid work queued.
    await other.close();
  }
});
