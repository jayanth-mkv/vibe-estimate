import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { createProvider, SYSTEM_INSTRUCTION } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { fixtureAnalysis, FIXTURE_NAME, FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../src/fixtures.js";
import { newProject } from "../src/store.js";
import { createLocalVertexClient } from "../src/vertex-client.js";
import { AppError } from "../src/errors.js";

const mocked = vi.hoisted(() => ({ setup: vi.fn(), generate: vi.fn(), token: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  models = { generateContent: mocked.generate };
  constructor(options: unknown) { mocked.setup(options); }
} }));
vi.mock("../src/vertex-auth.js", () => ({ obtainLocalVertexToken: mocked.token }));

const config = () => readConfig({
  APP_ENV: "local", AI_PROVIDER: "gemini", GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-test-model",
  VERTEX_PROJECT_ID: "synthetic-vertex-project", VERTEX_LOCATION: "global", VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner",
  VERTEX_GCLOUD_ACCOUNT: "owner@example.test", VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud-config")
});
const project = () => newProject("synthetic-owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.token.mockResolvedValue("synthetic-token");
  const { provider: _provider, ...analysis } = fixtureAnalysis(project());
  mocked.generate.mockResolvedValue({ text: JSON.stringify(analysis) });
});

describe("Vertex OAuth client and shared source review", () => {
  it("uses an explicit OAuth2Client and billing project without asking for ADC", async () => {
    await createLocalVertexClient(config());
    const options = mocked.setup.mock.calls[0]![0];
    expect(options).toMatchObject({ enterprise: true, vertexai: true, project: "synthetic-vertex-project", location: "global", httpOptions: { apiVersion: "v1", timeout: 30000 } });
    expect(options.apiKey).toBeUndefined();
    expect(options.googleAuthOptions.authClient).toBeInstanceOf(OAuth2Client);
    const headers = await options.googleAuthOptions.authClient.getRequestHeaders("https://aiplatform.googleapis.com/");
    expect(headers.get("authorization")).toBe("Bearer synthetic-token");
    expect(headers.get("x-goog-user-project")).toBe("synthetic-vertex-project");
    expect(options.googleAuthOptions.authClient.credentials.refresh_token).toBeUndefined();
  });
  it("obtains one fresh token per review and preserves structured multi-turn history and exact source validation", async () => {
    const provider = createProvider(config());
    const original = project();
    const first = await provider.analyze(original);
    const second = await provider.analyze({ ...original, ...first }, "Quote six display lights");
    expect(first.analysis.provider).toBe("gemini");
    expect(second.conversation.map(turn => turn.role)).toEqual(["user", "model", "user", "model"]);
    expect(mocked.token).toHaveBeenCalledTimes(2);
    expect(mocked.setup).toHaveBeenCalledTimes(2);
    expect(mocked.generate.mock.calls[1]![0]).toMatchObject({ model: "gemini-test-model", config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json" } });
    expect(mocked.generate.mock.calls[1]![0].contents).toHaveLength(3);
    expect(original.conversation).toEqual([]);
    const { provider: _provider, ...invalid } = fixtureAnalysis(original);
    invalid.evidence[0] = { source: "scope", quote: "Fabricated included lighting evidence" };
    mocked.generate.mockResolvedValueOnce({ text: JSON.stringify(invalid) });
    await expect(provider.analyze(original)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("rejects review limits before authenticating and never falls back on auth or model failures", async () => {
    const provider = createProvider(config());
    const limited = project();
    limited.conversation = Array.from({ length: 20 }, () => ({ role: "user" as const, text: "synthetic turn" }));
    await expect(provider.analyze(limited, "new turn")).rejects.toMatchObject({ code: "CONVERSATION_LIMIT" });
    expect(mocked.token).not.toHaveBeenCalled();
    mocked.token.mockRejectedValueOnce(new AppError(502, "AI_AUTH_UNAVAILABLE", "Safe local auth error"));
    await expect(provider.analyze(project())).rejects.toMatchObject({ code: "AI_AUTH_UNAVAILABLE" });
    expect(mocked.generate).not.toHaveBeenCalled();
    mocked.generate.mockRejectedValueOnce(new Error("raw upstream synthetic-token"));
    const error = await provider.analyze(project()).catch(error => error);
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(error.stack).not.toContain("synthetic-token");
    expect(mocked.generate).toHaveBeenCalledTimes(1);
  });
  it("keeps Developer mode explicit and rejects constructing a Vertex provider in production", () => {
    createProvider(readConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "synthetic-key", GEMINI_MODEL: "test-model" }));
    expect(mocked.setup.mock.calls[0]![0]).toMatchObject({ enterprise: false, vertexai: false, apiKey: "synthetic-key" });
    expect(() => createProvider({ ...config(), appEnv: "production" })).toThrow("explicit local");
    expect(mocked.token).not.toHaveBeenCalled();
  });
});
