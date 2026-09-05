import { expect, it } from "vitest";
import { firebaseConfigScript } from "../src/lib/public-runtime-config";

it("serializes only public SDK fields and escapes executable HTML", () => {
  const script = firebaseConfigScript(JSON.stringify({ projectId: "test-project", apiKey: "browser-key", authDomain: "test.example", appId: "</script><script>alert(1)</script>", GEMINI_API_KEY: "server-secret", extra: "private" }));
  expect(script).not.toMatch(/<|>|server-secret|private|GEMINI_API_KEY/);
  expect(script).toContain("\\u003c/script\\u003e");
});
it("rejects incomplete runtime configuration without disclosing its contents", () => {
  expect(() => firebaseConfigScript('{"apiKey":"secret"}')).toThrow("Public sign-in configuration is invalid");
});
