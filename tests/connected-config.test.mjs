import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { connectedConfigArgument, connectedEnvironments } from "../scripts/connected-config.mjs";
import { root } from "../scripts/local-env.mjs";

const syntheticSecret = "synthetic-private-key-do-not-expose";
const publicWebKey = "synthetic-firebase-web-key-000000";
function fixture(t) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, "vibeestimate-connected-test-"));
  const relative = path.relative(root, directory);
  assert.ok(relative.startsWith(".." + path.sep) || path.isAbsolute(relative));
  t.after(() => {
    const resolved = fs.realpathSync(directory);
    assert.match(path.relative(tempRoot, resolved), /^vibeestimate-connected-test-[^/\\]+$/);
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      assert.ok(!entry.isDirectory() || entry.isSymbolicLink());
      fs.unlinkSync(path.join(resolved, entry.name));
    }
    fs.rmdirSync(resolved);
  });
  const settings = {
    firebaseProjectId: "synthetic-firebase-project", firestoreDatabaseId: "(default)", webConfigPath: "web.json",
    gcloudConfiguration: "synthetic-owner", account: "owner@example.test", gcloudConfigDir: ".",
    authProjectId: "synthetic-backend-project", geminiConfigPath: "gemini.json", frontendOrigin: "http://localhost:3000"
  };
  const web = {
    apiKey: publicWebKey, projectId: settings.firebaseProjectId, authDomain: settings.firebaseProjectId + ".firebaseapp.com",
    appId: "1:123456789:web:synthetic000", messagingSenderId: "123456789", storageBucket: settings.firebaseProjectId + ".firebasestorage.app"
  };
  const gemini = {
    transport: "vertex", model: "gemini-3.7-flash", projectId: settings.authProjectId, location: "global",
    gcloudConfiguration: settings.gcloudConfiguration, account: settings.account, gcloudConfigDir: "."
  };
  const filename = path.join(directory, "connected.json");
  const write = (changes = {}) => {
    fs.writeFileSync(filename, typeof changes.settings === "string" ? changes.settings : JSON.stringify(changes.settings ?? settings));
    fs.writeFileSync(path.join(directory, "web.json"), typeof changes.web === "string" ? changes.web : JSON.stringify(changes.web ?? web));
    fs.writeFileSync(path.join(directory, "gemini.json"), typeof changes.gemini === "string" ? changes.gemini : JSON.stringify(changes.gemini ?? gemini));
  };
  write();
  return { directory, filename, settings, web, gemini, write };
}
function safeFailure(action) {
  assert.throws(action, error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(syntheticSecret));
    assert.ok(!error.stack.includes(syntheticSecret));
    assert.ok(!error.message.includes("owner@example.test"));
    return true;
  });
}

test("separates connected backend credentials from guest frontend public Firebase settings", t => {
  const files = fixture(t);
  const input = Object.freeze({ PATH: "synthetic-system-path", SystemRoot: "synthetic-system-root", HOME: "synthetic-home" });
  const environments = connectedEnvironments(files.filename, input);
  const { backendEnv, frontendEnv } = environments;
  assert.equal(environments.frontendOrigin, "http://localhost:3000");
  assert.equal(backendEnv.APP_ENV, "connected");
  assert.equal(backendEnv.FIREBASE_PROJECT_ID, files.settings.firebaseProjectId);
  assert.equal(backendEnv.FIRESTORE_DATABASE_ID, "(default)");
  assert.equal(backendEnv.CONNECTED_AUTH_PROJECT_ID, files.settings.authProjectId);
  assert.equal(backendEnv.CONNECTED_AUTH_GCLOUD_ACCOUNT, files.settings.account);
  assert.equal(backendEnv.CONNECTED_AUTH_GCLOUD_CONFIG_DIR, files.directory);
  assert.equal(backendEnv.VERTEX_GCLOUD_CONFIG_DIR, files.directory);
  assert.equal(backendEnv.VERTEX_PROJECT_ID, files.settings.authProjectId);
  assert.equal(backendEnv.GEMINI_MODEL, "gemini-3.7-flash");
  assert.equal(backendEnv.FRONTEND_ORIGIN, "http://localhost:3000");
  assert.equal(backendEnv.PORT, "8080");
  assert.equal(backendEnv.GEMINI_API_KEY, undefined);
  assert.equal(frontendEnv.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "false");
  assert.equal(frontendEnv.NEXT_PUBLIC_AUTH_MODE, "guest");
  assert.equal(frontendEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, "true");
  assert.equal(frontendEnv.NEXT_PUBLIC_API_URL, "http://127.0.0.1:8080");
  assert.equal(frontendEnv.NEXT_PUBLIC_FIREBASE_API_KEY, publicWebKey);
  assert.equal(frontendEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID, files.settings.firebaseProjectId);
  for (const key of Object.keys(frontendEnv)) assert.ok(!/^(?:CONNECTED_AUTH_|VERTEX_|GEMINI_|FIREBASE_|FIRESTORE_|CLOUDSDK_|GOOGLE_)/i.test(key), key);
  assert.ok(!Object.keys(backendEnv).some(key => key.startsWith("NEXT_PUBLIC_")));
  assert.ok(!Object.values(frontendEnv).includes(files.settings.account));
  assert.ok(!Object.values(frontendEnv).includes(files.directory));
  assert.equal(frontendEnv.PATH, input.PATH);
  assert.equal(frontendEnv.SystemRoot, input.SystemRoot);
  assert.equal(backendEnv.NODE_ENV, "development");
  assert.equal(frontendEnv.NODE_ENV, "development");
  assert.equal(input.PATH, "synthetic-system-path");
});

