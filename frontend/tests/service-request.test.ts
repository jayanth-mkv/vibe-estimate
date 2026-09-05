import { afterEach, describe, expect, it, vi } from "vitest";
import { serviceRequest } from "../src/lib/service-request";
import { forwardService } from "../src/lib/server-service";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const user = { getIdToken: async () => "test-token" };

describe("service recovery", () => {
  it("uses the current origin and keeps the token out of the URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ saved: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(serviceRequest("/api/projects", user)).resolves.toEqual({ saved: true });
    expect(fetcher).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }));
  });
  it("does not mislabel a token refresh failure as a service outage", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(serviceRequest("/api/projects", { getIdToken: async () => { throw new Error("private auth details"); } })).rejects.toThrow("Your session could not reconnect");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not repeat a timed-out mutation with an unknown save outcome", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("upstream details", "TimeoutError"));
    vi.stubGlobal("fetch", fetcher);
    await expect(serviceRequest("/api/projects", user, { method: "POST" })).rejects.toThrow("Check your saved work before retrying");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("forwards auth to a fixed upstream without forwarding browser cookies or origin", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private draft", { headers: { "Content-Disposition": "attachment; filename=draft.txt" } }));
    vi.stubGlobal("fetch", fetcher); vi.stubEnv("BACKEND_ORIGIN", "http://127.0.0.1:8081");
    const response = await forwardService(new Request("http://localhost:3000/api/projects/id/export", { headers: { Authorization: "Bearer test", Cookie: "private", Origin: "https://untrusted.example" } }), "/api/projects/id/export");
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:8081/api/projects/id/export");
    const headers = fetcher.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test");
    expect(headers.has("cookie")).toBe(false); expect(headers.has("origin")).toBe(false);
    expect(response.headers.get("content-disposition")).toContain("draft.txt");
    expect(await response.text()).toBe("private draft");
  });
  it("bounds input before forwarding and sanitizes upstream network failures", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private infrastructure details")); vi.stubGlobal("fetch", fetcher);
    const tooLarge = await forwardService(new Request("https://example.test/api/projects", { method: "POST", body: "x".repeat(49153) }), "/api/projects");
    expect(tooLarge.status).toBe(413); expect(fetcher).not.toHaveBeenCalled();
    const failed = await forwardService(new Request("https://example.test/health"), "/health");
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("infrastructure");
  });
});
