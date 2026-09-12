import { z } from "zod";
import type { AppConfig } from "./config.js";

export const ROOM_OUTBOX_COLLECTION = "roomReviewOutbox";
export const ROOM_DELIVERY_TIMEOUT_MS = 10 * 60 * 1000;
export const roomDeliverySchema = z.object({
  id: z.string().uuid(), roomId: z.string().uuid(), ownerId: z.string().min(1).max(128),
  createdAt: z.number().int().nonnegative(), deadline: z.number().int().nonnegative(),
  status: z.enum(["pending", "completed", "failed"]),
}).strict();
export type RoomDelivery = z.infer<typeof roomDeliverySchema>;

/** The workflow supplies routing metadata only. Sources and model inputs are read from owned storage. */
export function outboxEventId(body: unknown, config: Pick<AppConfig, "projectId" | "firestoreDatabaseId">) {
  const event = z.object({
    id: z.string().min(1).max(256),
    source: z.literal(`//firestore.googleapis.com/projects/${config.projectId}/databases/${config.firestoreDatabaseId}`),
    subject: z.string(), type: z.literal("google.cloud.firestore.document.v1.created"),
  }).strict().parse(body);
  const prefix = `documents/${ROOM_OUTBOX_COLLECTION}/`;
  return z.string().uuid().parse(event.subject.startsWith(prefix) ? event.subject.slice(prefix.length) : "");
}
