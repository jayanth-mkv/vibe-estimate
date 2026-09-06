import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config.js";
import { createGcloudExecutor, obtainLocalVertexToken, type CommandRunner } from "../src/vertex-auth.js";
import type { LocalVertexTarget } from "../src/vertex-config.js";

const target: LocalVertexTarget = {
  projectId: "synthetic-vertex-project", location: "global", gcloudConfiguration: "synthetic-owner",
  gcloudAccount: "owner@example.test", gcloudConfigDir: path.join(os.tmpdir(), "synthetic-gcloud-config")
};
const env = {
  APP_ENV: "local", AI_PROVIDER: "gemini", GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-test-model",
  VERTEX_PROJECT_ID: target.projectId, VERTEX_LOCATION: target.location,
  VERTEX_GCLOUD_CONFIGURATION: target.gcloudConfiguration, VERTEX_GCLOUD_ACCOUNT: target.gcloudAccount, VERTEX_GCLOUD_CONFIG_DIR: target.gcloudConfigDir
};
const profile = () => ({ name: target.gcloudConfiguration, properties: { core: { account: target.gcloudAccount, project: target.projectId }, auth: {} } });
const fakeToken = "synthetic-test-token-never-use";

describe("explicit local Vertex configuration", () => {
  it("keeps Firebase on demo emulators while selecting a separate Vertex project", () => {
    expect(readConfig(env)).toMatchObject({ appEnv: "local", geminiTransport: "vertex", vertexProjectId: target.projectId, vertexLocation: "global", projectId: "demo-vibeestimate", authEmulatorHost: "127.0.0.1:9099", firestoreEmulatorHost: "127.0.0.1:8085", geminiApiKey: undefined });
    expect(readConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "synthetic-key", GEMINI_MODEL: "test-model" }).geminiTransport).toBe("developer");
  });
  it.each(["VERTEX_PROJECT_ID", "VERTEX_LOCATION", "VERTEX_GCLOUD_CONFIGURATION", "VERTEX_GCLOUD_ACCOUNT", "VERTEX_GCLOUD_CONFIG_DIR", "GEMINI_MODEL"])("rejects missing %s instead of guessing a default", key => {
    expect(() => readConfig({ ...env, [key]: "" })).toThrow();
  });
  it.each([
    { GEMINI_API_KEY: "synthetic-key" }, { AI_PROVIDER: "fixture" }, { GEMINI_TRANSPORT: "unexpected" },
    { VERTEX_GCLOUD_ACCOUNT: "service@project.iam.gserviceaccount.com" },
    { VERTEX_GCLOUD_ACCOUNT: "owner%!&@example.test" }, { VERTEX_GCLOUD_CONFIGURATION: "profile & command" },
    { VERTEX_PROJECT_ID: "project;command" }, { VERTEX_GCLOUD_CONFIG_DIR: "relative-directory" },
    { APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "synthetic-production-project", FRONTEND_ORIGIN: "https://example.test" }
  ])("rejects unsafe or unsupported transport settings", input => {
    expect(() => readConfig({ ...env, ...input })).toThrow();
  });
});

