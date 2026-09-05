import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  apps: new Map<string, { name: string }>(),
  auths: new Map<string, { app: { name: string }; currentUser: { uid: string; isAnonymous: boolean } | null }>(),
  popup: vi.fn(),
  anonymous: vi.fn(),
  persistence: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: () => [...sdk.apps.values()],
  initializeApp: (_config: unknown, name: string) => {
    const app = { name };
    sdk.apps.set(name, app);
    sdk.auths.set(name, { app, currentUser: null });
    return app;
  },
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { type: "LOCAL" },
  connectAuthEmulator: vi.fn(),
  getAuth: (app: { name: string }) => sdk.auths.get(app.name),
  GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  linkWithPopup: vi.fn(),
  setPersistence: sdk.persistence,
  signInAnonymously: sdk.anonymous,
  signInWithPopup: sdk.popup,
}));

const roomId = "b88aa97d-cf7d-4fdd-a046-53547c732e88";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sdk.apps.clear();
  sdk.auths.clear();
  for (const [name, uid] of [["vibeestimate-client", "guest-with-room-history"], ["[DEFAULT]", "designer-with-drafts"]]) {
    const app = { name };
    sdk.apps.set(name, app);
    sdk.auths.set(name, { app, currentUser: Object.freeze({ uid, isAnonymous: true }) });
  }
  sdk.persistence.mockResolvedValue(undefined);
  sdk.popup.mockImplementation(async (auth) => {
    auth.currentUser = { uid: `google-for-${auth.app.name}`, isAnonymous: false };
    return { user: auth.currentUser };
  });
  vi.stubGlobal("window", { location: { hostname: "localhost" } });
  vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "false");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "guest");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Firebase recovery identity boundary", () => {
  it("opens Google only in the requested room's separate app and preserves populated guest identities", async () => {
    const { clientAuth, openGoogleClientRoom } = await import("../src/lib/firebase");
    const guest = clientAuth("client").currentUser;
    const designer = clientAuth().currentUser;
    await openGoogleClientRoom(`client-google:${roomId}`);
    const recovered = sdk.auths.get(`vibeestimate-client-google-${roomId}`);
    expect(sdk.popup).toHaveBeenCalledWith(recovered, expect.anything());
    expect(sdk.persistence).toHaveBeenCalledWith(recovered, { type: "LOCAL" });
    expect(clientAuth("client").currentUser).toBe(guest);
    expect(clientAuth().currentUser).toBe(designer);
    expect(recovered?.currentUser?.isAnonymous).toBe(false);
    expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it.each(["auth/popup-closed-by-user", "auth/network-request-failed"])("preserves the guest after %s", async (code) => {
    const { clientAuth, openGoogleClientRoom } = await import("../src/lib/firebase");
    const guest = clientAuth("client").currentUser;
    const designer = clientAuth().currentUser;
    sdk.popup.mockRejectedValueOnce({ code });
    await expect(openGoogleClientRoom(`client-google:${roomId}`)).rejects.toThrow("guest rooms are unchanged");
    expect(clientAuth("client").currentUser).toBe(guest);
    expect(clientAuth().currentUser).toBe(designer);
    expect(sdk.anonymous).not.toHaveBeenCalled();
  });

  it("does not replace a previously recovered room's Google identity when another room is opened", async () => {
    const { clientAuth, openGoogleClientRoom } = await import("../src/lib/firebase");
    await openGoogleClientRoom(`client-google:${roomId}`);
    const original = clientAuth(`client-google:${roomId}`).currentUser;
    await openGoogleClientRoom("client-google:d947f039-ef17-476d-af87-25dba2073685");
    expect(clientAuth(`client-google:${roomId}`).currentUser).toBe(original);
  });

  it("never silently creates a guest in a stored Google recovery app", async () => {
    const { startSession } = await import("../src/lib/firebase");
    await expect(startSession(`client-google:${roomId}`)).rejects.toThrow("Continue with Google");
    expect(sdk.anonymous).not.toHaveBeenCalled();
    expect(sdk.popup).not.toHaveBeenCalled();
  });

  it("does not open a provider popup when Google has not been enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "false");
    const { openGoogleClientRoom } = await import("../src/lib/firebase");
    await expect(openGoogleClientRoom(`client-google:${roomId}`)).rejects.toThrow("not available");
    expect(sdk.popup).not.toHaveBeenCalled();
  });
});
