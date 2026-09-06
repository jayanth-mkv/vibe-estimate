import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { isExternalEvidencePath, productionVerificationEnvironment } from "../scripts/production-verification-env.mjs";

const runner = Object.freeze({
  VERIFICATION_BASE_URL: "https://verification.example.test",
  VERIFICATION_RUNTIME: "production",
  CONNECTED_FIREBASE_TEST: "1",
  CONNECTED_FIREBASE_PROJECT_ID: "authorized-test-project",
  PRODUCTION_EVIDENCE_DIR: "D:\\private\\verification",
  PLAYWRIGHT_BROWSERS_PATH: "D:\\workspace\\.cache\\playwright"
});

test("retains essential OS values with a single canonical spelling and leaves inputs unchanged", () => {
  const inherited = Object.freeze({
    Path: "alias-path", PATH: "canonical-path", pAtH: "later-alias",
    systemroot: "C:\\Windows", Temp: "C:\\temporary", HOME: "/test/home",
    NUMBER_OF_PROCESSORS: "8", UNUSED: "discarded", TMP: undefined
  });
  const env = productionVerificationEnvironment(runner, inherited);
  assert.equal(env.PATH, "canonical-path");
  assert.equal(env.SystemRoot, "C:\\Windows");
  assert.equal(env.TEMP, "C:\\temporary");
  assert.equal(env.HOME, "/test/home");
  assert.equal(env.NUMBER_OF_PROCESSORS, "8");
  assert.equal(Object.keys(env).filter(key => key.toUpperCase() === "PATH").length, 1);
  assert.equal("UNUSED" in env, false);
  assert.equal("TMP" in env, false);
  env.PATH = "changed-result";
  assert.equal(inherited.PATH, "canonical-path");
  assert.deepEqual(Object.keys(runner), [
    "VERIFICATION_BASE_URL", "VERIFICATION_RUNTIME", "CONNECTED_FIREBASE_TEST",
    "CONNECTED_FIREBASE_PROJECT_ID", "PRODUCTION_EVIDENCE_DIR", "PLAYWRIGHT_BROWSERS_PATH"
  ]);
});

test("drops inherited debug capture, credential and runner-setting aliases", () => {
  const inherited = {
    DEBUG: "pw:*", dEbUg: "pw:api", PWDEBUG: "1", pWdEbUg: "console",
    NODE_DEBUG: "http,https", node_debug_native: "*", DEBUG_FILE: "private.log",
    NODE_OPTIONS: "--require private-loader.cjs", node_options: "--inspect",
    GOOGLE_APPLICATION_CREDENTIALS: "private-adc.json", google_application_credentials: "other-adc.json",
    Gemini_Api_Key: "synthetic-server-secret", gcloud_project: "wrong-project",
    CLOUDSDK_CONFIG: "private-profile", cloudSdk_auth_access_token: "synthetic-token",
    VERTEX_GCLOUD_ACCOUNT: "private@example.test", connected_auth_project_id: "other-project",
    FIREBASE_CONFIG: "synthetic-private-config", fireBase_Project_Id: "wrong-project",
    firestore_emulator_host: "127.0.0.1:9999", NEXT_PUBLIC_FIREBASE_API_KEY: "synthetic-browser-key",
    tf_var_credentials: "synthetic-terraform-credentials", AUTHORIZATION: "Bearer synthetic-token",
    VERIFICATION_BASE_URL: "https://wrong.example.test", verification_runtime: "local",
    CONNECTED_FIREBASE_TEST: "0", connected_firebase_project_id: "wrong-project",
    PRODUCTION_EVIDENCE_DIR: "public-results", playwright_browsers_path: "untrusted-browser",
    PLAYWRIGHT_CONNECT_WS_ENDPOINT: "wss://capture.example.test", PLAYWRIGHT_JSON_OUTPUT_NAME: "public.json",
    PLAYWRIGHT_NO_COPY_PROMPT: "0", CI: "false", APPDATA: "private-profile"
  };
  assert.deepEqual(productionVerificationEnvironment(runner, inherited), {
    ...runner, PLAYWRIGHT_NO_COPY_PROMPT: "1", CI: "true"
  });
});

test("preserves xvfb-run's local display and authority path while still stripping credentials and debug capture", () => {
  const inherited = Object.freeze({
    DISPLAY: ":99", XAUTHORITY: "/tmp/xvfb-run.synthetic/Xauthority",
    GOOGLE_APPLICATION_CREDENTIALS: "/private/synthetic-adc.json", GEMINI_API_KEY: "synthetic-key",
    DEBUG: "pw:*", PWDEBUG: "1", NODE_OPTIONS: "--require private-loader.cjs"
  });
  assert.deepEqual(productionVerificationEnvironment(runner, inherited), {
    DISPLAY: ":99", XAUTHORITY: "/tmp/xvfb-run.synthetic/Xauthority",
    ...runner, PLAYWRIGHT_NO_COPY_PROMPT: "1", CI: "true"
  });
  assert.equal(inherited.XAUTHORITY, "/tmp/xvfb-run.synthetic/Xauthority");
});

test("admits local Unix display forms with canonical aliases, but excludes remote or malformed display connections", () => {
  for (const display of [":0", ":99", ":99.0", "unix:0", "unix/:99.1"]) {
    const env = productionVerificationEnvironment({}, { display: ":10", DISPLAY: display, dIsPlAy: ":20", xauthority: "/tmp/synthetic-Xauthority" });
    assert.equal(env.DISPLAY, display);
    assert.equal(env.XAUTHORITY, "/tmp/synthetic-Xauthority");
    assert.equal(Object.keys(env).filter(key => key.toUpperCase() === "DISPLAY").length, 1);
  }
  for (const display of ["remote.example.test:0", "127.0.0.1:99", "localhost:10.0", "tcp/localhost:0", ":99\n", ":99\0", "", " :99", ":-1", ":99.invalid", undefined]) {
    const env = productionVerificationEnvironment({}, { DISPLAY: display, XAUTHORITY: "/tmp/synthetic-Xauthority" });
    assert.equal("DISPLAY" in env, false);
    assert.equal("XAUTHORITY" in env, false);
  }
});

