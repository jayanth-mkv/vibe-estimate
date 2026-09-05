import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { analysisSchema } from "../backend/src/domain.js";
import { SYSTEM_INSTRUCTION } from "../backend/src/ai.js";
// The local tooling helper is an ESM JavaScript module.
import { geminiBackendEnv } from "./gemini-config.mjs";

const env = geminiBackendEnv({}, process.argv[2]);
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, vertexai: false, httpOptions: { timeout: 30000 } });
try {
  const response = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: JSON.stringify({ scope: "Kitchen LED strip is included. Display lights are excluded.", messages: "Please propose four display lights. I will confirm the price separately." }) }] }],
    config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(analysisSchema), temperature: 0.1, maxOutputTokens: 4000 }
  });
  let validJson = false;
  let validSchema = false;
  try { const parsed = JSON.parse(response.text ?? ""); validJson = true; validSchema = analysisSchema.safeParse(parsed).success; } catch {}
  console.log(JSON.stringify({ status: "response", model: env.GEMINI_MODEL, textPresent: Boolean(response.text), validJson, validSchema, finishReason: response.candidates?.[0]?.finishReason, usage: response.usageMetadata }));
} catch (error: unknown) {
  const upstream = error as { status?: number; message?: string };
  const message = upstream.message ?? "";
  let structured;
  try { structured = JSON.parse(message.slice(message.indexOf("{"))); } catch {}
  const details = structured?.error?.details ?? structured?.details ?? [];
  const quota = details.flatMap((detail: { violations?: { quotaMetric?: string; quotaId?: string; quotaValue?: string; quotaDimensions?: { model?: string } }[] }) => (detail.violations ?? []).map(item => ({ metric: item.quotaMetric, id: item.quotaId, value: item.quotaValue, model: item.quotaDimensions?.model })));
  const retryDelay = details.find((detail: { retryDelay?: string }) => detail.retryDelay)?.retryDelay;
  const categories = [
    ["quota", /quota|RESOURCE_EXHAUSTED|rate limit/i],
    ["prepaid_balance", /prepay(?:ment)?.*(?:depleted|credit)|credits.*depleted/i],
    ["permission", /permission|PERMISSION_DENIED|not authorized/i],
    ["key", /api key|API_KEY/i],
    ["schema", /schema|generation_config|generationConfig|Unknown name|Invalid JSON payload/i],
    ["model", /model|NOT_FOUND/i],
    ["timeout", /timeout|timed out|abort/i],
  ] as const;
  console.error(JSON.stringify({ status: "failed", upstreamStatus: typeof upstream.status === "number" ? upstream.status : null, categories: categories.filter(([, pattern]) => pattern.test(message)).map(([name]) => name), quota, retryDelay }));
  // Do not log upstream messages, request headers, or credential values.
  process.exitCode = 1;
}
