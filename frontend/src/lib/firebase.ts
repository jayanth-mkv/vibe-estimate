import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, linkWithPopup, setPersistence, signInAnonymously, signInWithPopup, signOut, type Auth, type User, type UserCredential } from "firebase/auth";
import { recoveryIdentity, type ClientRoomIdentity, type GoogleRoomIdentity } from "./client-room-access";
import { isFirebaseAppNamespace } from "./public-runtime-config";

export const usesEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export const usesGuestAccess = process.env.NEXT_PUBLIC_AUTH_MODE === "guest";
export const usesAnonymousAuth = usesEmulators || usesGuestAccess;
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
/** Runtime policy configures Google access without rebuilding the image. */
export const requiresGoogleAccount = () => (typeof window !== "undefined" && window.__VIBEESTIMATE_FIREBASE__?.authMode === "google") || (!usesEmulators && process.env.NEXT_PUBLIC_AUTH_MODE === "google");
export const allowsAnonymousSessions = () => !requiresGoogleAccount() && usesAnonymousAuth;
export const isGoogleAuthEnabled = () => requiresGoogleAccount() || googleAuthEnabled;
export const hasGoogleAccess = (user: Pick<User, "providerData"> | null | undefined): boolean => Boolean(user?.providerData.some(provider => provider.providerId === "google.com"));
export const canUseSession = (user: User | null): user is User => Boolean(user && (!requiresGoogleAccount() || hasGoogleAccess(user)));
export const sessionAccessMessage = (user: User | null) => requiresGoogleAccount()
  ? user ? "Connect Google to reopen your saved work. Your existing projects and room access will stay with this account." : "Continue with Google to open your private workspace."
  : "Reconnect to open your private saved work.";
export type SessionIdentity = "designer" | ClientRoomIdentity;
const pendingSessions = new Map<SessionIdentity, Promise<UserCredential>>();
const pendingReadiness = new Map<SessionIdentity, Promise<Auth>>();
const sessionFailure = () => new Error("Your saved workspace could not reconnect. Keep this browser session and retry. Your existing access has been preserved.");

/** A providerless account still needs a recovery provider linked. */
export const isGuestUser = (user: Pick<User, "isAnonymous" | "providerData"> | null | undefined): boolean => Boolean(user && (user.isAnonymous || user.providerData.length === 0));

function identityAppName(identity: SessionIdentity) {
  return identity === "designer" ? "[DEFAULT]" : identity === "client" ? "vibeestimate-client" : `vibeestimate-${recoveryIdentity(identity.slice("client-google:".length)).replace(":", "-")}`;
}

export function clientAuth(identity: SessionIdentity = "designer") {
  if (typeof window === "undefined") throw new Error("Sign-in is available in the browser.");
  const publicConfig = window.__VIBEESTIMATE_FIREBASE__;
  if (publicConfig?.authMode !== undefined && publicConfig.authMode !== "google") throw new Error("Sign-in is temporarily unavailable. Keep this page open and try again shortly.");
  const projectId = publicConfig?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = publicConfig?.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Sign-in is temporarily unavailable. Keep this page open and try again shortly.");
  if (usesEmulators && (!projectId.startsWith("demo-") || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))) throw new Error("Local sign-in requires a demo project on localhost.");
  const identityName = identityAppName(identity);
  const namespace = publicConfig?.appNamespace;
  if (namespace !== undefined && !isFirebaseAppNamespace(namespace)) throw sessionFailure();
  // Keep this configured namespace stable to retain persisted browser sessions.
  const appName = namespace ? `vibeestimate-${namespace}-${identity === "designer" ? "designer" : identityName}` : identityName;
  const existingApp = getApps().find((candidate) => candidate.name === appName);
  if (existingApp && (existingApp.options.projectId !== projectId || existingApp.options.apiKey !== apiKey)) throw sessionFailure();
  const app = existingApp ?? initializeApp({ projectId, apiKey, authDomain: publicConfig?.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, appId: publicConfig?.appId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID }, appName);
  const auth = getAuth(app);
  if (usesEmulators && !auth.emulatorConfig) {
    const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(emulatorUrl).hostname)) throw new Error("The sign-in emulator must run locally.");
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

/** Restore this identity before subscribing or starting a new session. */
export async function ensureSessionReady(identity: SessionIdentity = "designer"): Promise<Auth> {
  const existing = pendingReadiness.get(identity);
  if (existing) return existing;
  const pending = (async () => {
    const auth = clientAuth(identity);
    try { await auth.authStateReady(); } catch { throw sessionFailure(); }
    return auth;
  })();
  pendingReadiness.set(identity, pending);
  try { return await pending; }
  finally { if (pendingReadiness.get(identity) === pending) pendingReadiness.delete(identity); }
}

