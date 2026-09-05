import type { Room } from "./room-types";

export type GoogleRoomIdentity = `client-google:${string}`;
export type ClientRoomIdentity = "client" | GoogleRoomIdentity;
type SelectionStorage = Pick<Storage, "getItem" | "setItem">;
const memorySelections = new Set<string>();

function checkedRoomId(roomId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId)) {
    throw new Error("This room link is incomplete. Open the invitation your designer shared.");
  }
  return roomId.toLowerCase();
}

export function recoveryIdentity(roomId: string): GoogleRoomIdentity {
  return `client-google:${checkedRoomId(roomId)}`;
}

function selectionKey(roomId: string) {
  return `vibeestimate:client-room:${checkedRoomId(roomId)}:access`;
}

function browserStorage(): SelectionStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

export function selectedClientIdentity(roomId: string, storage = browserStorage()): ClientRoomIdentity {
  const key = selectionKey(roomId);
  if (memorySelections.has(key)) return recoveryIdentity(roomId);
  try { if (storage?.getItem(key) === "google") return recoveryIdentity(roomId); }
  catch { /* An unavailable preference store is not room authorization. */ }
  return "client";
}

export function rememberGoogleRoom(roomId: string, storage = browserStorage()): boolean {
  const key = selectionKey(roomId);
  // Store only an app selector. Firebase's SDK continues to own credentials;
  // the server must authorize the selected identity on every room request.
  memorySelections.add(key);
  try { if (storage) { storage.setItem(key, "google"); return true; } }
  catch { /* The current tab can continue; a later visit may need recovery. */ }
  return false;
}

interface RecoverySteps {
  authenticate: (identity: GoogleRoomIdentity) => Promise<unknown>;
  readRoom: (identity: GoogleRoomIdentity, roomId: string) => Promise<{ room: Room }>;
  remember?: (roomId: string) => boolean;
}

export function verifiedClientRoom(roomId: string, room: Room): Room {
  if (room.id !== roomId || room.role !== "client") {
    throw new Error("That Google account is not the client in this room. Choose the account you linked, or keep using your guest browser.");
  }
  return room;
}

export async function recoverClientRoom(roomId: string, steps: RecoverySteps) {
  const identity = recoveryIdentity(roomId);
  await steps.authenticate(identity);
  const result = await steps.readRoom(identity, roomId);
  verifiedClientRoom(roomId, result.room);
  // Remember a choice only after the same authenticated identity has been
  // authorized as the client. No guest sign-out or account switch is involved.
  const remembered = (steps.remember ?? rememberGoogleRoom)(roomId);
  return { room: result.room, identity, remembered };
}
