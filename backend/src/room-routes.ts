import type { Express } from "express";
import { z } from "zod";
import { emptyRoomBody, roomJoinCodeSchema, roomJoinSchema, roomMessageSchema, roomNotFound, roomObserverSchema } from "./room-domain.js";
import type { RoomStore } from "./room-store.js";
import { publicProject } from "./types.js";

/** Register after shared Firebase authentication/rate limiting and before the 404/error handlers. */
export function registerRoomRoutes(app: Express, store: RoomStore) {
  app.param("roomId", (_request, _response, next, value: string) => {
    if (!z.string().uuid().safeParse(value).success) { next(roomNotFound()); return; }
    next();
  });
  app.post("/api/projects/:id/room", async (request, response) => {
    emptyRoomBody.parse(request.body ?? {});
    const result = await store.create(response.locals.uid as string, request.params.id as string);
    response.json(result);
  });
  app.get("/api/rooms/:roomId", async (request, response) => {
    response.json({ room: await store.get(response.locals.uid as string, request.params.roomId as string) });
  });
  app.post("/api/rooms/:roomId/invite", async (request, response) => {
    emptyRoomBody.parse(request.body ?? {});
    response.json(await store.invite(response.locals.uid as string, request.params.roomId as string));
  });
  app.post("/api/rooms/join", async (request, response) => {
    const input = roomJoinCodeSchema.parse(request.body);
    response.json({ room: await store.joinCode(response.locals.uid as string, input.joinCode) });
  });
  app.post("/api/rooms/:roomId/join", async (request, response) => {
    const input = roomJoinSchema.parse(request.body);
    response.json({ room: await store.join(response.locals.uid as string, request.params.roomId as string, input.inviteToken) });
  });
  app.post("/api/rooms/:roomId/messages", async (request, response) => {
    const input = roomMessageSchema.parse(request.body);
    response.json({ room: await store.message(response.locals.uid as string, request.params.roomId as string, input) });
  });
  app.post("/api/rooms/:roomId/observer", async (request, response) => {
    const input = roomObserverSchema.parse(request.body);
    response.json({ room: await store.control(response.locals.uid as string, request.params.roomId as string, input.action) });
  });
  app.post("/api/rooms/:roomId/prepare-draft", async (request, response) => {
    emptyRoomBody.parse(request.body ?? {});
    response.json({ project: publicProject(await store.prepare(response.locals.uid as string, request.params.roomId as string)) });
  });
  app.post("/api/rooms/:roomId/share-draft", async (request, response) => {
    emptyRoomBody.parse(request.body ?? {});
    response.json({ room: await store.share(response.locals.uid as string, request.params.roomId as string) });
  });
}
