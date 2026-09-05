import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { createConnectedCredentials, type ConnectedTokenDependencies } from "./connected-auth.js";
import type { AppConfig } from "./config.js";

export const apiHost = (config: AppConfig) => config.appEnv === "production" ? "0.0.0.0" : "127.0.0.1";

export function createFirebaseRuntime(config: AppConfig, tokenDependencies?: ConnectedTokenDependencies) {
  const connected = config.appEnv === "connected" ? createConnectedCredentials(config, tokenDependencies) : undefined;
  if (connected) {
    // Admin adds x-goog-user-project for custom credentials only through this
    // process setting. Pin it to the validated Firebase resource project so
    // revocation/account checks use its enabled API and authorized quota.
    for (const key of Object.keys(process.env)) {
      if (key.toUpperCase() === "GOOGLE_CLOUD_QUOTA_PROJECT" && key !== "GOOGLE_CLOUD_QUOTA_PROJECT") delete process.env[key];
    }
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = config.projectId;
  }
  const firebase = initializeApp({
    projectId: config.projectId,
    ...(connected ? { credential: connected.credential } : config.appEnv === "production" ? { credential: applicationDefault() } : {})
  });
  // Admin getFirestore accepts only service-account/ADC credentials. Direct
  // Firestore accepts our explicit OAuth client and never discovers shared ADC.
  const firestore = connected ? new Firestore({ projectId: config.projectId, databaseId: config.firestoreDatabaseId, authClient: connected.authClient }) : getFirestore(firebase, config.firestoreDatabaseId);
  const auth = getAuth(firebase);
  return {
    firestore,
    verifyToken: (token: string) => auth.verifyIdToken(token, config.appEnv !== "local")
  };
}
