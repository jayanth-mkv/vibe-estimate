import { test, expect, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { examples } from "../../frontend/src/lib/examples";

test.skip(process.env.CONNECTED_FIREBASE_TEST !== "1", "Requires the explicitly authorized live runner.");
const baseURL = process.env.VERIFICATION_BASE_URL!;
const responseFor = (suffix: string) => (response: Response) => response.url().startsWith(baseURL + "/api/") && response.url().endsWith(suffix) && response.request().method() === "POST";

for (const id of ["wardrobe", "finish"] as const) {
  test(`production real ${id} example review preserves unknown prices and source evidence`, async ({ page }, testInfo) => {
    const sample = examples.find(example => example.id === id)!;
    let modelCalls = 0;
    let injectedFailures = 0;
    let unknownWrites = 0;
    await page.context().route(baseURL + "/api/**", async route => {
      const r = route.request();
      if (r.method() === "POST" && /\/analyze$/.test(r.url())) {
        if (r.postDataJSON()?.resumeOnly === true) return route.continue();
        if (id === "wardrobe" && injectedFailures === 0) {
          injectedFailures++;
          return route.fulfill({ status: 502, json: { error: { code: "AI_UNAVAILABLE", message: "The review service could not complete this request. Your sources are saved; try again when you are ready." } } });
        }
        modelCalls++;
        if (modelCalls <= 1) return route.continue();
        return route.fulfill({ status: 429, json: { error: { code: "TEST_CALL_BUDGET", message: "This example permits one live review." } } });
      }
      if (r.method() === "POST" && /\/rooms\//.test(r.url())) {
        unknownWrites++;
        return route.fulfill({ status: 429, json: { error: { code: "TEST_CALL_BUDGET", message: "Room observation is outside this example." } } });
      }
      return route.continue();
    });
    await page.goto("/proposals");
    const creating = page.waitForResponse(responseFor("/api/projects"));
    await page.getByRole("button", { name: id === "wardrobe" ? "Try the wardrobe example" : "Try the finish example", exact: true }).click();
    const created = await creating;
    expect(created.status()).toBe(201);
    const original = (await created.json()).project;
    expect(original).toMatchObject(sample.source);
    const review = page.getByRole("button", { name: "Review scope and messages", exact: true });
    if (id === "wardrobe") {
      const failing = page.waitForResponse(responseFor("/analyze"));
      await review.click();
      expect((await failing).status()).toBe(502);
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Your sources are saved");
      const check = page.getByRole("button", { name: "Check review status", exact: true });
      if (await check.isVisible()) {
        const checking = page.waitForResponse(responseFor("/analyze"));
        await check.click();
        expect((await checking).status()).toBe(404);
      }
      await expect(review).toBeEnabled();
      expect(modelCalls).toBe(0);
    }
    const reviewing = page.waitForResponse(responseFor("/analyze"), { timeout: 65000 });
    await review.click();
    const reviewedResponse = await reviewing;
    expect(reviewedResponse.status()).toBe(200);
    const project = (await reviewedResponse.json()).project;
    expect(project.analysis.provider).toBe("gemini");
    expect(project.analysis.evidence.length).toBeGreaterThan(0);
    for (const evidence of project.analysis.evidence) {
      expect(["scope", "messages"]).toContain(evidence.source);
      expect(sample.source[evidence.source as "scope" | "messages"]).toContain(evidence.quote);
    }
    const questions = project.analysis.questions.join(" ");
    expect(questions).toMatch(/price|rate|cost/i);
    expect(project.analysis.proposed.join(" ")).toMatch(id === "wardrobe" ? /drawer/i : /veneer/i);
    if (id === "finish") expect(questions).toMatch(/area|measur|size|dimension/i);
    expect(project.scope).toBe(original.scope);
    expect(project.messages).toBe(original.messages);
    await page.getByRole("button", { name: "Continue to draft", exact: true }).click();
    await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Confirmed unit price (₹)", { exact: true })).toHaveValue("");
    if (id === "wardrobe") {
      // The owner supplies the price explicitly; it did not come from Gemini.
      await page.getByLabel("Proposed work", { exact: true }).fill("Three internal wardrobe drawers — synthetic owner-priced option");
      await page.getByLabel("Quantity", { exact: true }).fill("3");
      await page.getByLabel("Confirmed unit price (₹)", { exact: true }).fill("1500.25");
      const path = baseURL + `/api/projects/${project.id}/proposals`;
      await page.route(path, async route => {
        let saved;
        try { saved = await route.fetch(); } catch { throw new Error("Synthetic draft save failed; credentials withheld."); }
        expect(saved.status()).toBe(200);
        await route.abort("connectionfailed");
      }, { times: 1 });
      const firstAttempt = page.waitForRequest(r => r.url() === path && r.method() === "POST");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      const firstBody = (await firstAttempt).postDataJSON();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Your inputs are still here");
      const retrying = page.waitForResponse(responseFor("/proposals"));
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      const retried = await retrying;
      expect(retried.request().postDataJSON()).toEqual(firstBody);
      const saved = (await retried.json()).project;
      expect(saved.proposals).toHaveLength(1);
      expect(saved.proposals[0].totalPaise).toBe(450075);
      await page.reload();
      await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("3");
      await expect(page.getByRole("button", { name: "Download draft", exact: true })).toBeEnabled();
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    expect(modelCalls).toBe(1);
    expect(unknownWrites).toBe(0);
    await testInfo.attach("production-example-evidence", { contentType: "application/json", body: JSON.stringify({ verifiedAt: new Date().toISOString(), example: id, modelCalls, injectedFailures, analysis: project.analysis, ownerPriceOnly: true, viewports: [320, 390, 768, 1440] }) });
  });
}
