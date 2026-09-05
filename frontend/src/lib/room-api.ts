import { clientAuth, type SessionIdentity } from "./firebase";
import type { Room } from "./room-types";
import type { Project } from "./types";
import { serviceRequest } from "./service-request";

export function makeRoomApi(identity: SessionIdentity = "designer") {
  async function request<T>(path: string, body?: object): Promise<T> {
    return serviceRequest(path, clientAuth(identity).currentUser, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }) as Promise<T>;
  }
  const roomPath = (id: string) => `/api/rooms/${encodeURIComponent(id)}`;
  return {
    create: (projectId: string) => request<{ room: Room; inviteToken: string; joinCode: string }>(`/api/projects/${encodeURIComponent(projectId)}/room`, {}),
    get: (id: string) => request<{ room: Room }>(roomPath(id)),
    invite: (id: string) => request<{ inviteToken: string; joinCode: string }>(`${roomPath(id)}/invite`, {}),
    join: (id: string, inviteToken: string) => request<{ room: Room }>(`${roomPath(id)}/join`, { inviteToken }),
    joinCode: (joinCode: string) => request<{ room: Room }>("/api/rooms/join", { joinCode }),
    send: (id: string, text: string, requestId: string) => request<{ room: Room }>(`${roomPath(id)}/messages`, { text, requestId }),
    observer: (id: string, action: "retry" | "pause" | "resume") => request<{ room: Room }>(`${roomPath(id)}/observer`, { action }),
    prepareDraft: (id: string) => request<{ project: Project }>(`${roomPath(id)}/prepare-draft`, {}),
    shareDraft: (id: string) => request<{ room: Room }>(`${roomPath(id)}/share-draft`, {}),
  };
}

export const roomApi = makeRoomApi();
