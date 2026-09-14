type FirebaseSdkFields = { projectId: string; apiKey: string; authDomain: string; appId: string };
export type PublicFirebaseConfig = FirebaseSdkFields & { appNamespace?: string; authMode?: "google" };
declare global { interface Window { __VIBEESTIMATE_FIREBASE__?: PublicFirebaseConfig } }
export const isFirebaseAppNamespace = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value);

function publicFields(value: unknown): FirebaseSdkFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Public sign-in configuration is invalid.");
  const data = value as Record<string, unknown>;
  return Object.fromEntries(["projectId", "apiKey", "authDomain", "appId"].map(key => {
    if (typeof data[key] !== "string" || !data[key] || data[key].length > 300) throw new Error("Public sign-in configuration is invalid.");
    return [key, data[key]];
  })) as FirebaseSdkFields;
}

const safeJson = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** Only these browser SDK fields may enter the HTML. Never serialize process.env. */
export function firebaseConfigScript(raw: string | undefined): string {
  if (!raw) return "";
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new Error("Public sign-in configuration is invalid."); }
  const config: PublicFirebaseConfig = publicFields(data);
  if (data.appNamespace !== undefined) {
    if (!isFirebaseAppNamespace(data.appNamespace)) throw new Error("Public sign-in configuration is invalid.");
    config.appNamespace = data.appNamespace;
  }
  if (data.authMode !== undefined) {
    if (data.authMode !== "google") throw new Error("Public sign-in configuration is invalid.");
    config.authMode = "google";
  }
  return `window.__VIBEESTIMATE_FIREBASE__=${safeJson(config)};`;
}
