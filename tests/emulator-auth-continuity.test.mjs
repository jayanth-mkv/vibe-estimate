import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { authValidityState, planAuthValidityRestore } from "../scripts/emulator-auth-continuity.mjs";

const require = createRequire(import.meta.url);
const { authOperations, setAccountInfoImpl } = require("../node_modules/firebase-tools/lib/emulator/auth/operations.js");
const { ProjectState } = require("../node_modules/firebase-tools/lib/emulator/auth/state.js");
const { UserRecord } = require("../node_modules/firebase-admin/lib/auth/user-record.js");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const jwt = require("jsonwebtoken");

const now = Math.floor(Date.now() / 1000);
function saved(localId = "synthetic-owner", overrides = {}) {
  return { localId, createdAt: String((now - 300) * 1000 + 250), lastLoginAt: String((now - 120) * 1000 + 500), validSince: String(now - 300), ...overrides };
}
function imported(user) { return { ...user, validSince: String(now), disabled: Boolean(user.disabled), emailVerified: Boolean(user.emailVerified) }; }
function omittedBoundary(localId = "synthetic-anonymous") { const user = saved(localId); delete user.validSince; return user; }

test("plans only revocation-boundary restoration and normalizes import defaults without changing input", () => {
  const users = [saved("b", { disabled: true, validSince: String(now - 50) }), saved("a")];
  const original = structuredClone(users);
  const restored = planAuthValidityRestore(users, users.map(imported).reverse());
  assert.deepEqual(restored, [
    { localId: "a", validSince: String(now - 300) },
    { localId: "b", validSince: String(now - 50) }
  ]);
  assert.deepEqual(users, original);
  assert.deepEqual(planAuthValidityRestore(users, users), []);
  assert.deepEqual(authValidityState(users), authValidityState(users.map(user => ({ ...imported(user), validSince: user.validSince }))));
});

test("uses verified anonymous creation time for a genuinely absent boundary, preserving explicit zero and revocations", () => {
  const user = omittedBoundary();
  const plan = planAuthValidityRestore([user], [imported(user)]);
  assert.deepEqual(plan, [{ localId: user.localId, validSince: String(now - 300) }]);
  assert.notEqual(plan[0].validSince, "0");
  assert.deepEqual(authValidityState([user]), authValidityState([{ ...user, validSince: plan[0].validSince, disabled: false }]));
  const explicitZero = saved("explicit-zero", { validSince: "0" });
  assert.deepEqual(planAuthValidityRestore([explicitZero], [imported(explicitZero)]), [{ localId: "explicit-zero", validSince: "0" }]);
  const revoked = saved("revoked", { validSince: String(now - 50) });
  assert.equal(planAuthValidityRestore([revoked], [imported(revoked)])[0].validSince, revoked.validSince);
});

test("rejects missing identities, account-set drift, duplicate accounts and malformed boundaries", () => {
  assert.throws(() => planAuthValidityRestore(undefined, []));
  assert.throws(() => planAuthValidityRestore([saved()], []));
  assert.throws(() => planAuthValidityRestore([saved()], [imported(saved()), imported(saved("new-user"))]));
  assert.throws(() => planAuthValidityRestore([saved(), saved()], [imported(saved()), imported(saved())]));
  assert.throws(() => authValidityState([{ ...saved(), localId: undefined }]));
  for (const invalid of [null, undefined, "", "yesterday", "-1", "001", "9007199254740992", 0, 123, true]) {
    assert.throws(() => authValidityState([{ ...saved(), validSince: invalid }]));
  }
  assert.throws(() => authValidityState([{ ...omittedBoundary(), createdAt: undefined }]));
  assert.throws(() => authValidityState([{ ...omittedBoundary(), lastLoginAt: "1" }]));
  assert.throws(() => authValidityState([{ ...omittedBoundary(), email: "example@example.test" }]));
  assert.throws(() => authValidityState([{ ...saved(), unknownAuthorizationField: true }]));
});

