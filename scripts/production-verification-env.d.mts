import type { PlatformPath } from "node:path";

export function productionVerificationEnvironment(
  overrides: Record<string, string>,
  inherited?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

export function isExternalEvidencePath(
  root: string,
  candidate: string,
  pathImplementation?: PlatformPath,
): boolean;
