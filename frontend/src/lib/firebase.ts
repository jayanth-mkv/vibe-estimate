import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, linkWithPopup, setPersistence, signInAnonymously, signInWithPopup, type UserCredential } from "firebase/auth";
import { recoveryIdentity, type ClientRoomIdentity, type GoogleRoomIdentity } from "./client-room-access";

export const usesEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export const usesGuestAccess = process.env.NEXT_PUBLIC_AUTH_MODE === "guest";
export const usesAnonymousAuth = usesEmulators || usesGuestAccess;
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
export type SessionIdentity = "designer" | ClientRoomIdentity;
const pendingSessions = new Map<SessionIdentity, Promise<UserCredential>>();

export function clientAuth(identity: SessionIdentity = "designer") {
  if (typeof window === "undefined") throw new Error("Sign-in is available in the browser.");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Sign-in is not configured. Add the frontend environment settings and restart the app.");
  if (usesEmulators && (!projectId.startsWith("demo-") || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))) throw new Error("Local sign-in requires a demo project on localhost.");
  const appName = identity === "designer" ? "[DEFAULT]" : identity === "client" ? "vibeestimate-client" : `vibeestimate-${recoveryIdentity(identity.slice("client-google:".length)).replace(":", "-")}`;
  const app = getApps().find((candidate) => candidate.name === appName) ?? initializeApp({ projectId, apiKey, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID }, appName);
  const auth = getAuth(app);
  if (usesEmulators && !auth.emulatorConfig) {
    const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(emulatorUrl).hostname)) throw new Error("The sign-in emulator must run locally.");
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

export async function startSession(identity: SessionIdentity = "designer") {
  if (identity !== "designer" && identity !== "client") throw new Error("Use Continue with Google to reopen this room. Your guest access is unchanged.");
  const existing = pendingSessions.get(identity);
  if (existing) return existing;
  const auth = clientAuth(identity);
  const pending = (async () => {
    await setPersistence(auth, browserLocalPersistence);
    return usesAnonymousAuth ? signInAnonymously(auth) : signInWithPopup(auth, new GoogleAuthProvider());
  })();
  pendingSessions.set(identity, pending);
  try { return await pending; }
  finally { if (pendingSessions.get(identity) === pending) pendingSessions.delete(identity); }
}

export async function openGoogleClientRoom(identity: GoogleRoomIdentity) {
  if (!googleAuthEnabled) throw new Error("Google account access is not available here yet. Your guest rooms are unchanged.");
  const auth = clientAuth(identity);
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
  const auth = clientAuth(identity);
  const currentUser = auth.currentUser;
  if (!currentUser?.isAnonymous) throw new Error("Your guest session is no longer active. Reopen your workspace and try again.");
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
    return await signInWithPopup(clientAuth(), provider);
  } catch {
    throw new Error("Your Google workspace could not be opened. Your current guest session is still here. Try again, or keep working as a guest.");
  }
}