test("rejects security-relevant identity changes while allowing known import/refresh timestamp changes", () => {
  const baseline = saved("linked-user", {
    email: "synthetic@example.test", emailVerified: true, passwordHash: "synthetic-hash", salt: "synthetic-salt",
    customAttributes: JSON.stringify({ role: "designer", level: 1 }),
    providerUserInfo: [{ providerId: "google.com", rawId: "synthetic-google-identity" }]
  });
  const identityChanges = [
    { disabled: true }, { email: "changed@example.test" }, { emailVerified: false },
    { passwordHash: "changed-hash" }, { salt: "changed-salt" }, { tenantId: "other-tenant" },
    { phoneNumber: "+910000000001" }, { customAttributes: JSON.stringify({ role: "admin", level: 1 }) },
    { providerUserInfo: [{ providerId: "google.com", rawId: "changed-google-identity" }] },
    { mfaInfo: [{ mfaEnrollmentId: "changed-factor" }] },
    { passkeyInfo: [{ credentialId: "changed-passkey" }] },
    { createdAt: String((now - 400) * 1000) }, { lastLoginAt: String((now - 60) * 1000) }
  ];
  for (const change of identityChanges) assert.throws(() => planAuthValidityRestore([baseline], [{ ...imported(baseline), ...change }]));
  const benign = { ...imported(baseline), passwordUpdatedAt: Date.now(), lastRefreshAt: new Date().toISOString(), customAttributes: JSON.stringify({ level: 1, role: "designer" }) };
  assert.deepEqual(planAuthValidityRestore([baseline], [benign]), [{ localId: baseline.localId, validSince: baseline.validSince }]);
  assert.throws(() => planAuthValidityRestore([baseline], [{ ...imported(baseline), validSince: String(now - 301) }]));
});

test("installed emulator import breaks a valid identity and privileged restoration repairs it without weakening Admin verification", async () => {
  const previousHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  const state = new ProjectState("demo-vibeestimate");
  const app = initializeApp({ projectId: "demo-vibeestimate" }, "auth-continuity-synthetic-test");
  const auth = getAuth(app);
  // Only the user-record datasource is injected. The installed SDK's complete
  // verifyIdToken path, including forced emulator revocation checks, is unchanged.
  auth.getUser = async uid => new UserRecord(state.getUserByLocalId(uid));
  const original = omittedBoundary("synthetic-valid-user");
  const token = jwt.sign({ auth_time: now - 120, user_id: original.localId, firebase: { sign_in_provider: "anonymous", identities: {} } }, "synthetic-only", {
    algorithm: "none", expiresIn: 3600, subject: original.localId,
    audience: "demo-vibeestimate", issuer: "https://securetoken.google.com/demo-vibeestimate"
  });
  try {
    state.overwriteUserWithLocalId(original.localId, original);
    assert.equal((await auth.verifyIdToken(token)).uid, original.localId);
    const result = authOperations.identitytoolkit.projects.accounts.batchCreate(state, { users: [original], allowOverwrite: true });
    assert.deepEqual(result.error, []);
    const importedUser = structuredClone(state.getUserByLocalId(original.localId));
    assert.ok(Number(importedUser.validSince) > now - 120);
    await assert.rejects(auth.verifyIdToken(token), { code: "auth/id-token-revoked" });
    const plan = planAuthValidityRestore([original], [importedUser]);
    for (const update of plan) setAccountInfoImpl(state, update, { privileged: true });
    assert.equal((await auth.verifyIdToken(token)).uid, original.localId);
    assert.deepEqual(authValidityState([state.getUserByLocalId(original.localId)]), authValidityState([original]));
    assert.deepEqual({ ...state.getUserByLocalId(original.localId), validSince: importedUser.validSince }, importedUser);
    // An end-user update cannot supply an earlier privileged cutoff.
    setAccountInfoImpl(state, { idToken: token, validSince: String(now - 300) }, { privileged: false });
    await assert.rejects(auth.verifyIdToken(token), { code: "auth/id-token-revoked" });
  } finally {
    await deleteApp(app);
    if (previousHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousHost;
  }
});

test("restoration keeps intentionally revoked and disabled tokens rejected by unchanged installed Admin", async () => {
  const previousHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  const state = new ProjectState("demo-vibeestimate");
  const app = initializeApp({ projectId: "demo-vibeestimate" }, "auth-continuity-denial-test");
  const auth = getAuth(app);
  auth.getUser = async uid => new UserRecord(state.getUserByLocalId(uid));
  const users = [saved("synthetic-revoked", { validSince: String(now - 50) }), saved("synthetic-disabled", { disabled: true })];
  try {
    assert.deepEqual(authOperations.identitytoolkit.projects.accounts.batchCreate(state, { users }).error, []);
    for (const update of planAuthValidityRestore(users, users.map(user => state.getUserByLocalId(user.localId)))) setAccountInfoImpl(state, update, { privileged: true });
    for (const user of users) {
      const token = jwt.sign({ auth_time: now - 120, user_id: user.localId, firebase: { sign_in_provider: "anonymous", identities: {} } }, "synthetic-only", {
        algorithm: "none", expiresIn: 3600, subject: user.localId,
        audience: "demo-vibeestimate", issuer: "https://securetoken.google.com/demo-vibeestimate"
      });
      await assert.rejects(auth.verifyIdToken(token), { code: user.disabled ? "auth/user-disabled" : "auth/id-token-revoked" });
    }
    assert.deepEqual(authValidityState(users), authValidityState(users.map(user => state.getUserByLocalId(user.localId))));
  } finally {
    await deleteApp(app);
    if (previousHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousHost;
  }
});
