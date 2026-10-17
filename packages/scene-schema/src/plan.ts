import { z } from 'zod';

/** What a vision model may report about a floor-plan image. Coordinates use the
 * model's native 0–1000 normalized frame, [y, x] order, origin top-left. The model
 * never supplies millimetres, IDs, scale or geometry; code derives all of those. */
const unit = z.number().int().min(0).max(1000);
const box = z.tuple([unit, unit, unit, unit]);
const point = z.tuple([unit, unit]);
export const planReadingSchema = z.strictObject({
  rooms: z.array(z.strictObject({ label: z.string().trim().min(1).max(60), box })).min(1).max(8),
  doors: z.array(z.strictObject({ point, rooms: z.array(z.number().int().min(-1).max(7)).min(1).max(2) })).max(16),
  windows: z.array(z.strictObject({ point, room: z.number().int().min(0).max(7) })).max(16),
  texts: z.array(z.strictObject({ text: z.string().trim().min(1).max(40), box })).max(40),
  notes: z.array(z.string().trim().min(1).max(160)).max(5),
});
export type PlanReading = z.infer<typeof planReadingSchema>;

/** The person's confirmation: room names and a chosen scale, never typed geometry. */
export const planConfirmationSchema = z.strictObject({
  names: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  removedRooms: z.array(z.number().int().min(0).max(7)).max(7),
  mmPerPixel: z.number().min(0.5).max(200),
  furnish: z.boolean(),
});
export type PlanConfirmation = z.infer<typeof planConfirmationSchema>;
