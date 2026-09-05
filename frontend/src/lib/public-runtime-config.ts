export type PublicFirebaseConfig = { projectId: string; apiKey: string; authDomain: string; appId: string };
declare global { interface Window { __VIBEESTIMATE_FIREBASE__?: PublicFirebaseConfig } }

/** Only these browser SDK fields may enter the HTML. Never serialize process.env. */
export function firebaseConfigScript(raw: string | undefined): string {
  if (!raw) return "";
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new Error("Public sign-in configuration is invalid."); }
  if (!data || typeof data !== "object") throw new Error("Public sign-in configuration is invalid.");
  const config = Object.fromEntries(["projectId", "apiKey", "authDomain", "appId"].map(key => {
    if (typeof data[key] !== "string" || !data[key] || data[key].length > 300) throw new Error("Public sign-in configuration is invalid.");
    return [key, data[key]];
  }));
  return `window.__VIBEESTIMATE_FIREBASE__=${JSON.stringify(config).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)};`;
}
