import { expect, it } from "vitest";
import { firebaseConfigScript } from "../src/lib/public-runtime-config";

const config = { projectId: "demo-workspace", apiKey: "demo-browser-key", authDomain: "demo-workspace.firebaseapp.com", appId: "demo-app" };

it("serializes only public SDK fields and escapes executable HTML", () => {
  const script = firebaseConfigScript(JSON.stringify({ ...config, appId: "</script><script>alert(1)</script>", GEMINI_API_KEY: "server-secret", credentials: { privateKey: "private-value" } }));
  expect(script).not.toMatch(/<|>|server-secret|private|GEMINI_API_KEY/);
  expect(script).toContain("\\u003c/script\\u003e");
  expect(script.match(/window\./g)).toHaveLength(1);
});

it.each([undefined, "", "{", "null", "[]", '{"apiKey":"secret"}'])("handles missing or malformed runtime config without disclosing contents", raw => {
  if (!raw) expect(firebaseConfigScript(raw)).toBe("");
  else expect(() => firebaseConfigScript(raw)).toThrow("Public sign-in configuration is invalid");
});

it.each(["a", "stable-session", "release-2", "a".repeat(32)])("serializes the opaque session namespace %s and Google policy", appNamespace => {
  const script = firebaseConfigScript(JSON.stringify({ ...config, appNamespace, authMode: "google", clientSecret: "private-secret" }));
  expect(script).toBe(`window.__VIBEESTIMATE_FIREBASE__=${JSON.stringify({ ...config, appNamespace, authMode: "google" })};`);
  expect(script).not.toContain("private-secret");
});

it.each(["", "../other", "UPPERCASE", "two spaces", "a".repeat(33), null, false, [], {}])("rejects malformed namespace %j", appNamespace => {
  expect(() => firebaseConfigScript(JSON.stringify({ ...config, appNamespace }))).toThrow("Public sign-in configuration is invalid");
});

it.each(["guest", "GOOGLE", "", null, false, [], {}])("rejects unsupported auth policy %j", authMode => {
  expect(() => firebaseConfigScript(JSON.stringify({ ...config, authMode }))).toThrow("Public sign-in configuration is invalid");
});
