import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { CONNECTED_AUTH_FAILURE_COOLDOWN_MS, CONNECTED_REFRESH_SKEW_MS, ConnectedTokenSource, createConnectedCredentials, createTokenInspector } from "../src/connected-auth.js";
import { readConfig } from "../src/config.js";
import { obtainNamedProfileToken } from "../src/vertex-auth.js";

const config = () => readConfig({
  APP_ENV: "connected", AI_PROVIDER: "gemini", FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  FIREBASE_PROJECT_ID: "synthetic-firebase-project", FIRESTORE_DATABASE_ID: "(default)",
  CONNECTED_AUTH_PROJECT_ID: "synthetic-backend-project", CONNECTED_AUTH_GCLOUD_CONFIGURATION: "synthetic-owner",
  CONNECTED_AUTH_GCLOUD_ACCOUNT: "owner@example.test", CONNECTED_AUTH_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud"),
  GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-3.7-flash", VERTEX_PROJECT_ID: "synthetic-backend-project", VERTEX_LOCATION: "global",
  VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner", VERTEX_GCLOUD_ACCOUNT: "owner@example.test", VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud")
});
const token = "synthetic-access-token";
const metadata = (expiry = Date.now() + 3600000) => ({ expiry_date: expiry, scopes: ["https://www.googleapis.com/auth/cloud-platform"], email: "owner@example.test" });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("connected short-lived named-profile authentication", () => {
  it("shares one lazy token request between Admin and Firestore without ADC or refresh-token persistence", async () => {
    let release!: (value: string) => void;
    const obtain = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const inspect = vi.fn(async () => metadata());
    const { credential, authClient } = createConnectedCredentials(config(), { obtain, inspect, env: {} });
    expect(obtain).not.toHaveBeenCalled();
    expect(authClient).toBeInstanceOf(OAuth2Client);
    const pendingAdmin = credential.getAccessToken();
    const pendingFirestore = authClient.getRequestHeaders("https://firestore.googleapis.com/");
    expect(obtain).toHaveBeenCalledTimes(1);
    release(token);
    const [admin, headers] = await Promise.all([pendingAdmin, pendingFirestore]);
    expect(admin.access_token).toBe(token);
    expect(admin.expires_in).toBeGreaterThan(3500);
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("x-goog-user-project")).toBe("synthetic-firebase-project");
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(obtain.mock.calls[0]![0]).toMatchObject({ projectId: "synthetic-backend-project", gcloudConfiguration: "synthetic-owner" });
    expect(authClient.credentials.refresh_token).toBeUndefined();
    expect(JSON.stringify(authClient)).not.toContain(token);
    expect(JSON.stringify(authClient)).not.toContain("owner@example.test");
    await credential.getAccessToken(); await authClient.getRequestHeaders();
    expect(obtain).toHaveBeenCalledTimes(1);
  });

  it("uses actual expiry and refreshes once before expiration rather than assuming a fresh one-hour token", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const obtain = vi.fn().mockResolvedValueOnce(token).mockResolvedValueOnce("synthetic-refreshed-token");
    const inspect = vi.fn().mockResolvedValueOnce(metadata(start + 180000)).mockResolvedValueOnce(metadata(start + 3700000));
    const { credential, authClient } = createConnectedCredentials(config(), { obtain, inspect, env: {} });
    expect((await credential.getAccessToken()).expires_in).toBe(180);
    await authClient.getRequestHeaders();
    vi.setSystemTime(start + 180000 - CONNECTED_REFRESH_SKEW_MS);
    const values = await Promise.all([credential.getAccessToken(), authClient.getRequestHeaders()]);
    expect(values[0].access_token).toBe("synthetic-refreshed-token");
    expect(values[1].get("authorization")).toBe("Bearer synthetic-refreshed-token");
    expect(obtain).toHaveBeenCalledTimes(2);
  });

  it("drops an expiring token on refresh failure and bounds repeated authentication attempts", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const obtain = vi.fn().mockResolvedValueOnce(token).mockRejectedValue(new Error(`private error ${token}`));
    const source = new ConnectedTokenSource(config(), { obtain, inspect: async () => metadata(start + 120000), env: {} });
    await source.getToken();
    vi.setSystemTime(start + 60000);
    const error = await source.getToken().catch(error => error);
    expect(error).toMatchObject({ code: "CONNECTED_AUTH_UNAVAILABLE" });
    expect(error.stack).not.toContain(token);
    await expect(source.getToken()).rejects.toMatchObject({ code: "CONNECTED_AUTH_UNAVAILABLE" });
    expect(obtain).toHaveBeenCalledTimes(2);
    vi.setSystemTime(start + 60000 + CONNECTED_AUTH_FAILURE_COOLDOWN_MS);
    await expect(source.getToken()).rejects.toMatchObject({ code: "CONNECTED_AUTH_UNAVAILABLE" });
    expect(obtain).toHaveBeenCalledTimes(3);
  });

  it.each([
    () => metadata(Date.now() + 30000), () => metadata(Date.now() + 7200000),
    () => ({ ...metadata(), expiry_date: NaN }), () => ({ ...metadata(), scopes: ["unrelated-scope"] }),
    () => ({ ...metadata(), email: "other@example.test" })
  ])("fails closed for invalid, expired, long-lived or mismatched token metadata", async makeMetadata => {
    const source = new ConnectedTokenSource(config(), { obtain: async () => token, inspect: async () => makeMetadata(), env: {} });
    await expect(source.getToken()).rejects.toMatchObject({ code: "CONNECTED_AUTH_UNAVAILABLE" });
  });

  it("rejects shared ADC and inherited auth overrides before executing the named-profile command", async () => {
    const execute = vi.fn();
    const source = new ConnectedTokenSource(config(), { env: { GOOGLE_APPLICATION_CREDENTIALS: "synthetic-unrelated-adc.json" }, obtain: (target, env) => obtainNamedProfileToken(target, execute, env), inspect: async () => metadata() });
    await expect(source.getToken()).rejects.toMatchObject({ code: "CONNECTED_AUTH_UNAVAILABLE" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps token inspection in a bounded Authorization-header request and strips raw failures", async () => {
    const original = OAuth2Client.prototype.getTokenInfo;
    let observed: Record<string, unknown> | undefined;
    vi.spyOn(OAuth2Client.prototype, "getTokenInfo").mockImplementation(function (accessToken) {
      this.transporter.defaults.adapter = async options => {
        observed = options as unknown as Record<string, unknown>;
        return { data: { expires_in: 3600, scope: "https://www.googleapis.com/auth/cloud-platform" }, status: 200, statusText: "OK", headers: new Headers(), config: options };
      };
      return original.call(this, accessToken);
    });
    const result = await createTokenInspector()(token);
    expect(result.scopes).toContain("https://www.googleapis.com/auth/cloud-platform");
    expect(observed).toMatchObject({ timeout: 10000, retry: false, method: "POST" });
    expect(String(observed!.url)).not.toContain(token);
    expect(new Headers(observed!.headers as HeadersInit).get("authorization")).toBe(`Bearer ${token}`);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = new ConnectedTokenSource(config(), { obtain: async () => token, inspect: async () => { throw new Error(`Authorization: Bearer ${token}`); }, env: {} });
    const failure = await source.getToken().catch(error => error);
    expect(failure.stack).not.toContain(token);
    expect(log).not.toHaveBeenCalled();
  });
});
