import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { MemoryProjectStore } from "./helpers.js";

describe("runtime Git revision evidence", () => {
  it.each([undefined, ""])("omits unconfigured local revision metadata (%s)", async buildGitSha => {
    const config = readConfig({ BUILD_GIT_SHA: buildGitSha });
    expect(config.gitRevision).toBeUndefined();
    const analyze = vi.fn(); const verifyToken = vi.fn();
    const app = createApp({ config, store: new MemoryProjectStore(), provider: { kind: "fixture", analyze }, verifyToken });
    const response = await request(app).get("/health").expect(200);
    expect(response.body).not.toHaveProperty("gitRevision");
    expect(response.body).toMatchObject({ runtime: "local", auth: "emulator", aiProvider: "fixture" });
    expect(analyze).not.toHaveBeenCalled(); expect(verifyToken).not.toHaveBeenCalled();
  });
  it.each(["abc1234", "a".repeat(39), "a".repeat(41), "A".repeat(40), "g".repeat(40), " ", `${"a".repeat(40)}\n`, ` ${"a".repeat(40)}`])("rejects malformed configured revision metadata", buildGitSha => {
    expect(() => readConfig({ BUILD_GIT_SHA: buildGitSha })).toThrow("BUILD_GIT_SHA");
  });
  it("reports the exact configured production commit without invoking authentication, storage or AI", async () => {
    const gitRevision = "0123456789abcdef0123456789abcdef01234567";
    const config = readConfig({
      APP_ENV: "production", NODE_ENV: "production", AI_PROVIDER: "gemini", FRONTEND_ORIGIN: "https://example.test",
      FIREBASE_PROJECT_ID: "synthetic-firebase-project", GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-3.7-flash",
      VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "synthetic-runtime-project", VERTEX_LOCATION: "global",
      ROOM_TASK_QUEUE: "projects/synthetic-runtime-project/locations/asia-south1/queues/reviews",
      ROOM_TASK_SERVICE_ACCOUNT: "tasks@synthetic-runtime-project.iam.gserviceaccount.com", BUILD_GIT_SHA: gitRevision,
    });
    expect(config.gitRevision).toBe(gitRevision);
    const analyze = vi.fn(); const verifyToken = vi.fn(); const store = new MemoryProjectStore(); const list = vi.spyOn(store, "list");
    const app = createApp({ config, store, provider: { kind: "gemini", analyze }, verifyToken });
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toMatchObject({ gitRevision, runtime: "production", auth: "firebase", aiProvider: "gemini", geminiTransport: "vertex" });
    expect(analyze).not.toHaveBeenCalled(); expect(verifyToken).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
  });
});
