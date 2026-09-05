import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProvider, SYSTEM_INSTRUCTION } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { fixtureAnalysis, FIXTURE_NAME, FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../src/fixtures.js";
import { newProject } from "../src/store.js";

const mocked = vi.hoisted(() => ({ generate: vi.fn(), token: vi.fn() }));
vi.mock("@google/genai", async importOriginal => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent: mocked.generate }; }
}));
vi.mock("../src/vertex-auth.js", () => ({ obtainLocalVertexToken: mocked.token }));

const project = () => newProject("synthetic-owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
const config = (model: string, transport: "developer" | "vertex") => readConfig({
  APP_ENV: "local", AI_PROVIDER: "gemini", GEMINI_MODEL: model, GEMINI_TRANSPORT: transport,
  ...(transport === "developer" ? { GEMINI_API_KEY: "synthetic-key" } : {
    VERTEX_PROJECT_ID: "synthetic-vertex-project", VERTEX_LOCATION: "global",
    VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner", VERTEX_GCLOUD_ACCOUNT: "owner@example.test",
    VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud-config")
  })
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.token.mockResolvedValue("synthetic-token");
  const { provider: _provider, ...analysis } = fixtureAnalysis(project());
  mocked.generate.mockResolvedValue({ text: JSON.stringify(analysis) });
});

describe("Gemini 3.7 request compatibility", () => {
  it.each(["developer", "vertex"] as const)("sends supported bounded 3.7 settings through %s while retaining review history and source validation", async transport => {
    const original = project();
    const provider = createProvider(config("gemini-3.7-flash", transport));
    const first = await provider.analyze(original);
    const second = await provider.analyze({ ...original, ...first }, "Quote six display lights; the owner will provide the rate.");
    const request = mocked.generate.mock.calls[1]![0];
    expect(request).toMatchObject({
      model: "gemini-3.7-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json",
        maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: "LOW" },
        httpOptions: { retryOptions: { attempts: 1 } }
      }
    });
    expect(request.config.responseJsonSchema).toMatchObject({ type: "object" });
    for (const unsupported of ["temperature", "topP", "topK", "candidateCount", "frequencyPenalty", "presencePenalty"]) {
      expect(Object.hasOwn(request.config, unsupported)).toBe(false);
    }
    expect(request.contents.map((turn: { role: string }) => turn.role)).toEqual(["user", "model", "user"]);
    expect(second.conversation.map(turn => turn.role)).toEqual(["user", "model", "user", "model"]);
    expect(original.conversation).toEqual([]);
    const { provider: _provider, ...invalid } = fixtureAnalysis(original);
    invalid.evidence[0] = { source: "scope", quote: "Fabricated quote outside the original evidence" };
    mocked.generate.mockResolvedValueOnce({ text: JSON.stringify(invalid) });
    await expect(provider.analyze(original)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it.each(["developer", "vertex"] as const)("preserves the working 3.6 request settings through %s", async transport => {
    await createProvider(config("gemini-3.6-flash", transport)).analyze(project());
    const request = mocked.generate.mock.calls[0]![0];
    expect(request.config.temperature).toBe(0.1);
    expect(request.config.maxOutputTokens).toBe(4000);
    expect(Object.hasOwn(request.config, "thinkingConfig")).toBe(false);
    expect(Object.hasOwn(request.config, "httpOptions")).toBe(false);
  });
});
