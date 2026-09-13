import { z } from "zod";
import { AppError } from "./errors.js";

const projectId = z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
const realProjectId = projectId.refine(value => !value.startsWith("demo-"));
const uid = z.string().min(1).max(128).refine(value => !value.includes("/"));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export type FirebaseMigrationConfig = { sourceProjectId: string; snapshotSha256: string };

/** The hash is the immutable manifest.json SHA256 (runner output manifestSha256). */
export function readFirebaseMigration(raw: string | undefined, targetProjectId: string, appEnv: string): FirebaseMigrationConfig | undefined {
  if (!raw) return;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Invalid Firebase runtime configuration."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Firebase runtime configuration.");
  const config = value as Record<string, unknown>;
  if (config.legacy === undefined && config.migrationSnapshotSha256 === undefined) return;
  const checked = z.object({
    projectId: realProjectId, appNamespace: z.literal("migrated"), migrationSnapshotSha256: hash,
    legacy: z.object({ projectId: realProjectId }),
  }).safeParse(config);
  if (appEnv !== "production" || !checked.success || checked.data.projectId !== targetProjectId || checked.data.legacy.projectId === targetProjectId) {
    throw new Error("Firebase session migration requires distinct verified production projects and a frozen snapshot.");
  }
  return { sourceProjectId: checked.data.legacy.projectId, snapshotSha256: checked.data.migrationSnapshotSha256 };
}

export const migrationUserSchema = z.object({ sourceProjectId: projectId, sourceUid: uid, targetUid: uid, snapshotSha256: hash }).strict();
export interface FirebaseSessionMigration {
  exchange(token: string): Promise<{ customToken: string; uid: string }>;
}
export type MigrationDependencies = {
  verifySource: (token: string) => Promise<{ uid: string; firebase?: { tenant?: string }; tenant_id?: string }>;
  mapping: (uid: string) => Promise<unknown>;
  targetUser: (uid: string) => Promise<{ uid: string; disabled: boolean }>;
  createToken: (uid: string) => Promise<string>;
  now?: () => number;
};

/** A non-revoked source identity in the imported snapshot may transfer only its own UID. */
export function createSessionMigration(config: FirebaseMigrationConfig, dependencies: MigrationDependencies): FirebaseSessionMigration {
  const attempts = new Map<string, { until: number; count: number }>();
  return {
    async exchange(token) {
      let source: Awaited<ReturnType<MigrationDependencies["verifySource"]>>;
      try { source = await dependencies.verifySource(token); }
      catch (cause) {
        const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
        if (["auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found", "auth/argument-error", "auth/invalid-id-token"].includes(String(code))) {
          throw new AppError(401, "MIGRATION_AUTH_REQUIRED", "Your existing session could not be verified. Keep this browser open and retry.");
        }
        throw new AppError(503, "MIGRATION_UNAVAILABLE", "Your saved access could not be transferred right now. Keep this browser open and retry shortly.");
      }
      const sourceUid = uid.safeParse(source.uid);
      if (!sourceUid.success || source.firebase?.tenant !== undefined || source.tenant_id !== undefined) throw new AppError(401, "MIGRATION_AUTH_REQUIRED", "Your existing session could not be verified.");
      const mapped = migrationUserSchema.safeParse(await dependencies.mapping(sourceUid.data));
      if (!mapped.success || mapped.data.sourceProjectId !== config.sourceProjectId || mapped.data.sourceUid !== source.uid
        || mapped.data.targetUid !== source.uid || mapped.data.snapshotSha256 !== config.snapshotSha256) {
        throw new AppError(403, "MIGRATION_NOT_READY", "Your saved access is not ready to transfer. Keep this browser open and try again later.");
      }
      // The API sits behind the same local Next gateway for every caller. Bind
      // this limit to an allowlisted root UID, never its shared loopback address.
      // Unknown source accounts cannot fill the bounded imported-user limit map.
      const now = dependencies.now?.() ?? Date.now();
      for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key);
      const attempt = attempts.get(source.uid) ?? { until: now + 60000, count: 0 };
      if (attempt.count >= 30 || (!attempts.has(source.uid) && attempts.size >= 1000)) {
        throw new AppError(429, "RATE_LIMIT", "Please wait a minute before retrying your saved access.");
      }
      attempt.count++;
      attempts.set(source.uid, attempt);
      const target = await dependencies.targetUser(source.uid);
      if (target.uid !== source.uid || target.disabled) throw new AppError(403, "MIGRATION_NOT_READY", "Your saved access could not be transferred.");
      return { uid: source.uid, customToken: await dependencies.createToken(source.uid) };
    },
  };
}
