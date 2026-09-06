import { test, expect, APIRequestContext } from "@playwright/test";
import { FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../../backend/src/fixtures";
import { apiOrigin, authOrigin } from "./target";

const api = apiOrigin;
async function account(request: APIRequestContext) {
  const result = await request.post(authOrigin + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    data: { returnSecureToken: true }
  });
  expect(result.ok()).toBeTruthy();
  const data = await result.json();
  return { Authorization: "Bearer " + data.idToken };
}
test.beforeAll(async ({ request }) => {
  const response = await request.get(api + "/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "ok", runtime: "local", auth: "emulator", aiProvider: "fixture", storage: "firestore", storageConnection: "emulator" });
});
test("real emulator auth, tenant isolation, revision arithmetic, idempotency, and export", async ({ request }) => {
  const owner = await account(request);
  const stranger = await account(request);
  expect((await request.get(api + "/api/projects")).status()).toBe(401);
  expect((await request.get(api + "/api/projects", { headers: { Authorization: "Bearer invalid" } })).status()).toBe(401);
  const created = await request.post(api + "/api/projects", { headers: owner, data: {
    name: "Private lighting project", scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).project.id;
  for (const suffix of ["", "/export"]) {
    expect((await request.get(api + "/api/projects/" + id + suffix, { headers: stranger })).status()).toBe(404);
  }
  const unauthorizedWrite = await request.post(api + "/api/projects/" + id + "/analyze", { headers: stranger, data: {} });
  expect(unauthorizedWrite.status()).toBe(404);
  const foreignProposal = await request.post(api + "/api/projects/" + id + "/proposals", {
    headers: stranger, data: { quantity: 6, unitPricePaise: 200000, requestId: crypto.randomUUID() }
  });
  expect(foreignProposal.status()).toBe(404);
  const foreignList = await request.get(api + "/api/projects", { headers: stranger });
  expect((await foreignList.json()).projects.some((p: { id: string }) => p.id === id)).toBe(false);

  const analyzed = await request.post(api + "/api/projects/" + id + "/analyze", { headers: owner, data: {} });
  expect(analyzed.ok()).toBeTruthy();
  const analysis = (await analyzed.json()).project.analysis;
  expect(analysis.provider).toBe("fixture");
  expect(analysis.included.join(" ").toLowerCase()).toContain("kitchen");
  expect(analysis.questions.length).toBeGreaterThan(0);
  const clarified = await request.post(api + "/api/projects/" + id + "/analyze", {
    headers: owner, data: { clarification: "Please quote six display lights at the supplied rate. Client approval is not recorded." }
  });
  expect(clarified.ok()).toBeTruthy();
  const firstRequest = { quantity: 6, unitPricePaise: 200000, requestId: crypto.randomUUID() };
  const first = await request.post(api + "/api/projects/" + id + "/proposals", { headers: owner, data: firstRequest });
  expect(first.ok()).toBeTruthy();
  const firstProject = (await first.json()).project;
  expect(firstProject.proposals.at(-1).totalPaise).toBe(1200000);
  const repeats = await Promise.all(Array.from({ length: 3 }, () => request.post(api + "/api/projects/" + id + "/proposals", { headers: owner, data: firstRequest })));
  for (const repeated of repeats) {
    expect(repeated.ok()).toBeTruthy();
    expect((await repeated.json()).project.proposals.length).toBe(1);
  }
  const revised = await request.post(api + "/api/projects/" + id + "/proposals", {
    headers: owner, data: { quantity: 4, unitPricePaise: 200000, requestId: crypto.randomUUID() }
  });
  const revisions = (await revised.json()).project.proposals;
  expect(revisions).toHaveLength(2);
  expect(revisions[0].status).toBe("superseded");
  expect(revisions[1]).toMatchObject({ status: "draft", totalPaise: 800000 });
  const persisted = await request.get(api + "/api/projects/" + id, { headers: owner });
  expect((await persisted.json()).project.proposals).toEqual(revisions);
  const exportResponse = await request.get(api + "/api/projects/" + id + "/export", { headers: owner });
  expect(exportResponse.ok()).toBeTruthy();
  const exported = await exportResponse.text();
  expect(exported.toLowerCase()).toContain("draft");
  expect(exported.toLowerCase()).toContain("approval");
  const invalid = await request.post(api + "/api/projects/" + id + "/proposals", {
    headers: owner, data: { quantity: -1, unitPricePaise: 200000, requestId: crypto.randomUUID() }
  });
  expect(invalid.status()).toBe(422);
});
test("fixture mode rejects arbitrary evidence instead of posing as live Gemini", async ({ request }) => {
  const owner = await account(request);
  const created = await request.post(api + "/api/projects", {
    headers: owner, data: { name: "Unsupported sample", scope: "Build a swimming pool.", messages: "How much will it cost?" }
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).project.id;
  const response = await request.post(api + "/api/projects/" + id + "/analyze", { headers: owner, data: {} });
  expect(response.status()).toBe(422);
});
