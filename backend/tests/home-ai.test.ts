import { randomUUID } from "node:crypto";
import type { GoogleGenAI } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { designResponseSchema } from "@vibeestimate/scene-schema";
import { createHomeTemplate } from "@vibeestimate/scene-core";
import { geminiResponseSchema, GeminiHomeProvider, createHomeProvider } from "../src/home-ai.js";
import { readConfig } from "../src/config.js";
import type { HomeModelContext } from "../src/home-types.js";
import { NamedProfileAuthError } from "../src/vertex-auth.js";

function context(): HomeModelContext {
  const scene = createHomeTemplate("family-home"); const id = randomUUID(); const now = new Date().toISOString();
  const brief = { title: "Home", summary: "A proposed design", source: "template" as const, assumptions: [] };
  const revision = { id, parentRevisionId: null, title: "Home", description: "Template", createdAt: now, source: "template" as const, conflict: false, scene, brief, requestId: randomUUID() };
  return { home: { id: randomUUID(), title: "Home", createdAt: now, updatedAt: now, templateId: "family-home", headRevisionId: id, scene, brief, revisions: [revision], activeJob: null, summary: null, proposalProjectId: null }, revision, selection: { kind: "surface", entityId: scene.walls.find(wall => wall.frontRoomId)!.id, surface: "front" }, prompt: "Make this selected wall warm." };
}
const config = () => readConfig({ AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-3.7-flash", GEMINI_API_KEY: "unit-test-only" });
afterEach(() => vi.restoreAllMocks());

describe("Gemini home provider boundary", () => {
  it("converts only the admitted schema subset while retaining fixed-length coordinate arrays", () => {
    const schema = geminiResponseSchema(designResponseSchema); const text = JSON.stringify(schema);
    expect(text).not.toContain('"$schema"'); expect(text).not.toContain('"prefixItems"'); expect(text).not.toContain('"additionalProperties"'); expect(text).not.toContain('"const"');
    expect(text).toContain('"minItems":3'); expect(text).toContain('"maxItems":3'); expect(text).toContain('"placementId"'); expect(text).not.toContain('"modelPath"');
  });
  it("uses the configured model, structured JSON, one SDK attempt and a 20-second deadline", async () => {
    const input = context(); const expected = { title: "Warm wall", summary: "Updated the selected wall", operations: [{ op: "setMaterial", entityId: input.selection!.kind === "surface" ? input.selection!.entityId : "wall", surface: "front", materialId: input.revision.scene.materials[0]!.id }] };
    const generateContent = vi.fn().mockResolvedValue({ text: JSON.stringify(expected) }); const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const provider = new GeminiHomeProvider(config(), async () => client); expect(await provider.generate(input, "gemini-3.7-flash")).toEqual(expected);
    expect(generateContent).toHaveBeenCalledTimes(1); expect(generateContent.mock.calls[0]![0]).toMatchObject({ model: "gemini-3.7-flash", config: { responseMimeType: "application/json", httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } } } });
    expect(JSON.stringify(generateContent.mock.calls[0]![0])).not.toContain("unit-test-only");
  });
  it("classifies definite recoverable rejections separately from uncertain transport outcomes", async () => {
    const generateContent = vi.fn().mockRejectedValueOnce(Object.assign(new Error("private upstream"), { status: 429 })).mockRejectedValueOnce(new Error("private socket"));
    const provider = new GeminiHomeProvider(config(), async () => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ outcome: "definite", recoverable: true });
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ outcome: "unknown", recoverable: false });
  });
  it.each([
    [400, "response_json_schema has an unsupported enum", "schema"],
    [400, "The responseJsonSchema is too complex", "schema"],
    [400, "Model is not supported", "model"],
    [404, "Publisher model not found", "model"],
    [429, "Quota limit exceeded", "budget"],
    [429, "Resource capacity exhausted", "capacity"],
    [429, "Too many requests", "rate_limit"],
    [503, "Model is overloaded", "capacity"],
    [403, "Permission denied", "authentication"],
    [400, "Invalid argument", "invalid_request"],
    [500, "Internal error", "upstream"],
  ])("records only safe diagnostic fields for upstream status %s (%s)", async (status, reason, category) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = `${reason}; private customer prompt, target project and token must never be logged`;
    const generateContent = vi.fn().mockRejectedValue(Object.assign(new Error(raw), { status, headers: { authorization: "Bearer private-token" }, body: "private upstream payload" }));
    const provider = new GeminiHomeProvider(config(), async () => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ outcome: "definite", recoverable: status === 429 || status === 503, diagnostic: { upstreamStatus: status, category } });
    expect(generateContent).toHaveBeenCalledTimes(1); expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ event: "home_model_failed", model: "gemini-3.7-flash", code: "DESIGN_AI_UNAVAILABLE", outcome: "definite", recoverable: status === 429 || status === 503, upstreamStatus: status, category });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|customer|target|Bearer/);
  });
  it.each([408, 499, 504])("preserves an ambiguous upstream timeout status %s without retry", async status => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const generateContent = vi.fn().mockRejectedValue(Object.assign(new Error("private timeout body"), { status }));
    const provider = new GeminiHomeProvider(config(), async () => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ code: "GENERATION_OUTCOME_UNKNOWN", outcome: "unknown", recoverable: false, diagnostic: { upstreamStatus: status, category: "timeout" } });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ upstreamStatus: status, category: "timeout", outcome: "unknown", recoverable: false });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  it("does not infer a definite HTTP rejection from invalid status metadata", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const generateContent = vi.fn().mockRejectedValue(Object.assign(new Error("private transport failure"), { status: 999 }));
    const provider = new GeminiHomeProvider(config(), async () => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ outcome: "unknown", recoverable: false, diagnostic: { category: "transport" } });
    expect(JSON.parse(log.mock.calls[0]![0] as string)).not.toHaveProperty("upstreamStatus");
  });
  it("logs the safe local authentication stage without dispatching a model", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValue(new NamedProfileAuthError({ authStage: "token_acquire", authFailureCategory: "timeout", authElapsedMs: 30001 }));
    const provider = new GeminiHomeProvider(config(), factory);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ code: "DESIGN_AI_UNAVAILABLE", recoverable: false });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ event: "home_model_failed", model: "gemini-3.7-flash", code: "DESIGN_AI_UNAVAILABLE", outcome: "definite", recoverable: false, upstreamStatus: 502, category: "authentication", authStage: "token_acquire", authFailureCategory: "timeout", authElapsedMs: 30001 });
  });
  it("rejects malformed and architecture-capable model output without a model retry or fixture", async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: JSON.stringify({ title: "Unsafe", summary: "Change the wall", operations: [{ op: "planMoveOpening", entityId: "door", offset: 100 }] }) });
    const provider = new GeminiHomeProvider(config(), async () => ({ models: { generateContent } }) as unknown as GoogleGenAI);
    await expect(provider.generate(context(), "gemini-3.7-flash")).rejects.toMatchObject({ code: "DESIGN_INVALID_RESPONSE", recoverable: false }); expect(generateContent).toHaveBeenCalledTimes(1);
  });
  it("requires an explicit distinct fallback model and refuses a production fixture", () => {
    expect(() => readConfig({ APP_ENV: "local", AI_PROVIDER: "fixture", GEMINI_FALLBACK_MODEL: "another-model" })).toThrow("GEMINI_FALLBACK_MODEL");
    expect(() => readConfig({ AI_PROVIDER: "gemini", GEMINI_MODEL: "same", GEMINI_FALLBACK_MODEL: "same", GEMINI_API_KEY: "unit" })).toThrow("distinct");
    expect(readConfig({ AI_PROVIDER: "gemini", GEMINI_MODEL: "first", GEMINI_FALLBACK_MODEL: "second", GEMINI_API_KEY: "unit" }).geminiFallbackModel).toBe("second");
    expect(() => createHomeProvider({ ...readConfig({}), appEnv: "production" })).toThrow("local emulators");
  });
});