test("strips inherited secrets and all mixed-case endpoint or public-variable aliases before either child starts", t => {
  const files = fixture(t);
  const inherited = Object.freeze({
    PATH: "synthetic-system-path", OPENAI_API_KEY: syntheticSecret, UNRELATED_PRIVATE_TOKEN: syntheticSecret,
    Google_Application_Credentials: syntheticSecret, Gemini_Api_Key: syntheticSecret, CloudSdk_Auth_Access_Token: syntheticSecret,
    Connected_Auth_Gcloud_Account: syntheticSecret, Vertex_Project_Id: syntheticSecret, FIREBASE_TOKEN: syntheticSecret,
    NEXT_PUBLIC_GEMINI_API_KEY: syntheticSecret, Next_Public_Api_Url: "https://wrong.example.test", NEXT_PUBLIC_EXTRA_ENDPOINT: "https://wrong.example.test",
    FIREBASE_AUTH_EMULATOR_HOST: "remote.invalid:9099", Firestore_Emulator_Host: "remote.invalid:8085", NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "https://wrong.example.test",
    FIRESTORE_DATABASE_ID: "unrelated-database", API_URL: "https://wrong.example.test", HTTP_PROXY: syntheticSecret, NODE_OPTIONS: syntheticSecret,
    NEXT_PUBLIC_AUTH_MODE: "google", NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false"
  });
  const original = { ...inherited };
  const { backendEnv, frontendEnv } = connectedEnvironments(files.filename, inherited);
  for (const env of [backendEnv, frontendEnv]) {
    assert.ok(!Object.values(env).includes(syntheticSecret));
    assert.ok(!Object.values(env).includes("https://wrong.example.test"));
    for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL"]) assert.equal(env[key], undefined);
  }
  assert.equal(frontendEnv.Next_Public_Api_Url, undefined);
  assert.equal(frontendEnv.NEXT_PUBLIC_EXTRA_ENDPOINT, undefined);
  assert.deepEqual(inherited, original);
});

test("rejects a production process even when the private configuration requests connected mode", t => {
  const files = fixture(t);
  for (const inherited of [{ NODE_ENV: "production" }, { Node_Env: "production" }, { K_SERVICE: "synthetic-cloud-run" }, { k_service: "" }]) {
    safeFailure(() => connectedEnvironments(files.filename, inherited));
  }
});

test("requires exact external settings and a matching flat public Web SDK project", t => {
  const files = fixture(t);
  for (const settings of [
    { ...files.settings, firebaseProjectId: "demo-vibeestimate" }, { ...files.settings, firestoreDatabaseId: "" },
    { ...files.settings, frontendOrigin: "http://127.0.0.1:3000" }, { ...files.settings, frontendOrigin: "https://wrong.example.test" },
    { ...files.settings, account: "service@project.iam.gserviceaccount.com" }, { ...files.settings, account: syntheticSecret },
    { ...files.settings, apiKey: syntheticSecret }, { ...files.settings, webConfigPath: null },
    { ...files.settings, geminiConfigPath: path.join(files.directory, syntheticSecret) }
  ]) { files.write({ settings }); safeFailure(() => connectedEnvironments(files.filename, {})); }
  for (const web of [
    { ...files.web, projectId: "other-firebase-project" }, { ...files.web, authDomain: "wrong.example.test" },
    { ...files.web, apiKey: "" }, { ...files.web, appId: syntheticSecret },
    { ...files.web, messagingSenderId: "987654321" }, { ...files.web, storageBucket: "unrelated-bucket" },
    { ...files.web, private_key: syntheticSecret }, { result: { sdkConfig: files.web } },
    { ...files.web, databaseURL: "http://127.0.0.1:9000" }
  ]) { files.write({ web }); safeFailure(() => connectedEnvironments(files.filename, {})); }
});

test("refuses mismatched Gemini profiles, projects, accounts and non-Vertex credentials", t => {
  const files = fixture(t);
  for (const gemini of [
    { ...files.gemini, projectId: "other-backend-project" }, { ...files.gemini, account: "other@example.test" },
    { ...files.gemini, gcloudConfiguration: "other-profile" }, { ...files.gemini, gcloudConfigDir: root },
    { transport: "developer", apiKey: syntheticSecret, model: "gemini-3.7-flash" }
  ]) { files.write({ gemini }); safeFailure(() => connectedEnvironments(files.filename, {})); }
});

test("keeps all canonical referenced paths outside the repository, including symlinked paths", t => {
  const files = fixture(t);
  safeFailure(() => connectedEnvironments(path.join(root, "package.json"), {}));
  for (const key of ["webConfigPath", "geminiConfigPath", "gcloudConfigDir"]) {
    files.write({ settings: { ...files.settings, [key]: key === "gcloudConfigDir" ? root : path.join(root, "package.json") } });
    safeFailure(() => connectedEnvironments(files.filename, {}));
  }
  const linked = path.join(files.directory, "linked-checkout");
  try { fs.symlinkSync(root, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Test symlinks are unavailable on this platform."); return; }
    throw error;
  }
  files.write({ settings: { ...files.settings, webConfigPath: "linked-checkout/package.json" } });
  safeFailure(() => connectedEnvironments(files.filename, {}));
});

test("malformed private JSON and unsupported command arguments expose neither values nor paths", t => {
  const files = fixture(t);
  for (const key of ["settings", "web", "gemini"]) {
    files.write({ [key]: '{"secret":"' + syntheticSecret + '",' });
    safeFailure(() => connectedEnvironments(files.filename, {}));
  }
  for (const args of [[], ["--config"], ["--wrong", files.filename], ["--config", ""], ["--config", files.filename, "--extra"]]) safeFailure(() => connectedConfigArgument(args));
  assert.equal(connectedConfigArgument(["--config", "../private/connected.json"]), "../private/connected.json");
});
