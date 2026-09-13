export type FirebaseAuthMode = "google";
export type VerifiedFirebaseIdentity = {
  uid: string;
  firebase?: { identities?: Record<string, unknown>; sign_in_provider?: string; tenant?: string };
  tenant_id?: unknown;
};

/** Keep the browser and API policy in the same pinned Firebase configuration. */
export function readFirebaseAuthMode(raw: string | undefined, targetProjectId: string): FirebaseAuthMode | undefined {
  if (!raw) return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid Firebase runtime configuration."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Firebase runtime configuration.");
  const value = parsed as Record<string, unknown>;
  if (value.authMode === undefined) return;
  if (value.authMode !== "google" || value.projectId !== targetProjectId) {
    throw new Error("Firebase authMode must select Google in the configured Firebase project.");
  }
  return "google";
}

/** Check only a token already verified by the configured Firebase Admin SDK.
 * Migrated accounts sign in with a custom token, so sign_in_provider alone
 * cannot establish whether the same account has a Google identity attached.
 */
export function hasGoogleIdentity(identity: VerifiedFirebaseIdentity): boolean {
  const google = identity.firebase?.identities?.["google.com"];
  return Array.isArray(google) && google.length > 0 && google.every(value => typeof value === "string" && value.length > 0);
}
