import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, linkWithPopup, setPersistence, signInAnonymously, signInWithCustomToken, signInWithPopup, signOut, type Auth, type User, type UserCredential } from "firebase/auth";
import { recoveryIdentity, type ClientRoomIdentity, type GoogleRoomIdentity } from "./client-room-access";
import type {} from "./public-runtime-config";

export const usesEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export const usesGuestAccess = process.env.NEXT_PUBLIC_AUTH_MODE === "guest";
export const usesAnonymousAuth = usesEmulators || usesGuestAccess;
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
export type SessionIdentity = "designer" | ClientRoomIdentity;
const pendingSessions = new Map<SessionIdentity, Promise<UserCredential>>();
const pendingReadiness = new Map<SessionIdentity, Promise<Auth>>();
const migrationFailure = () => new Error("Your saved workspace could not reconnect. Keep this browser session and retry. Your existing access has been preserved.");

/** Custom-token migration retains guest access without linking a recovery provider. */
export const isGuestUser = (user: Pick<User, "isAnonymous" | "providerData"> | null | undefined): boolean => Boolean(user && (user.isAnonymous || user.providerData.length === 0));

function originalAppName(identity: SessionIdentity) {
  return identity === "designer" ? "[DEFAULT]" : identity === "client" ? "vibeestimate-client" : `vibeestimate-${recoveryIdentity(identity.slice("client-google:".length)).replace(":", "-")}`;
}

export function clientAuth(identity: SessionIdentity = "designer") {
  if (typeof window === "undefined") throw new Error("Sign-in is available in the browser.");
  const publicConfig = window.__VIBEESTIMATE_FIREBASE__;
  const projectId = publicConfig?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = publicConfig?.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Sign-in is temporarily unavailable. Keep this page open and try again shortly.");
  if (usesEmulators && (!projectId.startsWith("demo-") || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))) throw new Error("Local sign-in requires a demo project on localhost.");
  const originalName = originalAppName(identity);
  const legacy = window.__VIBEESTIMATE_LEGACY_FIREBASE__;
  if ((publicConfig?.appNamespace !== undefined && publicConfig.appNamespace !== "migrated") || (legacy && (usesEmulators || publicConfig?.appNamespace !== "migrated" || legacy.projectId === projectId || legacy.apiKey === apiKey))) throw migrationFailure();
  // This namespace remains in target configuration after the legacy bridge retires.
  const appName = publicConfig?.appNamespace === "migrated" ? `vibeestimate-migrated-${identity === "designer" ? "designer" : originalName}` : originalName;
  const existingApp = getApps().find((candidate) => candidate.name === appName);
  if (existingApp && (existingApp.options.projectId !== projectId || existingApp.options.apiKey !== apiKey)) throw migrationFailure();
  const app = existingApp ?? initializeApp({ projectId, apiKey, authDomain: publicConfig?.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, appId: publicConfig?.appId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID }, appName);
  const auth = getAuth(app);
  if (usesEmulators && !auth.emulatorConfig) {
    const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(emulatorUrl).hostname)) throw new Error("The sign-in emulator must run locally.");
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

/** Finish source-session transfer before any consumer subscribes or creates a guest. */
export async function ensureSessionReady(identity: SessionIdentity = "designer"): Promise<Auth> {
  const existing = pendingReadiness.get(identity);
  if (existing) return existing;
  const pending = (async () => {
    const auth = clientAuth(identity);
    const currentTarget = (): User | null => auth.currentUser;
    await auth.authStateReady();
    const legacyConfig = window.__VIBEESTIMATE_LEGACY_FIREBASE__;
    if (auth.currentUser || !legacyConfig) return auth;
    const name = originalAppName(identity);
    const existingApp = getApps().find(candidate => candidate.name === name);
    if (existingApp && (existingApp.options.projectId !== legacyConfig.projectId || existingApp.options.apiKey !== legacyConfig.apiKey)) throw migrationFailure();
    const app = existingApp ?? initializeApp(legacyConfig, name);
    const legacy = getAuth(app);
    try {
      await legacy.authStateReady();
      const source = legacy.currentUser;
      if (!source) return auth;
      const token = await source.getIdToken(true);
      if (legacy.currentUser?.uid !== source.uid) throw migrationFailure();
      const response = await fetch("/api/auth/migrate", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{}",
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw migrationFailure();
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) throw migrationFailure();
      const { customToken, uid } = result as Record<string, unknown>;
      if (typeof customToken !== "string" || !customToken || customToken.length > 16384 || uid !== source.uid || legacy.currentUser?.uid !== source.uid) throw migrationFailure();
      // Another tab may have restored a target session while this request was pending.
      const restored = currentTarget();
      if (restored) {
        if (restored.uid !== uid) throw migrationFailure();
        return auth;
      }
      await setPersistence(auth, browserLocalPersistence);
      const beforeSignIn = currentTarget();
      if (legacy.currentUser?.uid !== uid || (beforeSignIn && beforeSignIn.uid !== uid)) throw migrationFailure();
      if (beforeSignIn) return auth;
      const credential = await signInWithCustomToken(auth, customToken);
      const signedIn = currentTarget();
      if (credential.user.uid !== uid || signedIn?.uid !== uid || legacy.currentUser?.uid !== uid) {
        if (signedIn === credential.user) await signOut(auth);
        throw migrationFailure();
      }
      return auth;
    } catch { throw migrationFailure(); }
  })();
  pendingReadiness.set(identity, pending);
  try { return await pending; }
  finally { if (pendingReadiness.get(identity) === pending) pendingReadiness.delete(identity); }
}

