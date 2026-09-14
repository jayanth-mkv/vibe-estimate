import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserDouble = { uid: string; isAnonymous: boolean; providerData: { providerId: string }[]; getIdToken: ReturnType<typeof vi.fn> };
type AppDouble = { name: string; options: { projectId: string; apiKey: string } };
type AuthDouble = { app: AppDouble; currentUser: UserDouble | null; authStateReady: ReturnType<typeof vi.fn>; emulatorConfig?: { url: string } };
const sdk = vi.hoisted(() => ({
  apps: new Map<string, AppDouble>(), auths: new Map<string, AuthDouble>(), persisted: new Map<string, UserDouble>(),
  anonymous: vi.fn(), popup: vi.fn(), link: vi.fn(), persistence: vi.fn(), signOut: vi.fn(), emulator: vi.fn(),
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
  browserLocalPersistence: { type: "LOCAL" }, connectAuthEmulator: sdk.emulator,
  getAuth: (app: AppDouble) => sdk.auths.get(app.name), GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  linkWithPopup: sdk.link, setPersistence: sdk.persistence, signInAnonymously: sdk.anonymous,
  signInWithPopup: sdk.popup, signOut: sdk.signOut,
}));

const config = { projectId: "demo-workspace", apiKey: "demo-browser-key", authDomain: "demo-workspace.firebaseapp.com", appId: "demo-app", appNamespace: "workspace", authMode: "google" as const };
const roomId = "b88aa97d-cf7d-4fdd-a046-53547c732e88";
const user = (uid: string, google = true): UserDouble => ({ uid, isAnonymous: !google, providerData: google ? [{ providerId: "google.com" }] : [], getIdToken: vi.fn(async () => `test-token-${uid}`) });
const remember = (name: string, current = user("saved-owner")) => { sdk.persisted.set(`${config.projectId}:${name}`, current); return current; };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); sdk.apps.clear(); sdk.auths.clear(); sdk.persisted.clear();
  vi.stubGlobal("window", { location: { hostname: "localhost" }, __VIBEESTIMATE_FIREBASE__: { ...config } });
  vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "false"); vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "guest"); vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "false");
  sdk.persistence.mockResolvedValue(undefined);
  sdk.popup.mockImplementation(async (auth: AuthDouble) => { auth.currentUser = user("google-owner"); return { user: auth.currentUser }; });
  sdk.anonymous.mockImplementation(async (auth: AuthDouble) => { auth.currentUser = user("local-guest", false); return { user: auth.currentUser }; });
  sdk.signOut.mockImplementation(async (auth: AuthDouble) => { auth.currentUser = null; });
  sdk.link.mockImplementation(async (current: UserDouble) => { current.isAnonymous = false; current.providerData = [{ providerId: "google.com" }]; return { user: current }; });
  sdk.emulator.mockImplementation((auth: AuthDouble, url: string) => { auth.emulatorConfig = { url }; });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("persistent Firebase identity namespaces", () => {
  it.each([
    ["designer", "vibeestimate-workspace-designer"],
    ["client", "vibeestimate-workspace-vibeestimate-client"],
    [`client-google:${roomId}`, `vibeestimate-workspace-vibeestimate-client-google-${roomId}`],
  ] as const)("restores %s from its exact configured app name", async (identity, name) => {
    const saved = remember(name);
    const { ensureSessionReady, clientAuth, canUseSession } = await import("../src/lib/firebase");
    const [first, duplicate] = await Promise.all([ensureSessionReady(identity), ensureSessionReady(identity)]);
    expect(first).toBe(duplicate); expect(first.app.name).toBe(name); expect(first.currentUser).toBe(saved);
    expect(clientAuth(identity)).toBe(first); expect(first.authStateReady).toHaveBeenCalledTimes(1);
    expect(canUseSession(first.currentUser)).toBe(true); expect(sdk.apps.size).toBe(1);
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it.each(["a", "stable-session", "release-2"])("uses the opaque namespace %s without special account behavior", async appNamespace => {
    window.__VIBEESTIMATE_FIREBASE__!.appNamespace = appNamespace;
    const name = `vibeestimate-${appNamespace}-designer`, saved = remember(name);
    const { startSession, clientAuth } = await import("../src/lib/firebase");
    expect((await startSession()).user).toBe(saved); expect(clientAuth().app.name).toBe(name);
    expect(sdk.popup).not.toHaveBeenCalled();
  });

  it("keeps default designer, client and room app names when no namespace is configured", async () => {
    delete window.__VIBEESTIMATE_FIREBASE__!.appNamespace;
    const { clientAuth } = await import("../src/lib/firebase");
    expect(clientAuth().app.name).toBe("[DEFAULT]"); expect(clientAuth("client").app.name).toBe("vibeestimate-client");
    expect(clientAuth(`client-google:${roomId}`).app.name).toBe(`vibeestimate-client-google-${roomId}`);
  });

  it.each(["", "../other", "two spaces", "[DEFAULT]", "UPPERCASE", "a".repeat(33)])("rejects invalid namespace %s before initializing an app", async appNamespace => {
    window.__VIBEESTIMATE_FIREBASE__!.appNamespace = appNamespace;
    const { clientAuth } = await import("../src/lib/firebase");
    expect(() => clientAuth()).toThrow("existing access has been preserved"); expect(sdk.apps.size).toBe(0);
  });

  it("fails closed if an existing named app belongs to another project", async () => {
    sdk.apps.set("vibeestimate-workspace-designer", { name: "vibeestimate-workspace-designer", options: { projectId: "demo-other", apiKey: "other-key" } });
    const { clientAuth } = await import("../src/lib/firebase");
    expect(() => clientAuth()).toThrow("existing access has been preserved"); expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it("waits for asynchronous session restoration before opening any sign-in action", async () => {
    const { clientAuth, startSession } = await import("../src/lib/firebase");
    const auth = clientAuth() as unknown as AuthDouble, saved = user("restored-owner");
    let release!: () => void; const restored = new Promise<void>(resolve => { release = resolve; });
    auth.authStateReady.mockImplementationOnce(async () => { await restored; auth.currentUser = saved; });
    const pending = startSession();
    await vi.waitFor(() => { expect(auth.authStateReady).toHaveBeenCalled(); });
    expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled();
    release(); expect((await pending).user).toBe(saved);
    expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("preserves the current session when persistence restoration fails", async () => {
    const { clientAuth, startSession } = await import("../src/lib/firebase");
    const auth = clientAuth() as unknown as AuthDouble;
    auth.authStateReady.mockRejectedValueOnce(new Error("private SDK details"));
    await expect(startSession()).rejects.toThrow("existing access has been preserved");
    expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });
});

describe("Google-only access and local fixtures", () => {
  it("uses runtime Google policy even when the image was configured for guest access", async () => {
    const { startSession, canUseSession, allowsAnonymousSessions, isGoogleAuthEnabled } = await import("../src/lib/firebase");
    expect(allowsAnonymousSessions()).toBe(false); expect(isGoogleAuthEnabled()).toBe(true);
    const [first, duplicate] = await Promise.all([startSession(), startSession()]);
    expect(first).toBe(duplicate); expect(canUseSession(first.user)).toBe(true);
    expect(sdk.popup).toHaveBeenCalledTimes(1); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("uses anonymous authentication only when local fixture mode permits it", async () => {
    delete window.__VIBEESTIMATE_FIREBASE__!.authMode;
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    const { startSession, allowsAnonymousSessions, canUseSession } = await import("../src/lib/firebase");
    expect(allowsAnonymousSessions()).toBe(true); expect(canUseSession((await startSession()).user)).toBe(true);
    expect(sdk.emulator).toHaveBeenCalledTimes(1); expect(sdk.anonymous).toHaveBeenCalledTimes(1); expect(sdk.popup).not.toHaveBeenCalled();
  });

  it.each(["remote-host", "non-demo-project"])("rejects unsafe emulator configuration: %s", async failure => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    if (failure === "remote-host") vi.stubGlobal("window", { location: { hostname: "remote.example" }, __VIBEESTIMATE_FIREBASE__: config });
    else window.__VIBEESTIMATE_FIREBASE__!.projectId = "real-project";
    const { startSession } = await import("../src/lib/firebase");
    await expect(startSession()).rejects.toThrow("Local sign-in requires a demo project on localhost"); expect(sdk.apps.size).toBe(0);
  });

  it("links a providerless account to Google with the same UID and refreshes its token", async () => {
    const saved = remember("vibeestimate-workspace-designer", user("providerless-owner", false)); saved.isAnonymous = false;
    const { ensureSessionReady, startSession, canUseSession, isGuestUser } = await import("../src/lib/firebase");
    const auth = await ensureSessionReady(); expect(canUseSession(auth.currentUser)).toBe(false); expect(isGuestUser(auth.currentUser)).toBe(true);
    const result = await startSession(); expect(result.user).toBe(saved); expect(result.user.uid).toBe("providerless-owner");
    expect(canUseSession(result.user)).toBe(true); expect(saved.getIdToken).toHaveBeenCalledWith(true);
    expect(sdk.link).toHaveBeenCalledTimes(1); expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it.each(["auth/credential-already-in-use", "auth/popup-closed-by-user", "auth/network-request-failed"])("preserves the unlinked account after %s", async code => {
    const saved = remember("vibeestimate-workspace-designer", user("saved-owner", false)); sdk.link.mockRejectedValueOnce({ code });
    const { startSession, clientAuth, canUseSession } = await import("../src/lib/firebase");
    await expect(startSession()).rejects.toThrow("still here");
    expect(clientAuth().currentUser).toBe(saved); expect(canUseSession(clientAuth().currentUser)).toBe(false);
    expect(sdk.popup).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled(); expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("does not replace unlinked work through the returning Google action", async () => {
    const saved = remember("vibeestimate-workspace-designer", user("saved-owner", false));
    const { openGoogleWorkspace, clientAuth } = await import("../src/lib/firebase");
    await openGoogleWorkspace(); expect(clientAuth().currentUser).toBe(saved); expect(sdk.link).toHaveBeenCalledTimes(1); expect(sdk.popup).not.toHaveBeenCalled();
  });

  it("does not offer guest access after a failed Google-only sign-in", async () => {
    sdk.popup.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    const { openGoogleWorkspace } = await import("../src/lib/firebase");
    await expect(openGoogleWorkspace()).rejects.toThrow("Your saved work is unchanged. Try Google sign-in again");
    expect(sdk.anonymous).not.toHaveBeenCalled(); expect(sdk.signOut).not.toHaveBeenCalled();
  });
});

describe("explicit sign-out", () => {
  it.each(["designer", "client", `client-google:${roomId}`] as const)("clears only the %s logical identity", async selected => {
    const identities = ["designer", "client", `client-google:${roomId}`] as const;
    const { clientAuth, signOutSession } = await import("../src/lib/firebase");
    for (const [index, identity] of identities.entries()) (clientAuth(identity) as unknown as AuthDouble).currentUser = user(`owner-${index}`);
    await signOutSession(selected);
    for (const [index, identity] of identities.entries()) expect(clientAuth(identity).currentUser?.uid ?? null).toBe(identity === selected ? null : `owner-${index}`);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("waits for a pending sign-in before clearing the requested session", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    sdk.popup.mockImplementationOnce(async (auth: AuthDouble) => { await gate; auth.currentUser = user("google-owner"); return { user: auth.currentUser }; });
    const { startSession, signOutSession, clientAuth } = await import("../src/lib/firebase");
    const start = startSession(); await vi.waitFor(() => { expect(sdk.popup).toHaveBeenCalled(); });
    const leave = signOutSession(); expect(sdk.signOut).not.toHaveBeenCalled(); release();
    await start; await leave; expect(clientAuth().currentUser).toBeNull(); expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("reports failed sign-out without clearing unrelated sessions", async () => {
    const saved = remember("vibeestimate-workspace-designer"); sdk.signOut.mockRejectedValueOnce(new Error("private SDK details"));
    const { signOutSession, clientAuth } = await import("../src/lib/firebase");
    await expect(signOutSession()).rejects.toThrow("Sign out could not finish. Retry before leaving this browser.");
    expect(clientAuth().currentUser).toBe(saved); expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });
});
