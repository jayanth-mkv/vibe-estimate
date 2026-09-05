import { execFile } from "node:child_process";
import { AppError } from "./errors.js";
import { validateVertexTarget, type LocalVertexTarget } from "./vertex-config.js";

type CommandOptions = {
  env: NodeJS.ProcessEnv;
  shell: false;
  windowsHide: true;
  timeout: number;
  maxBuffer: number;
};
export type CommandRunner = (file: string, args: string[], options: CommandOptions) => Promise<string>;
export type GcloudExecutor = (args: string[], env: NodeJS.ProcessEnv) => Promise<string>;

const authUnavailable = () => new AppError(502, "AI_AUTH_UNAVAILABLE", "The configured local AI sign-in could not be verified. Your saved project is unchanged. Check the local configuration and retry.");

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
    if (error) reject(authUnavailable());
    else resolve(stdout);
  });
  child.stdin?.end();
});

export function createGcloudExecutor(command: CommandRunner = runCommand, platform: NodeJS.Platform = process.platform): GcloudExecutor {
  return (args, env) => {
    const options: CommandOptions = { env, shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 };
    if (platform !== "win32") return command("gcloud", args, options);
    return command("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", powershellBridge], {
      ...options, env: { ...env, VIBEESTIMATE_GCLOUD_ARGS: JSON.stringify(args) }
    });
  };
}

function assertNoCredentialOverrides(env: NodeJS.ProcessEnv) {
  const forbidden = new Set([
    "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CREDENTIALS", "GOOGLE_CLOUD_KEYFILE_JSON", "GCLOUD_KEYFILE_JSON",
    "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_API_KEY", "GEMINI_API_KEY"
  ]);
  if (Object.keys(env).some(key => (key.toUpperCase().startsWith("CLOUDSDK_AUTH_") || forbidden.has(key.toUpperCase())) && Boolean(env[key]?.trim()))) throw authUnavailable();
}

export async function obtainLocalVertexToken(
  input: LocalVertexTarget,
  execute: GcloudExecutor = createGcloudExecutor(),
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  try {
    const target = validateVertexTarget(input);
    assertNoCredentialOverrides(env);
    const controlled = new Set(["CLOUDSDK_CONFIG", "CLOUDSDK_ACTIVE_CONFIG_NAME", "CLOUDSDK_CORE_ACCOUNT", "CLOUDSDK_CORE_PROJECT", "CLOUDSDK_CORE_DISABLE_PROMPTS", "CLOUDSDK_CORE_LOG_HTTP", "CLOUDSDK_CORE_VERBOSITY"]);
    const childEnv: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !controlled.has(key.toUpperCase())));
    Object.assign(childEnv, { CLOUDSDK_CONFIG: target.gcloudConfigDir, CLOUDSDK_CORE_DISABLE_PROMPTS: "1", CLOUDSDK_CORE_LOG_HTTP: "false", CLOUDSDK_CORE_VERBOSITY: "error" });
    const explicitTarget = ["--configuration=" + target.gcloudConfiguration, "--account=" + target.gcloudAccount, "--project=" + target.projectId, "--quiet"];
    const description: unknown = JSON.parse(await execute([...explicitTarget, "config", "configurations", "describe", target.gcloudConfiguration, "--format=json"], childEnv));
    if (!description || typeof description !== "object") throw authUnavailable();
    const profile = description as { name?: unknown; properties?: { core?: { account?: unknown; project?: unknown }; auth?: Record<string, unknown> } };
    if (profile.name !== target.gcloudConfiguration || profile.properties?.core?.account !== target.gcloudAccount || profile.properties?.core?.project !== target.projectId) throw authUnavailable();
    const authProperties = profile.properties?.auth ?? {};
    if (Object.entries(authProperties).some(([key, value]) => value !== null && value !== undefined && String(value).trim() &&
      (/impersonat|credential|access_token|login_config/i.test(key) || key === "disable_credentials" && String(value) !== "false"))) throw authUnavailable();
    const accessToken = (await execute([...explicitTarget, "auth", "print-access-token"], childEnv)).trim();
    if (!accessToken || accessToken.length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken)) throw authUnavailable();
    return accessToken;
  } catch {
    // Tokens remain in memory and never become error causes, logs, or CLI args.
    throw authUnavailable();
  }
}