/** The user's explicit sign-out clears only this logical identity in both projects. */
export async function signOutSession(identity: SessionIdentity = "designer") {
  // Finish an in-flight transfer or guest start before removing its session.
  await Promise.allSettled([pendingSessions.get(identity), pendingReadiness.get(identity)]);
  const auth = clientAuth(identity);
  const sessions = [auth];
  const config = window.__VIBEESTIMATE_LEGACY_FIREBASE__;
  if (config) {
    const name = originalAppName(identity);
    const existing = getApps().find(candidate => candidate.name === name);
    if (existing && (existing.options.projectId !== config.projectId || existing.options.apiKey !== config.apiKey)) throw migrationFailure();
    sessions.push(getAuth(existing ?? initializeApp(config, name)));
  }
  const results = await Promise.allSettled(sessions.map(async session => { await session.authStateReady(); await signOut(session); }));
  if (results.some(result => result.status === "rejected")) throw new Error("Sign out could not finish. Retry before leaving this browser.");
}

export async function startSession(identity: SessionIdentity = "designer") {
  if (identity !== "designer" && identity !== "client") throw new Error("Use Continue with Google to reopen this room. Your guest access is unchanged.");
  const existing = pendingSessions.get(identity);
  if (existing) return existing;
  const pending = (async () => {
    const auth = await ensureSessionReady(identity);
    if (auth.currentUser) return { user: auth.currentUser, providerId: null, operationType: "signIn" as const };
    await setPersistence(auth, browserLocalPersistence);
    return usesAnonymousAuth ? signInAnonymously(auth) : signInWithPopup(auth, new GoogleAuthProvider());
  })();
  pendingSessions.set(identity, pending);
  try { return await pending; }
  finally { if (pendingSessions.get(identity) === pending) pendingSessions.delete(identity); }
}

export async function openGoogleClientRoom(identity: GoogleRoomIdentity) {
  if (!googleAuthEnabled) throw new Error("Google account access is not available here yet. Your guest rooms are unchanged.");
  const auth = await ensureSessionReady(identity);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Each recovered room has a separate Firebase app. A popup here cannot
    // replace the designer, client guest, or another recovered room's session.
    await setPersistence(auth, browserLocalPersistence);
    return await signInWithPopup(auth, provider);
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(code)) {
      throw new Error("Google connection was cancelled. Your guest rooms are unchanged; try again when you’re ready.");
    }
    throw new Error("Google could not reconnect to this room. Your guest rooms are unchanged. Try again when your connection is ready.");
  }
}

export async function saveAccessWithGoogle(identity: SessionIdentity = "designer") {
  if (!googleAuthEnabled) throw new Error("Google account access is not available here yet. You can keep working as a guest.");
  const auth = await ensureSessionReady(identity);
  const currentUser = auth.currentUser;
  if (!currentUser || !isGuestUser(currentUser)) throw new Error("Your guest session is no longer active. Reopen your workspace and try again.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Linking keeps the verified UID and its owned projects. Never sign out or
    // switch to a different account when this Google account is already in use.
    return await linkWithPopup(currentUser, provider);
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
    if (["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"].includes(code)) {
      throw new Error("That Google account already has a workspace. Your guest work is still here. Choose another Google account, or keep using this browser.");
    }
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(code)) {
      throw new Error("Google connection was cancelled. Your guest workspace is still here; you can keep working.");
    }
    throw new Error("Google access could not be saved. Your guest workspace is still here. Try again when you’re ready.");
  }
}

export async function openGoogleWorkspace() {
  if (!googleAuthEnabled) throw new Error("Google account access is not available here yet. You can keep working as a guest.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Called only by the explicit returning-account action on an empty home.
    // The caller blocks this action when there is guest work or an edited form.
    return await signInWithPopup(await ensureSessionReady(), provider);
  } catch {
    throw new Error("Your Google workspace could not be opened. Your current guest session is still here. Try again, or keep working as a guest.");
  }
}
