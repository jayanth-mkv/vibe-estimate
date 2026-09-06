import { z } from 'zod';
import { houseOperationSchema, lightStateSchema } from './house.js';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const designSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('home') }),
  z.strictObject({ kind: z.literal('room'), roomId: id }),
  z.strictObject({ kind: z.literal('object'), entityId: id }),
  z.strictObject({ kind: z.literal('surface'), entityId: id, surface: z.enum(['front', 'back', 'floor', 'body']) }),
  z.strictObject({ kind: z.literal('region'), roomId: id, x: z.number().int(), z: z.number().int(), width: z.number().int().min(50).max(30000), depth: z.number().int().min(50).max(30000) }),
]);
export type DesignSelection = z.infer<typeof designSelectionSchema>;

// The model chooses host-generated placements. It cannot supply an asset URL,
// mounting height, instance ID, owner, selected scope or revision authority.
const editOperations = houseOperationSchema.options.filter(option => !['place', 'planMoveOpening'].includes(option.shape.op.value));
export const designResponseSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(1200),
  operations: z.array(z.union([
    z.strictObject({ op: z.literal('place'), placementId: id, materialId: id, light: lightStateSchema.optional() }),
    ...editOperations,
  ])).min(1).max(8),
});
export type DesignResponse = z.infer<typeof designResponseSchema>;
