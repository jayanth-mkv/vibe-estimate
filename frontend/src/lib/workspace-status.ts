import type { Health } from "./types";

export function workspaceStatus(health: Health | null): string {
  if (!health) return "Workspace connection unavailable";
  const storage = health.storageConnection === "cloud" ? "Cloud workspace" : health.aiProvider === "fixture" ? "Local sample" : "Local workspace";
  return `${storage} · ${health.aiProvider === "gemini" ? "Gemini enabled" : "Gemini not connected"}`;
}
