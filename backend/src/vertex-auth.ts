import { execFile } from "node:child_process";
import { AppError } from "./errors.js";
import { validateNamedGcloudTarget, validateVertexTarget, type LocalVertexTarget, type NamedGcloudTarget } from "./vertex-config.js";

type CommandOptions = {
  env: NodeJS.ProcessEnv;
  shell: false;
  windowsHide: true;
  timeout: number;
  maxBuffer: number;
};
export type CommandRunner = (file: string, args: string[], options: CommandOptions) => Promise<string>;
export type GcloudExecutor = (args: string[], env: NodeJS.ProcessEnv) => Promise<string>;

type AuthStage = "target" | "profile_describe" | "profile_validate" | "token_acquire" | "token_validate";
type AuthFailureCategory = "timeout" | "executable_unavailable" | "command_failed" | "invalid_target" | "invalid_profile" | "invalid_token";
export class NamedProfileAuthError extends AppError {
  constructor(public readonly authDiagnostic: { authStage: AuthStage; authFailureCategory: AuthFailureCategory; authElapsedMs: number }) {
    super(502, "AI_AUTH_UNAVAILABLE", "The configured local AI sign-in could not be verified. Your saved project is unchanged. Check the local configuration and retry.");
  }
}
const authUnavailable = (stage: AuthStage = "target", category: AuthFailureCategory = "invalid_target", elapsedMs = 0) => new NamedProfileAuthError({ authStage: stage, authFailureCategory: category, authElapsedMs: elapsedMs });
class AuthCommandError extends Error {
  constructor(readonly category: "timeout" | "executable_unavailable" | "command_failed") { super("The local authentication command failed."); }
}
function commandFailure(error: unknown): AuthCommandError {
  if (error instanceof AuthCommandError) return error;
  const value = error && typeof error === "object" ? error as { code?: unknown; killed?: unknown; signal?: unknown } : {};
  if (value.code === "ETIMEDOUT" || value.killed === true && value.signal === "SIGTERM") return new AuthCommandError("timeout");
  if (value.code === "ENOENT" || value.code === "EACCES") return new AuthCommandError("executable_unavailable");
  return new AuthCommandError("command_failed");
}

// No operator value is interpolated into this script. Windows .cmd arguments
// come from structured environment data and contain only validated identifiers.
const powershellBridge = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $gcloudArguments = ConvertFrom-Json -InputObject $env:VIBEESTIMATE_GCLOUD_ARGS
  & gcloud @gcloudArguments 2>$null
  if ($LASTEXITCODE -ne 0) { exit 1 }
} catch { exit 1 }
`;

const runCommand: CommandRunner = (file, args, options) => new Promise((resolve, reject) => {
  const child = execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout) => {
    // Raw stderr/errors can contain credentials or private configuration paths.
    if (error) reject(commandFailure(error));
    else resolve(stdout);
  });
  child.stdin?.end();
});

export function createGcloudExecutor(command: CommandRunner = runCommand, platform: NodeJS.Platform = process.platform): GcloudExecutor {
  return async (args, env) => {
    const options: CommandOptions = { env, shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 };
    try {
      if (platform !== "win32") return await command("gcloud", args, options);
      return await command("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", powershellBridge], {
        ...options, env: { ...env, VIBEESTIMATE_GCLOUD_ARGS: JSON.stringify(args) }
      });
    } catch (error) { throw commandFailure(error); }
  };
}

function assertNoCredentialOverrides(env: NodeJS.ProcessEnv) {
  const forbidden = new Set([
    "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CREDENTIALS", "GOOGLE_CLOUD_KEYFILE_JSON", "GCLOUD_KEYFILE_JSON",
    "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_API_KEY", "GEMINI_API_KEY"
  ]);
  if (Object.keys(env).some(key => (key.toUpperCase().startsWith("CLOUDSDK_AUTH_") || forbidden.has(key.toUpperCase())) && Boolean(env[key]?.trim()))) throw authUnavailable();
}

export async function obtainNamedProfileToken(
  input: NamedGcloudTarget,
  execute: GcloudExecutor = createGcloudExecutor(),
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  let stage: AuthStage = "target";
  let startedAt = Date.now();
  const enter = (next: AuthStage) => { stage = next; startedAt = Date.now(); };
  try {
    const target = validateNamedGcloudTarget(input);
    assertNoCredentialOverrides(env);
    const controlled = new Set(["CLOUDSDK_CONFIG", "CLOUDSDK_ACTIVE_CONFIG_NAME", "CLOUDSDK_CORE_ACCOUNT", "CLOUDSDK_CORE_PROJECT", "CLOUDSDK_CORE_DISABLE_PROMPTS", "CLOUDSDK_CORE_LOG_HTTP", "CLOUDSDK_CORE_VERBOSITY"]);
    const childEnv: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !controlled.has(key.toUpperCase())));
    Object.assign(childEnv, { CLOUDSDK_CONFIG: target.gcloudConfigDir, CLOUDSDK_CORE_DISABLE_PROMPTS: "1", CLOUDSDK_CORE_LOG_HTTP: "false", CLOUDSDK_CORE_VERBOSITY: "error" });
    const explicitTarget = ["--configuration=" + target.gcloudConfiguration, "--account=" + target.gcloudAccount, "--project=" + target.projectId, "--quiet"];
    enter("profile_describe");
    const output = await execute([...explicitTarget, "config", "configurations", "describe", target.gcloudConfiguration, "--format=json"], childEnv);
    enter("profile_validate");
    const description: unknown = JSON.parse(output);
    if (!description || typeof description !== "object") throw authUnavailable();
    const profile = description as { name?: unknown; properties?: { core?: { account?: unknown; project?: unknown }; auth?: Record<string, unknown> } };
    if (profile.name !== target.gcloudConfiguration || profile.properties?.core?.account !== target.gcloudAccount || profile.properties?.core?.project !== target.projectId) throw authUnavailable();
    const authProperties = profile.properties?.auth ?? {};
    if (Object.entries(authProperties).some(([key, value]) => value !== null && value !== undefined && String(value).trim() &&
      (/impersonat|credential|access_token|login_config/i.test(key) || key === "disable_credentials" && String(value) !== "false"))) throw authUnavailable();
    enter("token_acquire");
    const tokenOutput = await execute([...explicitTarget, "auth", "print-access-token"], childEnv);
    enter("token_validate");
    const accessToken = tokenOutput.trim();
    if (!accessToken || accessToken.length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken)) throw authUnavailable();
    return accessToken;
  } catch (error) {
    // Tokens remain in memory and never become error causes, logs, or CLI args.
    const category = error instanceof AuthCommandError ? error.category : stage === "target" ? "invalid_target" : stage === "profile_validate" ? "invalid_profile" : stage === "token_validate" ? "invalid_token" : "command_failed";
    throw authUnavailable(stage, category, Math.max(0, Date.now() - startedAt));
  }
}

export async function obtainLocalVertexToken(input: LocalVertexTarget, execute: GcloudExecutor = createGcloudExecutor(), env: NodeJS.ProcessEnv = process.env): Promise<string> {
  try { return await obtainNamedProfileToken(validateVertexTarget(input), execute, env); }
  catch (error) { throw error instanceof NamedProfileAuthError ? error : authUnavailable(); }
}
