import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { geminiBackendEnv } from "../scripts/gemini-config.mjs";
import { localEnv, root } from "../scripts/local-env.mjs";

const fakeSecret = "synthetic-test-key-never-use-for-an-api";

function privateDirectory(t) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, "vibeestimate-env-test-"));
  assert.ok(path.relative(root, directory).startsWith("..") || path.isAbsolute(path.relative(root, directory)), "Test settings must be outside the checkout.");
  t.after(() => {
    // Check the generated target before cleanup. Unlink only direct files/links;
    // never recurse through a junction into the repository or another directory.
    const relative = path.relative(tempRoot, fs.realpathSync(directory));
    assert.match(relative, /^vibeestimate-env-test-[^/\\]+$/);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.ok(!entry.isDirectory() || entry.isSymbolicLink(), "Unexpected nested directory in the test's temporary folder.");
      fs.unlinkSync(path.join(directory, entry.name));
    }
    fs.rmdirSync(directory);
  });
  return directory;
}

function privateConfig(directory, value) {
  const filename = path.join(directory, "test-settings.json");
  fs.writeFileSync(filename, typeof value === "string" ? value : JSON.stringify(value));
  return filename;
}

function safeError(action, expectedMessage) {
  assert.throws(action, error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, expectedMessage);
    assert.ok(!error.message.includes(fakeSecret), "Configuration errors must not echo the supplied API key.");
    assert.ok(!error.stack.includes(fakeSecret), "Configuration stacks must not echo the supplied API key.");
    return true;
  });
}

