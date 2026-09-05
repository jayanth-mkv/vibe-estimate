import type { RoomDatabase, RoomTransaction } from "../src/room-store.js";
import type { RoomOwner, StoredRoom } from "../src/room-types.js";
import type { StoredProject } from "../src/types.js";
import { MemoryProjectStore } from "./helpers.js";

/** Serial, rollback-capable transaction double. Runtime browser tests exercise the Firestore adapter. */
export class MemoryRoomDatabase implements RoomDatabase {
  rooms = new Map<string, StoredRoom>();
  owners = new Map<string, RoomOwner>();
  private tail: Promise<unknown> = Promise.resolve();
  failNext = false;
  constructor(readonly projects: MemoryProjectStore) {}
  transaction<T>(operation: (transaction: RoomTransaction) => Promise<T>): Promise<T> {
    const execute = async () => {
      if (this.failNext) { this.failNext = false; throw new Error("private database connection detail"); }
      const rooms = new Map<string, StoredRoom>();
      const owners = new Map<string, RoomOwner>();
      const projects = new Map<string, StoredProject>();
      const value = await operation({
        getRoom: async id => structuredClone(this.rooms.get(id)),
        putRoom: room => { rooms.set(room.id, structuredClone(room)); },
        getOwner: async uid => structuredClone(this.owners.get(uid) ?? { projects: {} }),
        putOwner: (uid, owner) => { owners.set(uid, structuredClone(owner)); },
        getProject: async (uid, id) => {
          const project = this.projects.projects.get(id);
          return project?.ownerId === uid ? structuredClone(project) : undefined;
        },
        putProject: project => { projects.set(project.id, structuredClone(project)); }
      });
      for (const [key, room] of rooms) this.rooms.set(key, room);
      for (const [key, owner] of owners) this.owners.set(key, owner);
      for (const [key, project] of projects) this.projects.projects.set(key, project);
      return structuredClone(value);
    };
    const result = this.tail.then(execute, execute);
    this.tail = result.catch(() => {});
    return result;
  }
  async scheduledIds() { return [...this.rooms.values()].filter(room => ["queued", "thinking"].includes(room.observer.status)).map(room => room.id); }
}
