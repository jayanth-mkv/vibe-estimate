import type { Credential } from "firebase-admin/app";
import { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import { obtainNamedProfileToken } from "./vertex-auth.js";
import { validateNamedGcloudTarget, type NamedGcloudTarget } from "./vertex-config.js";

export const CONNECTED_REFRESH_SKEW_MS = 60000;
export const CONNECTED_AUTH_FAILURE_COOLDOWN_MS = 10000;
const maximumTokenLifetimeMs = 65 * 60 * 1000;
const unavailable = () => new AppError(503, "CONNECTED_AUTH_UNAVAILABLE", "The connected workspace sign-in could not be verified. Your change was not confirmed saved. Check the local connection and retry.");
export type ConnectedToken = { accessToken: string; expiresAt: number };
export type TokenMetadata = { expiry_date: number; scopes: string[]; email?: string };
export type ConnectedTokenDependencies = {
  obtain?: (target: NamedGcloudTarget, env: NodeJS.ProcessEnv) => Promise<string>;
  inspect?: (accessToken: string) => Promise<TokenMetadata>;
  clock?: () => number;
  env?: NodeJS.ProcessEnv;
};

export function connectedAuthTarget(config: AppConfig) {
  if (config.appEnv !== "connected" || config.aiProvider !== "gemini" || !config.projectId || config.projectId.startsWith("demo-") || !config.firestoreDatabaseId
    || config.authEmulatorHost !== undefined || config.firestoreEmulatorHost !== undefined) throw new Error("Connected Firebase requires explicit real resources and named-profile authentication.");
  return validateNamedGcloudTarget({
    projectId: config.connectedAuthProjectId, gcloudConfiguration: config.connectedAuthGcloudConfiguration,
    gcloudAccount: config.connectedAuthGcloudAccount, gcloudConfigDir: config.connectedAuthGcloudConfigDir
  });
}

export function createTokenInspector() {
  const client = new OAuth2Client({ transporterOptions: { timeout: 10000, retry: false } });
  // getTokenInfo adds its own retry configuration. Override it on the actual
  // request so a credential check has one bounded attempt and keeps the token
  // exclusively in the Authorization header, as implemented by the SDK.
  client.transporter.interceptors.request.add({ resolved: async options => ({ ...options, timeout: 10000, retry: false }) });
  return (accessToken: string) => client.getTokenInfo(accessToken);
}

/** Shared, short-lived, single-flight memory cache. No ADC or refresh-token persistence. */
export class ConnectedTokenSource {
  #cached?: ConnectedToken;
  #pending?: Promise<ConnectedToken>;
  #retryAfter = 0;
  #target: NamedGcloudTarget;
  #obtain: NonNullable<ConnectedTokenDependencies["obtain"]>;
  #inspect: NonNullable<ConnectedTokenDependencies["inspect"]>;
  #clock: () => number;
  #env: NodeJS.ProcessEnv;
  constructor(config: AppConfig, dependencies: ConnectedTokenDependencies = {}) {
    this.#target = connectedAuthTarget(config);
    this.#obtain = dependencies.obtain ?? ((target, env) => obtainNamedProfileToken(target, undefined, env));
    this.#inspect = dependencies.inspect ?? createTokenInspector();
    this.#clock = dependencies.clock ?? Date.now;
    this.#env = { ...(dependencies.env ?? process.env) };
    // A separately configured Developer Gemini key is not a credential for
    // Firebase. Never pass it to gcloud; all Google credential overrides remain
    // rejected by the shared named-profile verifier.
    if (config.geminiTransport === "developer") {
      for (const key of Object.keys(this.#env)) if (key.toUpperCase() === "GEMINI_API_KEY") delete this.#env[key];
    }
  }
  async getToken(): Promise<ConnectedToken> {
    const now = this.#clock();
    if (this.#cached && this.#cached.expiresAt > now + CONNECTED_REFRESH_SKEW_MS) return { ...this.#cached };
    if (this.#pending) return this.#pending;
    if (now < this.#retryAfter) throw unavailable();
    this.#pending = this.#refresh().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }
  async #refresh(): Promise<ConnectedToken> {
    try {
      const accessToken = await this.#obtain(this.#target, this.#env);
      if (!accessToken || accessToken.length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken)) throw unavailable();
      const metadata = await this.#inspect(accessToken);
      const now = this.#clock();
      if (!Number.isSafeInteger(metadata.expiry_date) || metadata.expiry_date <= now + CONNECTED_REFRESH_SKEW_MS || metadata.expiry_date > now + maximumTokenLifetimeMs
        || !Array.isArray(metadata.scopes) || !metadata.scopes.includes("https://www.googleapis.com/auth/cloud-platform")
        || metadata.email !== undefined && (typeof metadata.email !== "string" || metadata.email.toLowerCase() !== this.#target.gcloudAccount.toLowerCase())) throw unavailable();
      this.#cached = { accessToken, expiresAt: metadata.expiry_date };
      this.#retryAfter = 0;
      return { ...this.#cached };
    } catch {
      this.#cached = undefined;
      this.#retryAfter = this.#clock() + CONNECTED_AUTH_FAILURE_COOLDOWN_MS;
      // Token-info SDK errors contain request headers. Never retain a cause or log raw errors.
      throw unavailable();
    }
  }
}

export function createConnectedCredentials(config: AppConfig, dependencies: ConnectedTokenDependencies = {}) {
  const source = new ConnectedTokenSource(config, dependencies);
  const clock = dependencies.clock ?? Date.now;
  const credential: Credential = {
    getAccessToken: async () => {
      const token = await source.getToken();
      return { access_token: token.accessToken, expires_in: Math.floor((token.expiresAt - clock()) / 1000) };
    }
  };
  const authClient = new OAuth2Client({ quotaProjectId: config.projectId, eagerRefreshThresholdMillis: CONNECTED_REFRESH_SKEW_MS, forceRefreshOnFailure: false });
  authClient.refreshHandler = async () => {
    const token = await source.getToken();
    return { access_token: token.accessToken, expiry_date: token.expiresAt };
  };
  // Firestore debug settings can serialize authClient. Its default serialization
  // includes credentials, so replace it with an intentionally uninformative shape.
  Object.defineProperty(authClient, "toJSON", { value: () => ({ type: "explicit-short-lived-user-oauth" }), enumerable: false });
  return { credential, authClient };
}
