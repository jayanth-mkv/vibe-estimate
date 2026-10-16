import { clientAuth, type SessionIdentity } from "./firebase";
import { serviceRequest } from "./service-request";

export type TrashItem = { kind: "home" | "room"; id: string; name: string; deletedAt: string; trashId: string; roomId?: string };
export type TrashTarget = { kind: "home"; id: string; name: string; baseRevisionId: string | null; roomId?: string | null } | { kind: "room"; id: string; name: string };
export type RestoredItem = { kind: "home" | "room"; id: string; roomId?: string };

export function makeTrashApi(identity: SessionIdentity = "designer") {
  function request<T>(path: string, body?: object): Promise<T> {
    return serviceRequest(path, clientAuth(identity).currentUser, {
      method: body ? "POST" : "GET", ...(body ? { body: JSON.stringify(body) } : {}),
    }) as Promise<T>;
  }
  return {
    list: () => request<{ items: TrashItem[] }>("/api/trash"),
    move: (target: TrashTarget, requestId: string) => request<{ item: TrashItem }>(
      `/api/${target.kind === "home" ? "homes" : "rooms"}/${encodeURIComponent(target.id)}/trash`,
      { requestId, ...(target.kind === "home" ? { baseRevisionId: target.baseRevisionId } : {}) },
    ),
    restore: (item: TrashItem, requestId: string) => request<RestoredItem>("/api/trash/restore", {
      kind: item.kind, id: item.id, trashId: item.trashId, requestId,
    }),
  };
}

export function restoredItemHref(item: RestoredItem) {
  return item.kind === "room" || item.roomId ? `/rooms/${encodeURIComponent(item.roomId ?? item.id)}` : `/projects/${encodeURIComponent(item.id)}`;
}
