import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config.js";
import { createRoomTasks } from "../src/room-tasks.js";

const mocks = vi.hoisted(() => ({ request: vi.fn(), verifyIdToken: vi.fn(), authOptions: vi.fn() }));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    constructor(options: unknown) { mocks.authOptions(options); }
    async getClient() { return { request: mocks.request }; }
  },
  OAuth2Client: class { verifyIdToken(options: unknown) { return mocks.verifyIdToken(options); } },
}));

const settings = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "test-firebase-project", FRONTEND_ORIGIN: "https://test.example",
  GEMINI_MODEL: "gemini-test-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "test-backend-project", VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/test-backend-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-backend-project.iam.gserviceaccount.com",
  ROOM_EVENT_SERVICE_ACCOUNT: "vibeestimate-events@test-firebase-project.iam.gserviceaccount.com",
};
const config = () => readConfig(settings);
const ticket = (email: string, emailVerified = true) => ({ getPayload: () => ({ email, email_verified: emailVerified }) });

beforeEach(() => { vi.clearAllMocks(); mocks.request.mockReset().mockResolvedValue({}); mocks.verifyIdToken.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("managed room task transport", () => {
  it("uses the same named task and bounded authenticated delivery body for every retry of an outbox ID", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1750000000000);
    const tasks = createRoomTasks(config());
    const id = randomUUID();
    await tasks.enqueueDelivery(id); await tasks.enqueueDelivery(id);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1]![0]).toEqual(mocks.request.mock.calls[0]![0]);
    const sent = mocks.request.mock.calls[0]![0];
    expect(sent).toMatchObject({
      url: `https://cloudtasks.googleapis.com/v2/${settings.ROOM_TASK_QUEUE}/tasks`, method: "POST", timeout: 10000,
      data: { task: {
        name: `${settings.ROOM_TASK_QUEUE}/tasks/review-${id}`, scheduleTime: new Date(1750000002000).toISOString(), dispatchDeadline: "120s",
        httpRequest: { url: "https://test.example/internal/observer", httpMethod: "POST", headers: { "Content-Type": "application/json" },
          oidcToken: { serviceAccountEmail: settings.ROOM_TASK_SERVICE_ACCOUNT, audience: "https://test.example" } },
      } },
    });
    expect(JSON.parse(Buffer.from(sent.data.task.httpRequest.body, "base64").toString("utf8"))).toEqual({ deliveryId: id });
    expect(mocks.authOptions).toHaveBeenCalledWith(expect.objectContaining({ projectId: "test-backend-project", clientOptions: { quotaProjectId: "test-backend-project" } }));
  });

  it("treats named-task HTTP 409 as already enqueued but propagates failures that need retry", async () => {
    const tasks = createRoomTasks(config());
    const conflict = { response: { status: 409 } };
    mocks.request.mockRejectedValueOnce(conflict);
    await expect(tasks.enqueueDelivery(randomUUID())).resolves.toBeUndefined();
    const unavailable = { response: { status: 503 } };
    mocks.request.mockRejectedValueOnce(unavailable);
    await expect(tasks.enqueueDelivery(randomUUID())).rejects.toBe(unavailable);
    const networkFailure = new Error("synthetic connection reset");
    mocks.request.mockRejectedValueOnce(networkFailure);
    await expect(tasks.enqueueDelivery(randomUUID())).rejects.toBe(networkFailure);
  });

  it("does not swallow legacy unnamed-task conflicts or treat an invalid ID as a task path", async () => {
    const tasks = createRoomTasks(config());
    const conflict = { response: { status: 409 } };
    mocks.request.mockRejectedValueOnce(conflict);
    await expect(tasks.enqueue(randomUUID())).rejects.toBe(conflict);
    expect(mocks.request.mock.calls[0]![0].data.task).not.toHaveProperty("name");
    mocks.request.mockClear();
    await expect(tasks.enqueueDelivery("../another-task")).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("separate task and event OIDC identities", () => {
  it("verifies the service audience and only accepts the verified email for the requested purpose", async () => {
    const tasks = createRoomTasks(config());
    mocks.verifyIdToken.mockImplementation(async ({ idToken }) => ticket(idToken === "event-token" ? settings.ROOM_EVENT_SERVICE_ACCOUNT : settings.ROOM_TASK_SERVICE_ACCOUNT));
    expect(await tasks.verify("event-token", "event")).toBe(true);
    expect(await tasks.verify("event-token", "task")).toBe(false);
    expect(await tasks.verify("task-token", "event")).toBe(false);
    expect(await tasks.verify("task-token")).toBe(true);
    expect(mocks.verifyIdToken.mock.calls.map(([options]) => options)).toEqual([
      { idToken: "event-token", audience: "https://test.example" }, { idToken: "event-token", audience: "https://test.example" },
      { idToken: "task-token", audience: "https://test.example" }, { idToken: "task-token", audience: "https://test.example" },
    ]);
  });

  it("fails closed for missing event configuration, unverified emails, invalid signatures and wrong audiences", async () => {
    const tasks = createRoomTasks(config());
    mocks.verifyIdToken.mockResolvedValueOnce(ticket(settings.ROOM_EVENT_SERVICE_ACCOUNT, false));
    expect(await tasks.verify("unverified-email", "event")).toBe(false);
    for (const failure of ["invalid signature", "wrong audience"]) {
      mocks.verifyIdToken.mockRejectedValueOnce(new Error(failure));
      expect(await tasks.verify("invalid-token", "event")).toBe(false);
    }
    mocks.verifyIdToken.mockClear();
    const legacy = createRoomTasks({ ...config(), eventServiceAccount: undefined });
    expect(await legacy.verify("event-token", "event")).toBe(false);
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });
});
