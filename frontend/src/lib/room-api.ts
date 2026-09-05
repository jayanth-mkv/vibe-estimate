import { clientAuth, type SessionIdentity } from "./firebase";
import type { Room } from "./room-types";
import type { Project } from "./types";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

export function makeRoomApi(identity: SessionIdentity = "designer") {
  async function request<T>(path: string, body?: object): Promise<T> {
    const user = clientAuth(identity).currentUser;
    if (!user) throw new Error("Your session has ended. Sign in to reconnect to the room.");
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
    } catch {
      throw new Error("The room could not be reached. Your message is still here. Check your connection and retry.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || "The room could not complete that action. Please try again.");
    }
    return response.json() as Promise<T>;
  }
  const roomPath = (id: string) => `/api/rooms/${encodeURIComponent(id)}`;
  return {
    create: (projectId: string) => request<{ room: Room; inviteToken: string }>(`/api/projects/${encodeURIComponent(projectId)}/room`, {}),
    get: (id: string) => request<{ room: Room }>(roomPath(id)),
    invite: (id: string) => request<{ inviteToken: string }>(`${roomPath(id)}/invite`, {}),
    join: (id: string, inviteToken: string) => request<{ room: Room }>(`${roomPath(id)}/join`, { inviteToken }),
    send: (id: string, text: string, requestId: string) => request<{ room: Room }>(`${roomPath(id)}/messages`, { text, requestId }),
    observer: (id: string, action: "retry" | "pause" | "resume") => request<{ room: Room }>(`${roomPath(id)}/observer`, { action }),
    prepareDraft: (id: string) => request<{ project: Project }>(`${roomPath(id)}/prepare-draft`, {}),
    shareDraft: (id: string) => request<{ room: Room }>(`${roomPath(id)}/share-draft`, {}),
  };
}

export const roomApi = makeRoomApi();
