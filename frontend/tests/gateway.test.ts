import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/[...path]/route";
import { POST as internalPost } from "../src/app/internal/[action]/route";
import { forwardService } from "../src/lib/server-service";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("same-origin API gateway", () => {
  it("forwards the exact saved revision query through the real export route", async () => {
    const revisionId = "dd080bf4-3b35-4c77-a12d-d73507c6a1ac";
    const fetcher = vi.fn().mockResolvedValue(new Response("# Saved design", { headers: { "Content-Type": "text/markdown", "Content-Disposition": "attachment; filename=design.md" } }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("BACKEND_ORIGIN", "http://127.0.0.1:8181");
    const response = await GET(new Request(`http://127.0.0.1:3100/api/homes/home-id/export?revisionId=${revisionId}`, { headers: { Authorization: "Bearer test-owner" } }), { params: Promise.resolve({ path: ["homes", "home-id", "export"] }) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`http://127.0.0.1:8181/api/homes/home-id/export?revisionId=${revisionId}`);
    expect(fetcher.mock.calls[0][1].headers.get("authorization")).toBe("Bearer test-owner");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("design.md");
    expect(await response.text()).toBe("# Saved design");
  });

  it("keeps URL-shaped query values and encoded path components on the configured host", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("BACKEND_ORIGIN", "https://configured-backend.example");
    const requestUrl = new URL("https://browser.example/api/homes/ignored/export");
    requestUrl.searchParams.set("revisionId", "https://untrusted.example/private?token=not-a-token");
    requestUrl.searchParams.append("revisionId", "//another.example/path");
    await GET(new Request(requestUrl), { params: Promise.resolve({ path: ["homes", "https:untrusted.example", "export"] }) });
    const destination = new URL(fetcher.mock.calls[0][0]);
    expect(destination.origin).toBe("https://configured-backend.example");
    expect(destination.pathname).toBe("/api/homes/https%3Auntrusted.example/export");
    expect(destination.searchParams.getAll("revisionId")).toEqual(["https://untrusted.example/private?token=not-a-token", "//another.example/path"]);
  });

  it.each(["https://untrusted.example/export", "//untrusted.example/export", "/\\untrusted.example/export", "/api/homes?host=untrusted"])("rejects a destination-shaped forwarding path: %s", async path => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await forwardService(new Request("https://browser.example/api/homes"), path);
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["..", ".", "//untrusted.example", "\\untrusted.example"])("rejects unsafe decoded catch-all path component: %s", async part => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await GET(new Request("https://browser.example/api/homes"), { params: Promise.resolve({ path: [part, "export"] }) });
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("internal delivery gateway", () => {
  it.each(["observer", "reconcile", "outbox"])("forwards authenticated JSON for %s without changing the payload", async action => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("BACKEND_ORIGIN", "http://127.0.0.1:8181");
    const body = '{ "outboxId": "dd080bf4-3b35-4c77-a12d-d73507c6a1ac" }';
    const response = await internalPost(new Request(`https://service.example/internal/${action}`, {
      method: "POST", headers: { Authorization: "Bearer test-delivery", "Content-Type": "application/json" }, body,
    }), { params: Promise.resolve({ action }) });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [destination, forwarded] = fetcher.mock.calls[0];
    expect(destination).toBe(`http://127.0.0.1:8181/internal/${action}`);
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("authorization")).toBe("Bearer test-delivery");
    expect(forwarded.headers.get("content-type")).toBe("application/json");
    expect(new TextDecoder().decode(forwarded.body)).toBe(body);
    expect(response.status).toBe(204);
  });

  it.each(["unknown", "../outbox", "https://untrusted.example/outbox"])("rejects an unknown delivery action before forwarding: %s", async action => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await internalPost(new Request("https://service.example/internal/unknown", { method: "POST" }), { params: Promise.resolve({ action }) });
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves the backend authentication denial for an outbox delivery without a token", async () => {
    const denial = { error: { code: "TASK_AUTH_REQUIRED", message: "A verified task identity is required." } };
    const fetcher = vi.fn().mockResolvedValue(Response.json(denial, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await internalPost(new Request("https://service.example/internal/outbox", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }), { params: Promise.resolve({ action: "outbox" }) });
    expect(fetcher.mock.calls[0][1].headers.has("authorization")).toBe(false);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(denial);
  });
});