test("private configuration creates a backend-only environment and preserves the shared emulator environment", t => {
  const configPath = privateConfig(privateDirectory(t), { apiKey: "  " + fakeSecret + "  ", model: "  gemini-test-model  " });
  const sharedEnv = Object.freeze({
    APP_ENV: "local", AI_PROVIDER: "fixture", FIREBASE_PROJECT_ID: "demo-vibeestimate",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true"
  });
  const original = { ...sharedEnv };
  const backendEnv = geminiBackendEnv(sharedEnv, configPath);

  assert.notStrictEqual(backendEnv, sharedEnv);
  assert.deepEqual(sharedEnv, original);
  assert.equal(backendEnv.AI_PROVIDER, "gemini");
  assert.equal(backendEnv.GEMINI_API_KEY, fakeSecret);
  assert.equal(backendEnv.GEMINI_MODEL, "gemini-test-model");
  assert.equal(backendEnv.GEMINI_TRANSPORT, "developer");
  for (const key of ["APP_ENV", "FIREBASE_PROJECT_ID", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_USE_FIREBASE_EMULATORS"]) {
    assert.equal(backendEnv[key], sharedEnv[key]);
  }
  assert.ok(!Object.values(sharedEnv).includes(fakeSecret));
  assert.ok(!Object.entries(backendEnv).some(([key, value]) => key.startsWith("NEXT_PUBLIC_") && value === fakeSecret));
});

test("paths inside the repository are rejected before parsing their contents", () => {
  for (const configPath of [root, path.join(root, "package.json"), path.join(root, "tests", "..", "package.json")]) {
    safeError(() => geminiBackendEnv({}, configPath), /outside the public repository/);
  }
});

test("an external symlink or junction cannot disguise configuration inside the repository", t => {
  const directory = privateDirectory(t);
  const linkedCheckout = path.join(directory, "linked-checkout");
  try {
    fs.symlinkSync(root, linkedCheckout, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("This platform does not permit creating a test symlink or junction.");
      return;
    }
    throw error;
  }
  safeError(() => geminiBackendEnv({}, path.join(linkedCheckout, "package.json")), /outside the public repository/);
});

test("malformed private JSON returns a safe error without its supplied key", t => {
  const configPath = privateConfig(privateDirectory(t), '{"apiKey":"' + fakeSecret + '","model":');
  safeError(() => geminiBackendEnv({}, configPath), /must contain valid JSON/);
});

test("invalid model IDs and missing keys return safe validation errors", t => {
  const directory = privateDirectory(t);
  for (const settings of [
    { apiKey: fakeSecret, model: "models/gemini-test-model" },
    { apiKey: fakeSecret, model: "gemini-test-model\n" + fakeSecret },
    { apiKey: fakeSecret, model: "" },
    { apiKey: fakeSecret, model: null },
    { apiKey: "   ", model: "gemini-test-model" },
    { model: "gemini-test-model" },
    null
  ]) {
    const configPath = privateConfig(directory, settings);
    safeError(() => geminiBackendEnv({}, configPath), /nonempty apiKey and a valid model ID/);
  }
});

test("inherited live credentials and endpoints cannot escape into the default local stack", () => {
  const credentialKeys = [
    "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CREDENTIALS", "GOOGLE_CLOUD_KEYFILE_JSON", "GCLOUD_KEYFILE_JSON",
    "GOOGLE_OAUTH_ACCESS_TOKEN", "TF_VAR_access_token", "TF_VAR_gemini_api_key", "FIREBASE_CONFIG", "FIREBASE_TOKEN",
    "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_TRANSPORT", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE", "CLOUDSDK_CONFIG",
    "VERTEX_PROJECT_ID", "VERTEX_LOCATION", "VERTEX_GCLOUD_CONFIGURATION", "VERTEX_GCLOUD_ACCOUNT", "VERTEX_GCLOUD_CONFIG_DIR",
    "CONNECTED_AUTH_PROJECT_ID", "CONNECTED_AUTH_GCLOUD_CONFIGURATION", "CONNECTED_AUTH_GCLOUD_ACCOUNT", "CONNECTED_AUTH_GCLOUD_CONFIG_DIR", "FIRESTORE_DATABASE_ID",
    "CLOUDSDK_AUTH_ACCESS_TOKEN", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE"
  ];
  const inherited = {
    ...Object.fromEntries(credentialKeys.map(key => [key, fakeSecret])),
    APP_ENV: "production", AI_PROVIDER: "gemini", GOOGLE_GENAI_USE_VERTEXAI: "true",
    GCLOUD_PROJECT: "synthetic-non-demo-project", GOOGLE_CLOUD_PROJECT: "synthetic-non-demo-project", FIREBASE_PROJECT_ID: "synthetic-non-demo-project",
    FIREBASE_AUTH_EMULATOR_HOST: "remote.invalid:9099", FIRESTORE_EMULATOR_HOST: "remote.invalid:8085",
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "synthetic-non-demo-project",
    NEXT_PUBLIC_AUTH_MODE: "guest", NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true", NEXT_PUBLIC_GEMINI_API_KEY: fakeSecret,
    NEXT_PUBLIC_FIREBASE_API_KEY: fakeSecret, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "remote.invalid", NEXT_PUBLIC_FIREBASE_APP_ID: "synthetic-live-app",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "https://remote.invalid", NEXT_PUBLIC_API_URL: "https://remote.invalid",
    FRONTEND_ORIGIN: "https://remote.invalid", PORT: "9999"
  };
  // Replace the environment object with synthetic input for this synchronous
  // test; no existing credential values are read or copied into test fixtures.
  const originalEnvironment = process.env;
  try {
    process.env = { ...inherited };
    const env = localEnv();
    for (const key of credentialKeys) assert.equal(Object.hasOwn(env, key), false, key + " must be stripped");
    assert.equal(env.APP_ENV, "local");
    assert.equal(env.AI_PROVIDER, "fixture");
    for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]) assert.equal(env[key], "demo-vibeestimate");
    assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
    assert.equal(env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
    assert.equal(env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "true");
    assert.equal(env.NEXT_PUBLIC_AUTH_MODE, "google");
    assert.equal(env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, "false");
    assert.equal(env.NEXT_PUBLIC_GEMINI_API_KEY, undefined);
    assert.equal(env.NEXT_PUBLIC_FIREBASE_API_KEY, "demo-key");
    assert.equal(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "demo-vibeestimate.firebaseapp.com");
    assert.equal(env.NEXT_PUBLIC_FIREBASE_APP_ID, "demo-app");
    assert.equal(env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL, "http://127.0.0.1:9099");
    assert.equal(env.NEXT_PUBLIC_API_URL, "");
    assert.equal(env.BACKEND_ORIGIN, "http://127.0.0.1:8080");
    assert.equal(env.FRONTEND_ORIGIN, "http://127.0.0.1:3000");
    assert.equal(env.PORT, "8080");
    assert.ok(!Object.values(env).includes(fakeSecret));
    assert.deepEqual(process.env, inherited, "Building a local environment must not mutate its caller's environment.");
    for (const key of ["FIREBASE_EMULATORS_PATH", "PLAYWRIGHT_BROWSERS_PATH", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "APPDATA", "LOCALAPPDATA", "npm_config_cache"]) {
      const relative = path.relative(root, env[key]);
      assert.ok(relative.startsWith(".cache" + path.sep) || relative === ".cache", key + " must use the project cache");
    }
  } finally {
    process.env = originalEnvironment;
  }
});

function vertexSettings(directory) {
  return { transport: "vertex", model: "gemini-test-model", projectId: "example-cloud-project", location: "global", gcloudConfiguration: "fixture-profile", account: "operator@example.invalid", gcloudConfigDir: directory };
}

