import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserDouble = { uid: string; isAnonymous: boolean; providerData: { providerId: string }[]; getIdToken: ReturnType<typeof vi.fn> };
type AppDouble = { name: string; options: { projectId: string; apiKey: string } };
type AuthDouble = { app: AppDouble; currentUser: UserDouble | null; authStateReady: ReturnType<typeof vi.fn> };
const sdk = vi.hoisted(() => ({
  apps: new Map<string, AppDouble>(), auths: new Map<string, AuthDouble>(), persisted: new Map<string, UserDouble>(),
  anonymous: vi.fn(), custom: vi.fn(), popup: vi.fn(), link: vi.fn(), persistence: vi.fn(), signOut: vi.fn(), fetch: vi.fn(),
}));
vi.mock("firebase/app", () => ({
  getApps: () => [...sdk.apps.values()],
  initializeApp: (options: AppDouble["options"], name: string) => {
    const app = { name, options };
    sdk.apps.set(name, app);
    sdk.auths.set(name, { app, currentUser: sdk.persisted.get(`${options.projectId}:${name}`) ?? null, authStateReady: vi.fn(async () => {}) });
    return app;
  },
}));
vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { type: "LOCAL" }, connectAuthEmulator: vi.fn(),
  getAuth: (app: AppDouble) => sdk.auths.get(app.name), GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  linkWithPopup: sdk.link, setPersistence: sdk.persistence, signInAnonymously: sdk.anonymous,
  signInWithCustomToken: sdk.custom, signInWithPopup: sdk.popup, signOut: sdk.signOut,
}));

