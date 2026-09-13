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

const target = { projectId: "target-project", apiKey: "target-browser-key", authDomain: "target.example", appId: "target-app", appNamespace: "migrated" };
const legacy = { projectId: "source-project", apiKey: "source-browser-key", authDomain: "source.example", appId: "source-app" };

it("serializes only the source public fields and persistent target namespace during migration", () => {
  const script = firebaseConfigScript(JSON.stringify({ ...target, legacy: { ...legacy, secret: "source-private-value" }, migrationSnapshotSha256: "private-snapshot-fingerprint", credentials: "server-private-value" }));
  expect(script).toContain('"appNamespace":"migrated"');
  expect(script).toContain(`window.__VIBEESTIMATE_LEGACY_FIREBASE__=${JSON.stringify(legacy)};`);
  expect(script).not.toMatch(/private|secret|credentials|migrationSnapshot/);
  const retired = firebaseConfigScript(JSON.stringify(target));
  expect(retired).toContain('"appNamespace":"migrated"');
  expect(retired).not.toContain("LEGACY_FIREBASE");
});

it.each([
  { ...target, appNamespace: "arbitrary" },
  { ...target, appNamespace: undefined, legacy },
  { ...target, legacy: null },
  { ...target, legacy: [] },
  { ...target, legacy: { ...legacy, apiKey: undefined } },
  { ...target, legacy: { ...legacy, projectId: target.projectId } },
  { ...target, legacy: { ...legacy, apiKey: target.apiKey } },
])("rejects ambiguous or malformed migration configuration without exposing it", config => {
  expect(() => firebaseConfigScript(JSON.stringify(config))).toThrow("Public sign-in configuration is invalid");
});
