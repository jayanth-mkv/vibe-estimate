import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, setPersistence, signInAnonymously, signInWithPopup } from "firebase/auth";

export const usesEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

export function clientAuth() {
  if (typeof window === "undefined") throw new Error("Sign-in is available in the browser.");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("Sign-in is not configured. Add the frontend environment settings and restart the app.");
  if (usesEmulators && (!projectId.startsWith("demo-") || !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname))) throw new Error("Local sign-in requires a demo project on localhost.");
  const app = getApps().length ? getApp() : initializeApp({ projectId, apiKey, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID });
  const auth = getAuth(app);
  if (usesEmulators && !auth.emulatorConfig) {
    const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(emulatorUrl).hostname)) throw new Error("The sign-in emulator must run locally.");
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  return auth;
}

export async function startSession() {
  const auth = clientAuth();
  await setPersistence(auth, browserLocalPersistence);
  return usesEmulators ? signInAnonymously(auth) : signInWithPopup(auth, new GoogleAuthProvider());
}
