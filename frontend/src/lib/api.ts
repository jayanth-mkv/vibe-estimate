import { clientAuth } from "./firebase";
import type { Health, Project } from "./types";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

async function request(path: string, options?: RequestInit, plain = false) {
  const user = clientAuth().currentUser;
  if (!user) throw new Error("Your session has ended. Sign in and try again.");
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers, Authorization: `Bearer ${await user.getIdToken()}` }, signal: AbortSignal.timeout(65000), cache: "no-store" });
  } catch { throw new Error("Could not reach the project service. Check that it is running, then try again. Your inputs are still here."); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || "This action could not be completed. Please try again.");
  }
  return plain ? response.text() : response.json();
}

export const api = {
  health: async (): Promise<Health> => {
    const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error("Project service unavailable");
    return response.json();
  },
  list: (): Promise<{ projects: Project[] }> => request("/api/projects"),
  project: (id: string): Promise<{ project: Project }> => request(`/api/projects/${encodeURIComponent(id)}`),
  create: (body: { name: string; scope: string; messages: string }): Promise<{ project: Project }> => request("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  analyze: (id: string, clarification?: string): Promise<{ project: Project }> => request(`/api/projects/${encodeURIComponent(id)}/analyze`, { method: "POST", body: JSON.stringify({ clarification }) }),
  propose: (id: string, body: { quantity: number; unitPricePaise: number; requestId: string; description?: string }): Promise<{ project: Project }> => request(`/api/projects/${encodeURIComponent(id)}/proposals`, { method: "POST", body: JSON.stringify(body) }),
  export: (id: string): Promise<string> => request(`/api/projects/${encodeURIComponent(id)}/export`, undefined, true),
};
