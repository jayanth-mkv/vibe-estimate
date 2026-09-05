import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "./config.js";
import { obtainLocalVertexToken } from "./vertex-auth.js";
import { validateVertexTarget, type LocalVertexTarget } from "./vertex-config.js";

export function localVertexTarget(config: AppConfig): LocalVertexTarget {
  if (!["local", "connected"].includes(config.appEnv) || config.aiProvider !== "gemini" || config.geminiTransport !== "vertex" || !config.geminiModel || config.geminiApiKey) {
    throw new Error("Vertex transport requires an explicit local or connected Gemini configuration without an API key.");
  }
  return validateVertexTarget({
    projectId: config.vertexProjectId, location: config.vertexLocation,
    gcloudConfiguration: config.vertexGcloudConfiguration, gcloudAccount: config.vertexGcloudAccount,
    gcloudConfigDir: config.vertexGcloudConfigDir
  });
}

export async function createLocalVertexClient(
  config: AppConfig,
  tokenProvider: (target: LocalVertexTarget) => Promise<string> = obtainLocalVertexToken
): Promise<GoogleGenAI> {
  const target = localVertexTarget(config);
  const accessToken = await tokenProvider(target);
  const authClient = new OAuth2Client();
  authClient.quotaProjectId = target.projectId;
  authClient.setCredentials({ access_token: accessToken, token_type: "Bearer" });
  // An explicit OAuth2Client prevents SDK ADC discovery, refresh-token storage,
  // service-account impersonation, and accidental use of another project.
  return new GoogleGenAI({
    enterprise: true, vertexai: true, project: target.projectId, location: target.location,
    googleAuthOptions: { authClient, projectId: target.projectId },
    httpOptions: { timeout: 30000, apiVersion: "v1" }
  });
}