test("keeps a usable local display without accepting an invalid or unrelated authority path", () => {
  for (const authority of ["relative/Xauthority", "C:\\private\\Xauthority", "/tmp/private\nXauthority", "/tmp/private\0Xauthority", "", undefined]) {
    const env = productionVerificationEnvironment({}, { DISPLAY: ":99", XAUTHORITY: authority });
    assert.equal(env.DISPLAY, ":99");
    assert.equal("XAUTHORITY" in env, false);
  }
  assert.equal("XAUTHORITY" in productionVerificationEnvironment({}, { XAUTHORITY: "/tmp/synthetic-Xauthority" }), false);
});

test("accepts only the explicit runner and local cache overrides", () => {
  const overrides = {
    ...runner, VERIFICATION_RUNTIME: "connected", CONNECTED_FIREBASE_TEST: "0",
    PLAYWRIGHT_NO_COPY_PROMPT: "1", CI: "true", APPDATA: "D:\\workspace\\.cache\\config",
    LOCALAPPDATA: "D:\\workspace\\.cache\\local", XDG_CONFIG_HOME: "/workspace/.cache/config",
    XDG_CACHE_HOME: "/workspace/.cache"
  };
  assert.deepEqual(productionVerificationEnvironment(overrides, {}), overrides);
});

test("rejects explicit debug, secret, OS replacement and mixed-case override keys without exposing values", () => {
  for (const key of ["DEBUG", "PWDEBUG", "NODE_DEBUG", "DEBUG_FILE", "NODE_OPTIONS", "dEbUg",
    "GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "PATH", "DISPLAY", "XAUTHORITY", "verification_base_url",
    "Playwright_No_Copy_Prompt", "PLAYWRIGHT_CONNECT_WS_ENDPOINT", "PLAYWRIGHT_JSON_OUTPUT_NAME"]) {
    assert.throws(() => productionVerificationEnvironment({ ...runner, [key]: "synthetic-sensitive-value" }, {}), error => {
      assert.equal(error.message, "Production verification environment overrides are invalid; configuration values are withheld.");
      assert.equal(error.message.includes("synthetic-sensitive-value"), false);
      return true;
    });
  }
});

test("fails closed on disabled recording protections and malformed override values", () => {
  for (const overrides of [
    null, [], { ...runner, PLAYWRIGHT_NO_COPY_PROMPT: "0" }, { ...runner, CI: "false" },
    { ...runner, VERIFICATION_RUNTIME: "local" }, { ...runner, CONNECTED_FIREBASE_TEST: "yes" },
    { ...runner, PRODUCTION_EVIDENCE_DIR: "" }, { ...runner, PRODUCTION_EVIDENCE_DIR: "private\0path" },
    { ...runner, CONNECTED_FIREBASE_PROJECT_ID: { nested: "synthetic-secret" } }
  ]) assert.throws(() => productionVerificationEnvironment(overrides, {}), /configuration values are withheld/);
});

test("Windows evidence paths reject root equality and case-varied descendants", () => {
  const root = "D:\\Projects\\VibeEstimate";
  for (const candidate of [root, "d:\\projects\\vibeestimate\\", "D:\\PROJECTS\\VIBEESTIMATE\\.cache\\results",
    "D:/projects/vibeestimate/docs/evidence", "D:\\Projects\\VibeEstimate\\..\\VibeEstimate\\results"]) {
    assert.equal(isExternalEvidencePath(root, candidate, path.win32), false);
  }
});

test("Windows evidence paths permit an external sibling, another drive and a distinct UNC share", () => {
  const root = "D:\\Projects\\VibeEstimate";
  assert.equal(isExternalEvidencePath(root, "D:\\Projects\\docs\\private", path.win32), true);
  assert.equal(isExternalEvidencePath(root, "D:\\Projects\\VibeEstimate-private", path.win32), true);
  assert.equal(isExternalEvidencePath(root, "E:\\private\\verification", path.win32), true);
  assert.equal(isExternalEvidencePath("\\\\server\\repo\\workspace", "\\\\server\\private\\verification", path.win32), true);
  assert.equal(isExternalEvidencePath("\\\\server\\repo\\workspace", "\\\\SERVER\\REPO\\WORKSPACE\\results", path.win32), false);
});

test("POSIX evidence boundaries normalize traversal without treating similar directory names as descendants", () => {
  assert.equal(isExternalEvidencePath("/workspace/repo", "/workspace/repo", path.posix), false);
  assert.equal(isExternalEvidencePath("/workspace/repo", "/workspace/repo/docs/../results", path.posix), false);
  assert.equal(isExternalEvidencePath("/workspace/repo", "/workspace/repo/../private", path.posix), true);
  assert.equal(isExternalEvidencePath("/workspace/repo", "/workspace/repo-private", path.posix), true);
  assert.equal(isExternalEvidencePath("/workspace/repo", "/workspace", path.posix), true);
});

test("evidence boundaries require two valid absolute paths", () => {
  for (const [root, candidate] of [["relative", "/private"], ["/repo", "../private"], ["/repo", ""],
    ["/repo", null], ["/repo", "/private\0capture"], [undefined, "/private"]]) {
    assert.equal(isExternalEvidencePath(root, candidate, path.posix), false);
  }
  assert.equal(isExternalEvidencePath("D:\\repo", "E:relative", path.win32), false);
});
