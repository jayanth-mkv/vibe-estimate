import { clientAuth } from "./firebase";
import type { Health, Project } from "./types";
import { serviceRequest, serviceUrl } from "./service-request";

async function request(path: string, options?: RequestInit, plain = false) {
  return serviceRequest(path, clientAuth().currentUser, options, plain);
}

export const api = {
  health: async (): Promise<Health> => {
    const response = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
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
