import { describe, expect, it, vi } from "vitest";
import { recoverClientRoom, recoveryIdentity, rememberGoogleRoom, selectedClientIdentity, verifiedClientRoom } from "../src/lib/client-room-access";
import type { Room } from "../src/lib/room-types";

const firstRoom = "d947f039-ef17-476d-af87-25dba2073685";
const secondRoom = "f047f039-ef17-476d-af87-25dba2073685";
const room = { id: firstRoom, role: "client" } as Room;

describe("isolated client room recovery", () => {
  it("authenticates a separate per-room identity and verifies membership before remembering it", async () => {
    const operations: string[] = [];
    const result = await recoverClientRoom(firstRoom, {
      authenticate: async (identity) => { operations.push(`authenticate:${identity}`); },
      readRoom: async (identity, id) => { operations.push(`read:${identity}:${id}`); return { room }; },
      remember: (id) => { operations.push(`remember:${id}`); return true; },
    });
    expect(operations).toEqual([
      `authenticate:client-google:${firstRoom}`,
      `read:client-google:${firstRoom}:${firstRoom}`,
      `remember:${firstRoom}`,
    ]);
    expect(result.identity).not.toBe("client");
    expect(recoveryIdentity(secondRoom)).not.toBe(result.identity);
    expect(result.room).toBe(room);
  });

  it.each(["popup cancelled", "provider unavailable"])("keeps the selection untouched when %s", async (message) => {
    const readRoom = vi.fn();
    const remember = vi.fn();
    await expect(recoverClientRoom(firstRoom, {
      authenticate: async () => { throw new Error(message); }, readRoom, remember,
    })).rejects.toThrow(message);
    expect(readRoom).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });

  it.each(["Not a room member", "Room service unavailable"])("does not select an identity when room access fails: %s", async (message) => {
    const remember = vi.fn();
    await expect(recoverClientRoom(firstRoom, {
      authenticate: async () => undefined,
      readRoom: async () => { throw new Error(message); }, remember,
    })).rejects.toThrow(message);
    expect(remember).not.toHaveBeenCalled();
  });

  it.each([
    { ...room, role: "designer" },
    { ...room, id: secondRoom },
  ])("rejects a Google identity authorized for a different room or role", async (returnedRoom) => {
    const remember = vi.fn();
    await expect(recoverClientRoom(firstRoom, {
      authenticate: async () => undefined,
      readRoom: async () => ({ room: returnedRoom as Room }), remember,
    })).rejects.toThrow("not the client");
    expect(remember).not.toHaveBeenCalled();
  });

  it("ignores unrecognized preferences and defaults to the existing client guest", () => {
    expect(selectedClientIdentity(firstRoom, { getItem: () => "designer", setItem: vi.fn() })).toBe("client");
    expect(selectedClientIdentity(firstRoom, { getItem: () => "client-google:other-room", setItem: vi.fn() })).toBe("client");
  });

  it("rechecks the room and client role when a remembered identity is restored or polled", () => {
    expect(verifiedClientRoom(firstRoom, room)).toBe(room);
    expect(() => verifiedClientRoom(firstRoom, { ...room, role: "designer" })).toThrow("not the client");
    expect(() => verifiedClientRoom(secondRoom, room)).toThrow("not the client");
  });

  it("stores only a per-room app selector and reports when the browser cannot retain it", () => {
    const getItem = vi.fn(() => "google");
    expect(selectedClientIdentity(secondRoom, { getItem, setItem: vi.fn() })).toBe(`client-google:${secondRoom}`);
    const setItem = vi.fn();
    expect(rememberGoogleRoom(secondRoom, { getItem, setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(`vibeestimate:client-room:${secondRoom}:access`, "google");
    const thirdRoom = "f947f039-ef17-476d-af87-25dba2073685";
    expect(rememberGoogleRoom(thirdRoom, { getItem, setItem: () => { throw new Error("Blocked"); } })).toBe(false);
    expect(selectedClientIdentity(thirdRoom, { getItem: () => null, setItem })).toBe(`client-google:${thirdRoom}`);
  });

  it("rejects malformed room identifiers before opening an authentication prompt", async () => {
    const authenticate = vi.fn();
    await expect(recoverClientRoom("invalid", { authenticate, readRoom: vi.fn() })).rejects.toThrow("room link is incomplete");
    expect(authenticate).not.toHaveBeenCalled();
  });
});