test("mixed-case inherited credentials and local endpoint aliases are removed before Windows subprocesses start", () => {
  const inherited = {
    CloudSdk_Auth_Access_Token: fakeSecret, Gemini_Api_Key: fakeSecret,
    Tf_Var_Access_Token: fakeSecret, Tf_Var_Gemini_Api_Key: fakeSecret,
    Google_Application_Credentials: fakeSecret, Vertex_Gcloud_Config_Dir: fakeSecret,
    Connected_Auth_Gcloud_Account: fakeSecret, Firestore_Database_Id: "unrelated-database", Next_Public_Gemini_Key: fakeSecret,
    Google_Genai_Use_VertexAi: "true", CloudSdk_Config: fakeSecret,
    App_Env: "production", Ai_Provider: "gemini", Firebase_Project_Id: "synthetic-live-project",
    Firestore_Emulator_Host: "remote.invalid:8085", Next_Public_Api_Url: "https://remote.invalid",
    AppData: "outside-project-cache"
  };
  const originalEnvironment = process.env;
  try {
    process.env = { ...inherited };
    const env = localEnv();
    for (const key of Object.keys(inherited)) assert.equal(Object.hasOwn(env, key), false, key + " alias must be removed");
    assert.equal(env.APP_ENV, "local");
    assert.equal(env.AI_PROVIDER, "fixture");
    assert.equal(env.FIREBASE_PROJECT_ID, "demo-vibeestimate");
    assert.equal(env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
    assert.equal(env.NEXT_PUBLIC_API_URL, "");
    assert.ok(!Object.values(env).includes(fakeSecret));
    assert.deepEqual(process.env, inherited);
  } finally {
    process.env = originalEnvironment;
  }
});

test("explicit Vertex settings reach only the backend and keep Firebase on its demo project", t => {
  const directory = privateDirectory(t);
  const settings = vertexSettings(directory);
  const shared = Object.freeze({ APP_ENV: "local", AI_PROVIDER: "fixture", GOOGLE_CLOUD_PROJECT: "demo-vibeestimate", FIREBASE_PROJECT_ID: "demo-vibeestimate", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", GEMINI_API_KEY: fakeSecret });
  const backend = geminiBackendEnv(shared, privateConfig(directory, settings));
  assert.equal(backend.GEMINI_TRANSPORT, "vertex");
  assert.equal(backend.AI_PROVIDER, "gemini");
  assert.equal(backend.VERTEX_PROJECT_ID, settings.projectId);
  assert.equal(backend.VERTEX_GCLOUD_CONFIG_DIR, directory);
  assert.equal(backend.GOOGLE_CLOUD_PROJECT, "demo-vibeestimate");
  assert.equal(backend.FIREBASE_PROJECT_ID, "demo-vibeestimate");
  assert.equal(backend.FIRESTORE_EMULATOR_HOST, shared.FIRESTORE_EMULATOR_HOST);
  assert.equal(backend.FIREBASE_AUTH_EMULATOR_HOST, shared.FIREBASE_AUTH_EMULATOR_HOST);
  assert.equal(backend.GEMINI_API_KEY, undefined);
  assert.equal(shared.AI_PROVIDER, "fixture");
  assert.equal(shared.GEMINI_API_KEY, fakeSecret);
  assert.ok(!Object.values(backend).includes(fakeSecret));
  assert.ok(!Object.keys(shared).some(name => name.startsWith("VERTEX_")));
});

test("Vertex private configuration fails closed for unsafe targets, mixed credentials, and non-local mode", t => {
  const directory = privateDirectory(t);
  const valid = vertexSettings(directory);
  for (const change of [
    { projectId: "demo-vibeestimate" }, { projectId: "example&unexpected" },
    { location: "https://remote.invalid" }, { model: "models/gemini-test-model" },
    { gcloudConfiguration: "profile;unexpected" }, { account: "%PATH%@example.invalid" },
    { apiKey: fakeSecret }, { gcloudConfigDir: "relative-path" }
  ]) {
    const filename = privateConfig(directory, { ...valid, ...change });
    safeError(() => geminiBackendEnv({ APP_ENV: "local" }, filename), /Local Vertex configuration requires/);
  }
  for (const appEnv of [undefined, "production", "test"]) {
    safeError(() => geminiBackendEnv({ APP_ENV: appEnv }, privateConfig(directory, valid)), /Local Vertex configuration requires/);
  }
  safeError(() => geminiBackendEnv({ APP_ENV: "local" }, privateConfig(directory, { ...valid, transport: "unknown" })), /transport must be developer or vertex/);
});

test("Vertex cannot redirect the gcloud credential directory into the public checkout", t => {
  const directory = privateDirectory(t);
  safeError(() => geminiBackendEnv({ APP_ENV: "local" }, privateConfig(directory, { ...vertexSettings(directory), gcloudConfigDir: root })), /directory must exist outside the public repository/);
});

test("connected Vertex can resolve a private relative directory and clears mixed-case Gemini aliases", t => {
  const directory = privateDirectory(t);
  const filename = privateConfig(directory, { ...vertexSettings(directory), gcloudConfigDir: "." });
  const inherited = { APP_ENV: "connected", Gemini_Api_Key: fakeSecret, Google_Api_Key: fakeSecret, Vertex_Project_Id: "wrong-project" };
  const result = geminiBackendEnv(inherited, filename);
  assert.equal(result.VERTEX_GCLOUD_CONFIG_DIR, directory);
  assert.equal(result.VERTEX_PROJECT_ID, "example-cloud-project");
  assert.ok(!Object.values(result).includes(fakeSecret));
  assert.equal(inherited.Gemini_Api_Key, fakeSecret);
});

test("missing private paths are sanitized without echoing their values", () => {
  safeError(() => geminiBackendEnv({ APP_ENV: "local" }, path.join(os.tmpdir(), fakeSecret, "does-not-exist.json")), /outside the public repository/);
});