const core = { projectId: "target-project", apiKey: "target-key", authDomain: "target.example", appId: "target-app", appNamespace: "migrated" as const };
const legacy = { projectId: "source-project", apiKey: "source-key", authDomain: "source.example", appId: "source-app" };
const roomId = "b88aa97d-cf7d-4fdd-a046-53547c732e88";
const user = (uid: string, isAnonymous = true, providerData: UserDouble["providerData"] = []): UserDouble => ({ uid, isAnonymous, providerData, getIdToken: vi.fn(async () => `source-token-${uid}`) });
const persistSource = (name = "[DEFAULT]", value = user("original-owner")) => { sdk.persisted.set(`${legacy.projectId}:${name}`, value); return value; };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); sdk.apps.clear(); sdk.auths.clear(); sdk.persisted.clear();
  vi.stubGlobal("window", { location: { hostname: "service.example" }, __VIBEESTIMATE_FIREBASE__: { ...core }, __VIBEESTIMATE_LEGACY_FIREBASE__: { ...legacy } });
  vi.stubGlobal("fetch", sdk.fetch);
  vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "false"); vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "guest"); vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "true");
  sdk.persistence.mockResolvedValue(undefined);
  sdk.fetch.mockImplementation(async (_url: string, options: RequestInit) => {
    const uid = new Headers(options.headers).get("authorization")!.slice("Bearer source-token-".length);
    return Response.json({ uid, customToken: `custom-${uid}` });
  });
  sdk.custom.mockImplementation(async (auth: AuthDouble, token: string) => { auth.currentUser = user(token.slice("custom-".length), false); return { user: auth.currentUser }; });
  sdk.anonymous.mockImplementation(async (auth: AuthDouble) => { auth.currentUser = user("new-guest"); return { user: auth.currentUser }; });
  sdk.signOut.mockImplementation(async (auth: AuthDouble) => { auth.currentUser = null; });
  sdk.link.mockImplementation(async (current: UserDouble) => { current.providerData = [{ providerId: "google.com" }]; return { user: current }; });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("browser session transfer", () => {
  it.each([
    ["designer", "[DEFAULT]", "vibeestimate-migrated-designer"],
    ["client", "vibeestimate-client", "vibeestimate-migrated-vibeestimate-client"],
    [`client-google:${roomId}`, `vibeestimate-client-google-${roomId}`, `vibeestimate-migrated-vibeestimate-client-google-${roomId}`],
  ] as const)("restores %s through its original app and preserves the source session", async (identity, oldName, targetName) => {
    const source = persistSource(oldName);
    const { ensureSessionReady, clientAuth } = await import("../src/lib/firebase");
    const [first, duplicate] = await Promise.all([ensureSessionReady(identity), ensureSessionReady(identity)]);
    expect(first).toBe(duplicate);
    expect(clientAuth(identity).app.name).toBe(targetName);
    expect(first.currentUser?.uid).toBe(source.uid);
    expect(sdk.auths.get(oldName)?.currentUser).toBe(source);
    expect(source.getIdToken).toHaveBeenCalledExactlyOnceWith(true);
    expect(sdk.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = sdk.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/migrate");
    expect(options).toMatchObject({ method: "POST", body: "{}", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer source-token-${source.uid}` } });
    expect(sdk.persistence).toHaveBeenCalledWith(first, { type: "LOCAL" });
    expect(sdk.custom).toHaveBeenCalledTimes(1);
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it("keeps designer and client transfers independent even when they finish together", async () => {
    persistSource("[DEFAULT]", user("owner")); persistSource("vibeestimate-client", user("client"));
    const { ensureSessionReady, clientAuth } = await import("../src/lib/firebase");
    await Promise.all([ensureSessionReady(), ensureSessionReady("client")]);
    expect(clientAuth().currentUser?.uid).toBe("owner"); expect(clientAuth("client").currentUser?.uid).toBe("client");
    expect(sdk.custom).toHaveBeenCalledTimes(2);
  });

  it("never creates a replacement guest after transfer failures and permits a safe retry", async () => {
    const source = persistSource(); sdk.fetch.mockRejectedValueOnce(new Error("private transport detail"));
    const { startSession, clientAuth } = await import("../src/lib/firebase");
    await expect(startSession()).rejects.toThrow("existing access has been preserved");
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.custom).not.toHaveBeenCalled();
    expect(sdk.auths.get("[DEFAULT]")?.currentUser).toBe(source);
    const recovered = await startSession();
    expect(recovered.user.uid).toBe(source.uid); expect(clientAuth().currentUser?.uid).toBe(source.uid);
    expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it.each(["expired-source", "http-failure", "wrong-response-uid", "malformed-response", "wrong-token-uid"])("fails closed for %s", async failure => {
    const source = persistSource();
    if (failure === "expired-source") source.getIdToken.mockRejectedValueOnce(new Error("private-refresh-token"));
    if (failure === "http-failure") sdk.fetch.mockResolvedValueOnce(new Response("private-server-detail", { status: 503 }));
    if (failure === "wrong-response-uid") sdk.fetch.mockResolvedValueOnce(Response.json({ uid: "another-owner", customToken: "custom-another-owner" }));
    if (failure === "malformed-response") sdk.fetch.mockResolvedValueOnce(Response.json({ uid: source.uid, customToken: "" }));
    if (failure === "wrong-token-uid") sdk.custom.mockImplementationOnce(async (auth: AuthDouble) => { auth.currentUser = user("another-owner", false); return { user: auth.currentUser }; });
    const { startSession, clientAuth } = await import("../src/lib/firebase");
    await expect(startSession()).rejects.toThrow("existing access has been preserved");
    expect(clientAuth().currentUser).toBeNull();
    expect(sdk.auths.get("[DEFAULT]")?.currentUser).toBe(source); expect(sdk.anonymous).not.toHaveBeenCalled();
    if (failure === "wrong-token-uid") expect(sdk.signOut).toHaveBeenCalledWith(clientAuth());
    else expect(sdk.custom).not.toHaveBeenCalled();
  });

  it("does not replace a target identity that another tab restored while transfer was pending", async () => {
    persistSource();
    const { ensureSessionReady, clientAuth } = await import("../src/lib/firebase");
    sdk.fetch.mockImplementationOnce(async () => {
      sdk.auths.get(clientAuth().app.name)!.currentUser = user("other-target", false, [{ providerId: "google.com" }]);
      return Response.json({ uid: "original-owner", customToken: "custom-original-owner" });
    });
    await expect(ensureSessionReady()).rejects.toThrow("existing access has been preserved");
    expect(clientAuth().currentUser?.uid).toBe("other-target"); expect(sdk.custom).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it("rechecks the target after changing persistence so another tab's account is not overwritten", async () => {
    persistSource();
    sdk.persistence.mockImplementationOnce(async (auth: AuthDouble) => { auth.currentUser = user("other-target", false, [{ providerId: "google.com" }]); });
    const { ensureSessionReady, clientAuth } = await import("../src/lib/firebase");
    await expect(ensureSessionReady()).rejects.toThrow("existing access has been preserved");
    expect(clientAuth().currentUser?.uid).toBe("other-target"); expect(sdk.custom).not.toHaveBeenCalled();
  });

  it("discards only the newly transferred target session if the source account changed during sign-in", async () => {
    persistSource(); const replacement = user("new-source-owner");
    sdk.custom.mockImplementationOnce(async (auth: AuthDouble) => {
      auth.currentUser = user("original-owner", false);
      sdk.auths.get("[DEFAULT]")!.currentUser = replacement;
      return { user: auth.currentUser };
    });
    const { ensureSessionReady, clientAuth } = await import("../src/lib/firebase");
    await expect(ensureSessionReady()).rejects.toThrow("existing access has been preserved");
    expect(clientAuth().currentUser).toBeNull(); expect(sdk.auths.get("[DEFAULT]")!.currentUser).toBe(replacement);
    expect(sdk.signOut).toHaveBeenCalledWith(clientAuth()); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("restores the same target session after legacy configuration is retired", async () => {
    persistSource();
    const { ensureSessionReady, clientAuth, startSession } = await import("../src/lib/firebase");
    await ensureSessionReady(); const target = clientAuth();
    delete window.__VIBEESTIMATE_LEGACY_FIREBASE__;
    expect(await ensureSessionReady()).toBe(target); expect((await startSession()).user.uid).toBe("original-owner");
    expect(sdk.fetch).toHaveBeenCalledTimes(1); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("creates a new target guest only when no source or target session exists", async () => {
    const { startSession } = await import("../src/lib/firebase");
    expect((await startSession()).user.uid).toBe("new-guest");
    expect(sdk.auths.get("[DEFAULT]")?.authStateReady).toHaveBeenCalledTimes(1);
    expect(sdk.fetch).not.toHaveBeenCalled(); expect(sdk.anonymous).toHaveBeenCalledTimes(1);
  });

  it("waits for asynchronous source persistence restoration before deciding whether a guest is new", async () => {
    const app = { name: "[DEFAULT]", options: legacy };
    const source = user("delayed-owner");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const oldAuth: AuthDouble = { app, currentUser: null, authStateReady: vi.fn(async () => { await gate; oldAuth.currentUser = source; }) };
    sdk.apps.set(app.name, app); sdk.auths.set(app.name, oldAuth);
    const { startSession } = await import("../src/lib/firebase");
    const pending = startSession();
    await vi.waitFor(() => { expect(oldAuth.authStateReady).toHaveBeenCalled(); });
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.fetch).not.toHaveBeenCalled();
    release();
    expect((await pending).user.uid).toBe(source.uid);
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(oldAuth.currentUser).toBe(source);
  });

  it("preserves existing app names and ordinary sign-in behavior without migration configuration", async () => {
    window.__VIBEESTIMATE_FIREBASE__ = legacy; delete window.__VIBEESTIMATE_LEGACY_FIREBASE__;
    const source = persistSource(); const { startSession, clientAuth } = await import("../src/lib/firebase");
    expect((await startSession()).user.uid).toBe(source.uid); expect(clientAuth().app.name).toBe("[DEFAULT]");
    expect(sdk.fetch).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("treats a migrated providerless account as a guest and still permits linking Google", async () => {
    persistSource(); const { startSession, saveAccessWithGoogle, isGuestUser, clientAuth } = await import("../src/lib/firebase");
    await startSession(); const current = clientAuth().currentUser!;
    expect(current.isAnonymous).toBe(false); expect(isGuestUser(current)).toBe(true);
    await saveAccessWithGoogle();
    expect(sdk.link).toHaveBeenCalledWith(current, expect.anything()); expect(isGuestUser(current)).toBe(false);
    expect(current.uid).toBe("original-owner"); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("rejects missing namespace and same-project sources before sign-in", async () => {
    const { clientAuth } = await import("../src/lib/firebase");
    delete window.__VIBEESTIMATE_FIREBASE__!.appNamespace;
    expect(() => clientAuth()).toThrow("existing access has been preserved");
    window.__VIBEESTIMATE_FIREBASE__ = core; window.__VIBEESTIMATE_LEGACY_FIREBASE__ = { ...legacy, projectId: core.projectId };
    expect(() => clientAuth()).toThrow("existing access has been preserved");
    expect(sdk.apps.size).toBe(0); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("rejects a migration bridge in emulator mode before initializing Firebase", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" }, __VIBEESTIMATE_FIREBASE__: { ...core, projectId: "demo-target" }, __VIBEESTIMATE_LEGACY_FIREBASE__: { ...legacy, projectId: "demo-source" } });
    const { clientAuth } = await import("../src/lib/firebase");
    expect(() => clientAuth()).toThrow("existing access has been preserved");
    expect(sdk.apps.size).toBe(0); expect(sdk.fetch).not.toHaveBeenCalled();
  });

  it("rejects a named Firebase app initialized for another project", async () => {
    const name = "vibeestimate-migrated-designer";
    sdk.apps.set(name, { name, options: legacy });
    const { clientAuth } = await import("../src/lib/firebase");
    expect(() => clientAuth()).toThrow("existing access has been preserved");
    expect(sdk.fetch).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled();
  });
});

describe("explicit sign-out during migration", () => {
  it.each([
    ["designer", "[DEFAULT]"],
    ["client", "vibeestimate-client"],
    [`client-google:${roomId}`, `vibeestimate-client-google-${roomId}`],
  ] as const)("clears only %s source and target sessions, including different UIDs", async (identity, oldName) => {
    const identities = ["designer", "client", `client-google:${roomId}`] as const;
    const oldNames = ["[DEFAULT]", "vibeestimate-client", `vibeestimate-client-google-${roomId}`];
    oldNames.forEach((name, index) => persistSource(name, user(`owner-${index}`)));
    const { ensureSessionReady, clientAuth, signOutSession } = await import("../src/lib/firebase");
    await Promise.all(identities.map(value => ensureSessionReady(value)));
    // An explicit account switch in the target must not resurrect the older source.
    sdk.auths.get(clientAuth(identity).app.name)!.currentUser = user("different-target-owner", false);
    await signOutSession(identity);
    expect(clientAuth(identity).currentUser).toBeNull();
    expect(sdk.auths.get(oldName)?.currentUser).toBeNull();
    identities.forEach((value, index) => {
      if (value === identity) return;
      expect(clientAuth(value).currentUser?.uid).toBe(`owner-${index}`);
      expect(sdk.auths.get(oldNames[index])?.currentUser?.uid).toBe(`owner-${index}`);
    });
    expect(sdk.signOut).toHaveBeenCalledTimes(2);
    expect((await ensureSessionReady(identity)).currentUser).toBeNull();
    expect(sdk.fetch).toHaveBeenCalledTimes(3);
  });

  it("clears both matching sessions after a successful transfer", async () => {
    persistSource(); const { ensureSessionReady, signOutSession, clientAuth } = await import("../src/lib/firebase");
    await ensureSessionReady(); await signOutSession();
    expect(clientAuth().currentUser).toBeNull(); expect(sdk.auths.get("[DEFAULT]")?.currentUser).toBeNull();
    expect(sdk.signOut).toHaveBeenCalledTimes(2);
  });

  it.each(["source", "target"])("reports an incomplete %s sign-out while attempting both sessions", async failure => {
    persistSource(); const { ensureSessionReady, signOutSession, clientAuth } = await import("../src/lib/firebase");
    await ensureSessionReady();
    sdk.signOut.mockImplementation(async (auth: AuthDouble) => {
      if ((auth.app.name === "[DEFAULT]") === (failure === "source")) throw new Error("private SDK detail");
      auth.currentUser = null;
    });
    await expect(signOutSession()).rejects.toThrow("Sign out could not finish. Retry before leaving this browser.");
    expect(sdk.signOut).toHaveBeenCalledTimes(2); expect(sdk.anonymous).not.toHaveBeenCalled();
    expect(clientAuth().currentUser === null).toBe(failure === "source");
    expect(sdk.auths.get("[DEFAULT]")?.currentUser === null).toBe(failure === "target");
  });

  it("waits for an in-flight transfer before clearing both sessions", async () => {
    persistSource(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    sdk.fetch.mockImplementationOnce(async () => { await gate; return Response.json({ uid: "original-owner", customToken: "custom-original-owner" }); });
    const { startSession, signOutSession, clientAuth } = await import("../src/lib/firebase");
    const transfer = startSession();
    await vi.waitFor(() => { expect(sdk.fetch).toHaveBeenCalledTimes(1); });
    const leaving = signOutSession();
    expect(sdk.signOut).not.toHaveBeenCalled(); release();
    await transfer; await leaving;
    expect(clientAuth().currentUser).toBeNull(); expect(sdk.auths.get("[DEFAULT]")?.currentUser).toBeNull();
    expect(sdk.signOut).toHaveBeenCalledTimes(2); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("signs out the original app alone when no migration bridge is configured", async () => {
    window.__VIBEESTIMATE_FIREBASE__ = legacy; delete window.__VIBEESTIMATE_LEGACY_FIREBASE__;
    persistSource(); const { ensureSessionReady, signOutSession, clientAuth } = await import("../src/lib/firebase");
    await ensureSessionReady(); await signOutSession();
    expect(clientAuth().currentUser).toBeNull(); expect(sdk.signOut).toHaveBeenCalledTimes(1); expect(sdk.fetch).not.toHaveBeenCalled();
  });
});
