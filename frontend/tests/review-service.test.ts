import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { ServiceError } from "../src/lib/service-request";

vi.mock("../src/lib/firebase", () => ({ clientAuth: () => ({ currentUser: { getIdToken: async () => "synthetic-test-token" } }) }));
afterEach(() => vi.unstubAllGlobals());

const projectId = "d947f039-ef17-476d-af87-25dba2073685";
const requestId = "d947f039-ef17-476d-af87-25dba2073686";

describe("review transport boundary", () => {
  it("transmits resumeOnly without clarification and never dispatches an automatic follow-up", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "REVIEW_IN_PROGRESS", message: "The review is running.",
      reviewRequest: { requestId, status: "running", retryAllowed: false, retryAfterMs: 1000 } } }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.analyze(projectId, { requestId, resumeOnly: true })).rejects.toMatchObject({
      code: "REVIEW_IN_PROGRESS", reviewRequest: { requestId, status: "running", retryAllowed: false, retryAfterMs: 1000 }
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ requestId, resumeOnly: true });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/projects/${projectId}/analyze`);
  });

  it("keeps a first-dispatch timeout uncertain without generating a replacement request", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("private transport detail", "TimeoutError"));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.analyze(projectId, { requestId, clarification: "Quote six lights." })).rejects.toThrow("Check your saved work");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ requestId, clarification: "Quote six lights." });
  });

  it("exposes safe 404 resolution and a completed repeat's current draft without changing it", async () => {
    const current = { id: projectId, proposals: [{ id: "saved-draft", quantity: 4, totalPaise: 800200 }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: "REVIEW_REQUEST_NOT_FOUND", message: "No request was found." } }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ project: current }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.analyze(projectId, { requestId, resumeOnly: true })).rejects.toMatchObject({ code: "REVIEW_REQUEST_NOT_FOUND" });
    await expect(api.analyze(projectId, { requestId, resumeOnly: true })).resolves.toEqual({ project: current });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retains a different authoritative review carried by an unknown-request response", async () => {
    const current = { requestId: "d947f039-ef17-476d-af87-25dba2073687", status: "running", retryAllowed: false };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: {
      code: "REVIEW_REQUEST_NOT_FOUND", message: "No saved review matches this request.", reviewRequest: current
    } }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(api.analyze(projectId, { requestId, resumeOnly: true })).rejects.toMatchObject({
      code: "REVIEW_REQUEST_NOT_FOUND", reviewRequest: current
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops arbitrary server/private fields, invalid retry metadata and unrecognized codes", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: {
      code: "PRIVATE_PROVIDER_DETAIL", message: "x".repeat(600), rawModelResult: "private", token: "private",
      reviewRequest: { requestId, status: "failed", retryAllowed: true, retryAfterMs: -1,
        token: "private", modelResponse: "private", clarification: "private" }
    } }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const error = await api.analyze(projectId, { requestId, resumeOnly: true }).then(
      () => { throw new Error("Expected a failed review response."); }, error => error as ServiceError
    );
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.code).toBeUndefined();
    expect(error.message).toContain("Your inputs are still here");
    expect(error.reviewRequest).toEqual({ requestId, status: "failed", retryAllowed: true });
    expect(JSON.stringify(error)).not.toContain("private");
    expect((error as unknown as Record<string, unknown>).rawModelResult).toBeUndefined();
  });
});