describe("user-token acquisition with a bound gcloud target", () => {
  it("checks the named configuration before obtaining a token without mutating the caller environment", async () => {
    const execute = vi.fn().mockResolvedValueOnce(JSON.stringify(profile())).mockResolvedValueOnce(fakeToken + "\n");
    const inherited = { CloudSdk_Config: "unrelated-config", cloudsdk_core_account: "other@example.test", CLOUDSDK_CORE_PROJECT: "other-project", cloudsdk_core_log_http: "true", CLOUDSDK_CORE_VERBOSITY: "debug", KEEP_THIS: "unchanged" };
    const original = { ...inherited };
    await expect(obtainLocalVertexToken(target, execute, inherited)).resolves.toBe(fakeToken);
    expect(inherited).toEqual(original);
    expect(execute).toHaveBeenCalledTimes(2);
    for (const [args, childEnv] of execute.mock.calls) {
      expect(args).toEqual(expect.arrayContaining(["--configuration=synthetic-owner", "--account=owner@example.test", "--project=synthetic-vertex-project", "--quiet"]));
      expect(JSON.stringify(args)).not.toContain(fakeToken);
      expect(childEnv).toMatchObject({ CLOUDSDK_CONFIG: target.gcloudConfigDir, CLOUDSDK_CORE_LOG_HTTP: "false", CLOUDSDK_CORE_VERBOSITY: "error", KEEP_THIS: "unchanged" });
      expect(Object.keys(childEnv)).not.toContain("CloudSdk_Config");
      expect(Object.keys(childEnv)).not.toContain("cloudsdk_core_account");
      expect(Object.keys(childEnv)).not.toContain("cloudsdk_core_log_http");
    }
    expect(execute.mock.calls[0]?.[0]).toContain("describe");
    expect(execute.mock.calls[1]?.[0]).toEqual(expect.arrayContaining(["auth", "print-access-token"]));
  });
  it.each(["GOOGLE_APPLICATION_CREDENTIALS", "google_application_credentials", "CLOUDSDK_AUTH_ACCESS_TOKEN", "cloudsdk_auth_credential_file_override", "CloudSdk_Auth_Impersonate_Service_Account", "GOOGLE_API_KEY", "GEMINI_API_KEY"])("rejects inherited credential override %s before invoking gcloud", async key => {
    const execute = vi.fn();
    await expect(obtainLocalVertexToken(target, execute, { [key]: fakeToken })).rejects.toMatchObject({ code: "AI_AUTH_UNAVAILABLE" });
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(["account", "project", "name"])("rejects a mismatched configured %s before token acquisition", async key => {
    const described = profile();
    if (key === "name") described.name = "other-profile";
    else described.properties.core[key as "account" | "project"] = "other-value";
    const execute = vi.fn().mockResolvedValue(JSON.stringify(described));
    await expect(obtainLocalVertexToken(target, execute, {})).rejects.toMatchObject({ code: "AI_AUTH_UNAVAILABLE" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each(["impersonate_service_account", "credential_file_override", "access_token_file", "disable_credentials"])("rejects configured %s before obtaining a token", async property => {
    const described = profile();
    described.properties.auth = { [property]: "unsafe-value" };
    const execute = vi.fn().mockResolvedValue(JSON.stringify(described));
    await expect(obtainLocalVertexToken(target, execute, {})).rejects.toMatchObject({ code: "AI_AUTH_UNAVAILABLE" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("sanitizes parser, CLI and malformed-token failures without printing output", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      for (const execute of [
        vi.fn().mockRejectedValue(new Error("raw stderr " + fakeToken)),
        vi.fn().mockResolvedValue("invalid JSON " + fakeToken),
        vi.fn().mockResolvedValueOnce(JSON.stringify(profile())).mockResolvedValue("warning\n" + fakeToken)
      ]) {
        const error = await obtainLocalVertexToken(target, execute, {}).catch(error => error);
        expect(error).toMatchObject({ code: "AI_AUTH_UNAVAILABLE" });
        expect(error.stack).not.toContain(fakeToken);
      }
      expect(errorLog).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally { errorLog.mockRestore(); log.mockRestore(); }
  });
  it("uses a fixed hidden PowerShell bridge with structured arguments, and direct shell-free gcloud elsewhere", async () => {
    const command = vi.fn<CommandRunner>().mockResolvedValue(fakeToken);
    const args = ["--account=owner@example.test", "auth", "print-access-token"];
    await createGcloudExecutor(command, "win32")(args, {});
    const [file, commandArgs, options] = command.mock.calls[0]!;
    expect(file).toBe("powershell.exe");
    expect(commandArgs).toContain("-NoProfile");
    expect(commandArgs.join(" ")).not.toContain("owner@example.test");
    expect(commandArgs.join(" ")).not.toContain(fakeToken);
    expect(JSON.parse(options.env.VIBEESTIMATE_GCLOUD_ARGS!)).toEqual(args);
    expect(options).toMatchObject({ shell: false, windowsHide: true, timeout: 30000 });
    await createGcloudExecutor(command, "linux")(args, {});
    expect(command.mock.calls[1]).toEqual(["gcloud", args, expect.objectContaining({ shell: false })]);
  });
  it.each(["profile_describe", "token_acquire"] as const)("preserves a safe %s timeout diagnostic without a subprocess retry", async stage => {
    const command = vi.fn<CommandRunner>();
    if (stage === "token_acquire") command.mockResolvedValueOnce(JSON.stringify(profile()));
    command.mockRejectedValueOnce(Object.assign(new Error("raw private stderr " + fakeToken), { killed: true, signal: "SIGTERM" }));
    const error = await obtainLocalVertexToken(target, createGcloudExecutor(command, "linux"), {}).catch(error => error);
    expect(error).toMatchObject({ code: "AI_AUTH_UNAVAILABLE", authDiagnostic: { authStage: stage, authFailureCategory: "timeout", authElapsedMs: expect.any(Number) } });
    expect(command).toHaveBeenCalledTimes(stage === "profile_describe" ? 1 : 2);
    expect(JSON.stringify(error)).not.toContain(fakeToken); expect(error.stack).not.toContain(fakeToken);
    expect(error.cause).toBeUndefined();
    for (const call of command.mock.calls) expect(call[2]).toMatchObject({ timeout: 30000, shell: false });
  });
  it("distinguishes an unavailable CLI from invalid profile and malformed token evidence", async () => {
    const command = vi.fn<CommandRunner>().mockRejectedValue(Object.assign(new Error("private executable path"), { code: "ENOENT" }));
    await expect(obtainLocalVertexToken(target, createGcloudExecutor(command, "linux"), {})).rejects.toMatchObject({ authDiagnostic: { authStage: "profile_describe", authFailureCategory: "executable_unavailable" } });
    const mismatch = vi.fn().mockResolvedValue(JSON.stringify({ ...profile(), name: "other-profile" }));
    await expect(obtainLocalVertexToken(target, mismatch, {})).rejects.toMatchObject({ authDiagnostic: { authStage: "profile_validate", authFailureCategory: "invalid_profile" } });
    const malformed = vi.fn().mockResolvedValueOnce(JSON.stringify(profile())).mockResolvedValueOnce("warning\n" + fakeToken);
    await expect(obtainLocalVertexToken(target, malformed, {})).rejects.toMatchObject({ authDiagnostic: { authStage: "token_validate", authFailureCategory: "invalid_token" } });
  });
  it.skipIf(process.platform !== "win32")("passes separate string arguments through real Windows PowerShell without invoking cloud tooling", async () => {
    // A function shadows the gcloud executable for the entire PowerShell run.
    // This catches PowerShell 5.1's nested-array behavior, which mocked spawn
    // assertions cannot detect. It performs no network or credential access.
    const fakeGcloud = String.raw`
function gcloud {
  $values = @()
  $onlyStrings = $true
  foreach ($value in $args) {
    if ($value -isnot [string]) { $onlyStrings = $false }
    $values += [string]$value
  }
  @{ count = $args.Count; onlyStrings = $onlyStrings; values = $values } | ConvertTo-Json -Compress
  $global:LASTEXITCODE = 0
}
`;
    const command: CommandRunner = (file, args, options) => new Promise((resolve, reject) => {
      const finalArgs = [...args];
      const scriptIndex = finalArgs.indexOf("-Command") + 1;
      finalArgs[scriptIndex] = fakeGcloud + finalArgs[scriptIndex];
      const child = execFile(file, finalArgs, { ...options, encoding: "utf8" }, (error, stdout) => {
        if (error) reject(new Error("The synthetic PowerShell argument regression could not run."));
        else resolve(stdout);
      });
      child.stdin?.end();
    });
    const args = ["--account=owner@example.test", "auth", "print-access-token"];
    const nativeEnv: NodeJS.ProcessEnv = {};
    for (const key of ["SystemRoot", "SYSTEMROOT", "PATH", "TEMP", "TMP"]) if (process.env[key]) nativeEnv[key] = process.env[key];
    const output = await createGcloudExecutor(command, "win32")(args, nativeEnv);
    expect(JSON.parse(output)).toEqual({ count: 3, onlyStrings: true, values: args });
  }, 15000);
});