/** Explicit sign-out clears only the selected logical identity. */
export async function signOutSession(identity: SessionIdentity = "designer") {
  await Promise.allSettled([pendingSessions.get(identity), pendingReadiness.get(identity)]);
  try { await signOut(await ensureSessionReady(identity)); }
  catch { throw new Error("Sign out could not finish. Retry before leaving this browser."); }
}

export async function startSession(identity: SessionIdentity = "designer") {
  if (identity !== "designer" && identity !== "client") throw new Error("Use Continue with Google to reopen this room. Your saved access is unchanged.");
  const existing = pendingSessions.get(identity);
  if (existing) return existing;
  const pending = (async () => {
    const auth = await ensureSessionReady(identity);
    if (auth.currentUser) {
      if (requiresGoogleAccount() && !hasGoogleAccess(auth.currentUser)) return saveAccessWithGoogle(identity);
      return { user: auth.currentUser, providerId: null, operationType: "signIn" as const };
    }
    await setPersistence(auth, browserLocalPersistence);
    try {
      return await (allowsAnonymousSessions() ? signInAnonymously(auth) : signInWithPopup(auth, new GoogleAuthProvider()));
    } catch (cause) {
      if (allowsAnonymousSessions()) throw cause;
      throw new Error("Google sign-in could not finish. Your saved work and any text on this page are unchanged. Try again when you’re ready.");
    }
  })();
  pendingSessions.set(identity, pending);
  try { return await pending; }
  finally { if (pendingSessions.get(identity) === pending) pendingSessions.delete(identity); }
}

export async function openGoogleClientRoom(identity: GoogleRoomIdentity) {
  if (!isGoogleAuthEnabled()) throw new Error("Google account access is not available here yet. Your guest rooms are unchanged.");
  const auth = await ensureSessionReady(identity);
  if (requiresGoogleAccount() && auth.currentUser && !hasGoogleAccess(auth.currentUser)) return saveAccessWithGoogle(identity);
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
      throw new Error(requiresGoogleAccount() ? "Google connection was cancelled. Your saved room access is unchanged; try again when you’re ready." : "Google connection was cancelled. Your guest rooms are unchanged; try again when you’re ready.");
    }
    throw new Error(requiresGoogleAccount() ? "Google could not reconnect to this room. Your saved room access is unchanged. Try again when your connection is ready." : "Google could not reconnect to this room. Your guest rooms are unchanged. Try again when your connection is ready.");
  }
}

export async function saveAccessWithGoogle(identity: SessionIdentity = "designer") {
  if (!isGoogleAuthEnabled()) throw new Error("Google account access is not available here yet. Your saved access is unchanged.");
  const auth = await ensureSessionReady(identity);
  const currentUser = auth.currentUser;
  if (!currentUser || hasGoogleAccess(currentUser)) throw new Error("Your saved session has changed. Reopen your workspace and try again.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Linking keeps the verified UID and its owned projects. Never sign out or
    // switch to a different account when this Google account is already in use.
    const credential = await linkWithPopup(currentUser, provider);
    if (credential.user.uid !== currentUser.uid || auth.currentUser?.uid !== currentUser.uid || !hasGoogleAccess(credential.user)) throw sessionFailure();
    await credential.user.getIdToken(true);
    return credential;
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
    if (["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"].includes(code)) {
      throw new Error("That Google account already has a workspace. Your saved work is still here. Choose another Google account to connect this workspace. Keep this browser session until access is recovered.");
    }
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(code)) {
      throw new Error("Google connection was cancelled. Your saved workspace is still here; connect Google when you’re ready.");
    }
    throw new Error("Google access could not be saved. Your saved workspace is still here. Try again when you’re ready.");
  }
}

export async function openGoogleWorkspace() {
  if (!isGoogleAuthEnabled()) throw new Error("Google account access is not available here yet. Your saved access is unchanged.");
  const auth = await ensureSessionReady();
  if (requiresGoogleAccount() && auth.currentUser && !hasGoogleAccess(auth.currentUser)) return saveAccessWithGoogle();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Called only by the explicit returning-account action on an empty home.
    // The caller blocks this action when there is guest work or an edited form.
    return await signInWithPopup(auth, provider);
  } catch {
    throw new Error(requiresGoogleAccount() ? "Your Google workspace could not be opened. Your saved work is unchanged. Try Google sign-in again when your connection is ready." : "Your Google workspace could not be opened. Your current guest session is still here. Try again, or keep working as a guest.");
  }
}
