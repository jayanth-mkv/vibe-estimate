/**
 * Pure planning for the fixed local demo Auth emulator; this module makes no requests.
 *
 * firebase-tools accounts:batchCreate replaces exported validSince with import time.
 * The caller must verify the demo hub and snapshot, run this immediately after import
 * before starting the app, then POST only these planned fields to the fixed loopback
 * accounts:update endpoint with the emulator's privileged owner authorization.
 * Never use this planner to roll back a live account's later intentional revocation.
 */

const maximumUsers = 10000;
const identityStrings = ["email", "phoneNumber", "passwordHash", "salt", "tenantId", "initialEmail", "displayName", "photoUrl"];
const identityArrays = ["providerUserInfo", "mfaInfo", "passkeyInfo"];
const allowedFields = new Set([
  "localId", "createdAt", "lastLoginAt", "validSince", "disabled", "emailVerified", "emailLinkSignin",
  "customAttributes", "lastRefreshAt", "passwordUpdatedAt", ...identityStrings, ...identityArrays
]);

function fail(message) { throw new Error(message); }
function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  fail("The local Auth snapshot contains an unsupported value.");
}
function timestamp(value, positive = false) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)) || (positive && Number(value) === 0)) {
    fail("The local Auth snapshot contains an invalid timestamp.");
  }
  return Number(value);
}
function optionalBoolean(record, key) {
  if (!Object.hasOwn(record, key)) return false;
  if (typeof record[key] !== "boolean") fail("The local Auth snapshot contains an invalid account flag.");
  return record[key];
}
function optionalString(record, key) {
  if (!Object.hasOwn(record, key)) return "";
  if (typeof record[key] !== "string" || !record[key] || record[key].length > 16000) fail("The local Auth snapshot contains an invalid identity field.");
  return record[key];
}
function identityArray(record, key) {
  if (!Object.hasOwn(record, key)) return [];
  if (!Array.isArray(record[key]) || record[key].length > 100 || record[key].some(value => !plain(value))) fail("The local Auth snapshot contains invalid identity providers.");
  return record[key].map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
function account(record) {
  if (!plain(record) || Object.keys(record).some(key => !allowedFields.has(key))) fail("The local Auth snapshot has an unsupported account shape.");
  if (typeof record.localId !== "string" || !record.localId || record.localId.length > 128 || record.localId.includes("/")) fail("The local Auth snapshot has a missing or invalid identity.");
  const createdAt = timestamp(record.createdAt, true);
  const lastLoginAt = timestamp(record.lastLoginAt, true);
  if (lastLoginAt < createdAt) fail("The local Auth snapshot contains inconsistent login timestamps.");
  const identity = {
    localId: record.localId, createdAt: String(createdAt), lastLoginAt: String(lastLoginAt),
    disabled: optionalBoolean(record, "disabled"), emailVerified: optionalBoolean(record, "emailVerified"),
    emailLinkSignin: optionalBoolean(record, "emailLinkSignin")
  };
  for (const key of identityStrings) identity[key] = optionalString(record, key);
  for (const key of identityArrays) identity[key] = identityArray(record, key);
  let claims = {};
  if (Object.hasOwn(record, "customAttributes")) {
    if (typeof record.customAttributes !== "string" || !record.customAttributes || Buffer.byteLength(record.customAttributes, "utf8") > 1000) fail("The local Auth snapshot contains invalid custom claims.");
    try { claims = JSON.parse(record.customAttributes); }
    catch { fail("The local Auth snapshot contains invalid custom claims."); }
    if (!plain(claims)) fail("The local Auth snapshot contains invalid custom claims.");
  }
  identity.customAttributes = canonical(claims);
  if (Object.hasOwn(record, "lastRefreshAt") && (typeof record.lastRefreshAt !== "string" || !Number.isFinite(Date.parse(record.lastRefreshAt)))) fail("The local Auth snapshot contains an invalid refresh timestamp.");
  if (Object.hasOwn(record, "passwordUpdatedAt") && (typeof record.passwordUpdatedAt !== "number" || !Number.isSafeInteger(record.passwordUpdatedAt) || record.passwordUpdatedAt < 0)) fail("The local Auth snapshot contains an invalid password timestamp.");
  // Import and token refresh can change these two timestamps without changing the
  // saved identity or revocation boundary. All other supported account fields are compared.
  let validSince;
  if (Object.hasOwn(record, "validSince")) {
    validSince = String(timestamp(record.validSince));
  } else {
    const anonymous = !identity.email && !identity.phoneNumber && !identity.passwordHash && !identity.salt
      && !identity.tenantId && !identity.initialEmail && !identity.emailLinkSignin && !identity.emailVerified
      && identityArrays.every(key => identity[key].length === 0) && Object.keys(identity.customAttributes).length === 0;
    if (!anonymous) fail("A non-anonymous local account is missing its saved revocation boundary.");
    // New anonymous users legitimately omit validSince. Their creation time is
    // the conservative earliest authentication boundary, at JWT second precision.
    // This cannot revive a token from before the identity existed, and never uses a blanket zero.
    validSince = String(Math.floor(createdAt / 1000));
    if (validSince === "0") fail("The anonymous local account has no usable creation boundary.");
  }
  return { identity, validSince };
}

function accounts(users) {
  if (!Array.isArray(users) || users.length > maximumUsers) fail("The local Auth snapshot has a missing or oversized account list.");
  const values = users.map(account).sort((left, right) => left.identity.localId.localeCompare(right.identity.localId));
  if (new Set(values.map(value => value.identity.localId)).size !== values.length) fail("The local Auth snapshot contains duplicate identities.");
  return values;
}

/** Sensitive normalized records for hashing only. Never log or return these records to a browser. */
export function authValidityState(users) {
  return accounts(users).map(({ identity, validSince }) => ({ ...identity, validSince }));
}

/**
 * Return minimal accounts:update bodies for an exact verified snapshot/import pair.
 * Explicit saved boundaries are copied exactly, including zero only when it was
 * explicitly recorded. New anonymous records use the verified creation boundary.
 * No account, password, claim, disabled flag, ownership or login time is changed.
 */
export function planAuthValidityRestore(savedUsers, currentUsers) {
  const saved = accounts(savedUsers);
  const current = accounts(currentUsers);
  if (saved.length !== current.length || saved.some((value, index) => value.identity.localId !== current[index]?.identity.localId)) {
    fail("The running Auth identities do not match the verified snapshot.");
  }
  const updates = [];
  for (let index = 0; index < saved.length; index++) {
    const expected = saved[index];
    const actual = current[index];
    if (JSON.stringify(expected.identity) !== JSON.stringify(actual.identity)) fail("A running Auth identity differs from the verified snapshot.");
    if (Number(actual.validSince) < Number(expected.validSince)) fail("The running Auth revocation boundary is inconsistent with an imported snapshot.");
    if (actual.validSince !== expected.validSince) updates.push({ localId: expected.identity.localId, validSince: expected.validSince });
  }
  return updates;
}
