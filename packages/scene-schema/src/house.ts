import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const mm = z.number().int().min(-100_000).max(100_000);
const dimension = z.number().int().min(50).max(30_000);
const position = z.tuple([mm, mm, mm]);
const dimensions = z.tuple([dimension, dimension, dimension]);
const point = z.tuple([mm, mm]);
export const houseMaterialSchema = z.strictObject({ id, name: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), roughness: z.number().min(0).max(1) });
export const houseRoomSchema = z.strictObject({ id, name: z.string().min(1).max(80), x: mm, z: mm, width: dimension, depth: dimension, floorMaterialId: id });
export const houseWallSchema = z.strictObject({ id, start: point, end: point, thickness: z.number().int().min(100).max(400), height: dimension, frontRoomId: id.nullable(), backRoomId: id.nullable(), frontMaterialId: id, backMaterialId: id });
export const houseOpeningSchema = z.strictObject({ id, wallId: id, kind: z.enum(['door', 'window']), offset: mm, width: dimension, height: dimension, sill: z.number().int().min(0).max(10_000) });
export const lightStateSchema = z.strictObject({ enabled: z.boolean(), intensity: z.number().int().min(0).max(100), temperature: z.enum(['warm', 'neutral', 'cool']) });
export const houseInstanceSchema = z.strictObject({ id, roomId: id, catalogId: id, position, rotation: z.number().int().min(0).max(359), dimensions, materialId: id, locked: z.boolean(), light: lightStateSchema.optional() });
export const houseDocumentSchema = z.strictObject({
  schemaVersion: z.literal(2), id, name: z.string().min(1).max(80), units: z.literal('mm'), axes: z.literal('x-east-y-up-z-south'),
  level: z.strictObject({ id, name: z.string().min(1).max(80), elevation: z.literal(0), ceilingHeight: z.number().int().min(2200).max(4000), ceilingProvenance: z.literal('assumed') }),
  rooms: z.array(houseRoomSchema).min(1).max(8), walls: z.array(houseWallSchema).min(4).max(48), openings: z.array(houseOpeningSchema).max(32),
  materials: z.array(houseMaterialSchema).min(1).max(24), instances: z.array(houseInstanceSchema).max(64),
});
export type HouseDocument = z.infer<typeof houseDocumentSchema>;
export type HouseRoom = z.infer<typeof houseRoomSchema>;
export type HouseWall = z.infer<typeof houseWallSchema>;
export type HouseInstance = z.infer<typeof houseInstanceSchema>;
export type LightState = z.infer<typeof lightStateSchema>;
export type CatalogEntry = { id: string; name: string; kind: 'furniture' | 'light'; mount: 'floor' | 'ceiling'; dimensions: [number, number, number]; resizable: boolean; modelPath: string; thumbnailPath: string; lightOffset?: [number, number, number] };

export const catalog: readonly CatalogEntry[] = [
  { id: 'sofa', name: 'Two-seat sofa', kind: 'furniture', mount: 'floor', dimensions: [2200, 850, 900], resizable: false, modelPath: '/models/sofa.glb', thumbnailPath: '/models/sofa.png' },
  { id: 'table', name: 'Dining table', kind: 'furniture', mount: 'floor', dimensions: [1400, 750, 800], resizable: true, modelPath: '/models/table.glb', thumbnailPath: '/models/table.png' },
  { id: 'chair', name: 'Dining chair', kind: 'furniture', mount: 'floor', dimensions: [500, 900, 550], resizable: false, modelPath: '/models/chair.glb', thumbnailPath: '/models/chair.png' },
  { id: 'bed', name: 'Double bed', kind: 'furniture', mount: 'floor', dimensions: [1600, 650, 2100], resizable: false, modelPath: '/models/bed.glb', thumbnailPath: '/models/bed.png' },
  { id: 'cabinet', name: 'Storage cabinet', kind: 'furniture', mount: 'floor', dimensions: [1200, 2100, 500], resizable: true, modelPath: '/models/cabinet.glb', thumbnailPath: '/models/cabinet.png' },
  { id: 'pendant', name: 'Ceiling pendant', kind: 'light', mount: 'ceiling', dimensions: [400, 300, 400], resizable: false, modelPath: '/models/pendant.glb', thumbnailPath: '/models/pendant.png', lightOffset: [0, -50, 0] },
  { id: 'floor-lamp', name: 'Floor lamp', kind: 'light', mount: 'floor', dimensions: [400, 1600, 400], resizable: false, modelPath: '/models/floor-lamp.glb', thumbnailPath: '/models/floor-lamp.png', lightOffset: [0, 1350, 0] },
];

const region = z.strictObject({ roomId: id, x: mm, z: mm, width: dimension, depth: dimension });
export const houseScopeSchema = z.strictObject({ selectedIds: z.array(id).max(64), region: region.optional() });
export type HouseScope = z.infer<typeof houseScopeSchema>;
const target = { entityId: id };
export const houseOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('place'), instance: houseInstanceSchema }),
  z.strictObject({ op: z.literal('move'), ...target, position }),
  z.strictObject({ op: z.literal('rotate'), ...target, rotation: z.number().int().min(0).max(359) }),
  z.strictObject({ op: z.literal('resize'), ...target, dimensions }),
  z.strictObject({ op: z.literal('replace'), ...target, catalogId: id }),
  z.strictObject({ op: z.literal('remove'), ...target }),
  z.strictObject({ op: z.literal('setMaterial'), ...target, surface: z.enum(['body', 'floor', 'front', 'back']), materialId: id }),
  z.strictObject({ op: z.literal('setLight'), ...target, light: lightStateSchema }),
  z.strictObject({ op: z.literal('planMoveOpening'), ...target, offset: mm }),
]);
export const housePatchSchema = z.strictObject({ schemaVersion: z.literal(2), operations: z.array(houseOperationSchema).min(1).max(8) });
export type HousePatch = z.infer<typeof housePatchSchema>;
export type HouseOperation = z.infer<typeof houseOperationSchema>;
