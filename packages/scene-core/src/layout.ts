import { catalog, type DesignSelection, type HouseDocument, type HouseInstance, type HouseOperation } from '@vibeestimate/scene-schema';
import { applyDesignPatch } from './design.js';
import { validateHouse, validateHousePlacement } from './house.js';
import { createInstance } from './house-fixtures.js';

/** Plan conventions: an object's back is its local -z side, so rotation 0 puts the
 * back to the north wall, 90 east, 180 south and 270 west. Coordinates are integer mm. */
type Side = 'north' | 'east' | 'south' | 'west';
const ROTATION: Record<Side, number> = { north: 0, east: 90, south: 180, west: 270 };
const GRID = 50, WALL_SNAP = 300;
const WALL_ITEMS = new Set(['sofa', 'bed', 'cabinet', 'bookcase', 'kitchen-counter', 'desk', 'toilet', 'shower']);
const CORNER_ITEMS = new Set(['floor-lamp', 'plant']);
const snap = (value: number) => Math.round(value / GRID) * GRID;
const half = (item: HouseInstance, rotation = item.rotation) => rotation % 180 === 0 ? [item.dimensions[0] / 2, item.dimensions[2] / 2] : [item.dimensions[2] / 2, item.dimensions[0] / 2];

function valid(scene: HouseDocument, operations: HouseOperation[], selection: DesignSelection) {
  try { return applyDesignPatch(scene, { schemaVersion: 2, operations }, selection); } catch { return null; }
}

export type SnappedMove = { position: [number, number, number]; rotation: number; wall: Side | null; valid: boolean; operations: HouseOperation[] };

/** Turn a dragged point into a tidy placement: grid-aligned, and back-to-wall
 * facing the room when released near a wall. Never moves an object between rooms. */
export function snapMove(scene: HouseDocument, instanceId: string, x: number, z: number): SnappedMove {
  const item = scene.instances.find(entry => entry.id === instanceId);
  if (!item) throw new Error('Select a furniture item or light.');
  const room = scene.rooms.find(entry => entry.id === item.roomId)!;
  const entry = catalog.find(candidate => candidate.id === item.catalogId)!;
  let rotation = item.rotation, wall: Side | null = null;
  let [hx, hz] = half(item);
  let px = Math.min(Math.max(snap(x), room.x + hx), room.x + room.width - hx);
  let pz = Math.min(Math.max(snap(z), room.z + hz), room.z + room.depth - hz);
  if (entry.mount === 'floor') {
    const distances: [Side, number][] = [['north', z - room.z], ['south', room.z + room.depth - z], ['west', x - room.x], ['east', room.x + room.width - x]];
    const [side, distance] = distances.sort((a, b) => a[1] - b[1])[0]!;
    const turned = ROTATION[side];
    const [tx, tz] = half(item, turned);
    if (distance - (side === 'north' || side === 'south' ? tz : tx) <= WALL_SNAP) {
      wall = side; rotation = turned; [hx, hz] = [tx, tz];
      px = Math.min(Math.max(snap(x), room.x + hx), room.x + room.width - hx);
      pz = Math.min(Math.max(snap(z), room.z + hz), room.z + room.depth - hz);
      if (side === 'north') pz = room.z + hz; else if (side === 'south') pz = room.z + room.depth - hz;
      else if (side === 'west') px = room.x + hx; else px = room.x + room.width - hx;
    }
  }
  const position: [number, number, number] = [Math.round(px), item.position[1], Math.round(pz)];
  const operations: HouseOperation[] = [{ op: 'move', entityId: item.id, position }, ...(rotation !== item.rotation ? [{ op: 'rotate' as const, entityId: item.id, rotation }] : [])];
  return { position, rotation, wall, operations, valid: Boolean(valid(scene, operations, { kind: 'object', entityId: item.id })) };
}

/** Quarter-turn an object in place; the caller saves only a valid result. */
export function rotateQuarter(scene: HouseDocument, instanceId: string) {
  const item = scene.instances.find(entry => entry.id === instanceId);
  if (!item) throw new Error('Select a furniture item or light.');
  const operations: HouseOperation[] = [{ op: 'rotate', entityId: item.id, rotation: (Math.round(item.rotation / 90) * 90 + 90) % 360 }];
  return { operations, valid: Boolean(valid(scene, operations, { kind: 'object', entityId: item.id })) };
}

type Candidate = { x: number; z: number; rotation: number; score: number };
const wallOrder = (room: HouseDocument['rooms'][number], variant: number): Side[] => {
  const sides = (['north', 'west', 'south', 'east'] as Side[]).sort((a, b) => {
    const length = (side: Side) => side === 'north' || side === 'south' ? room.width : room.depth;
    return length(b) - length(a);
  });
  return sides.map((_, index) => sides[(index + variant) % sides.length]!);
};
/** Ranked positions for one piece in one room, before validation. */
function candidatesFor(room: HouseDocument['rooms'][number], item: HouseInstance, order: Side[], index: number, variant: number): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (x: number, z: number, rotation: number, score: number) => candidates.push({ x: Math.round(x), z: Math.round(z), rotation, score });
  if (WALL_ITEMS.has(item.catalogId)) {
    for (const [rank, side] of order.entries()) {
      const rotation = ROTATION[side], [hx, hz] = half(item, rotation);
      const along = side === 'north' || side === 'south';
      const span = along ? room.width : room.depth, size = along ? hx : hz;
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const offset = Math.min(Math.max(snap(span * t), size), span - size);
        const x = along ? room.x + offset : side === 'west' ? room.x + hx : room.x + room.width - hx;
        const z = along ? (side === 'north' ? room.z + hz : room.z + room.depth - hz) : room.z + offset;
        add(x, z, rotation, 100 - rank * 20 - Math.abs(t - 0.5) * 20 - ((rank + index) % order.length === 0 ? 0 : 5));
      }
    }
  } else if (CORNER_ITEMS.has(item.catalogId)) {
    const [hx, hz] = half(item, 0), inset = 150;
    for (const [rank, [cx, cz]] of [[0, 0], [1, 0], [0, 1], [1, 1]].entries()) add(cx ? room.x + room.width - hx - inset : room.x + hx + inset, cz ? room.z + room.depth - hz - inset : room.z + hz + inset, 0, 80 - ((rank + variant) % 4) * 5);
  } else {
    for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const fz of [0.5, 0.4, 0.6, 0.3, 0.7]) add(snap(room.x + room.width * fx), snap(room.z + room.depth * fz), item.rotation % 180 === 0 ? 0 : 90, 90 - (Math.abs(fx - 0.5) + Math.abs(fz - 0.5)) * 60);
  }
  return candidates.sort((a, b) => b.score - a.score);
}

/** Pieces a room of each kind usually needs, largest first. */
export function roomKit(name: string): string[] {
  const label = name.toLowerCase();
  if (/bath|toilet|wc|shower/.test(label)) return ['shower', 'toilet'];
  if (/kitchen/.test(label)) return ['kitchen-counter', 'cabinet'];
  if (/bed/.test(label)) return ['bed', 'cabinet', 'side-table'];
  if (/study|office|work/.test(label)) return ['desk', 'bookcase', 'chair'];
  if (/dining/.test(label)) return ['table', 'chair', 'chair'];
  if (/living|lounge|family|sitting/.test(label)) return ['sofa', 'coffee-table', 'armchair', 'floor-lamp'];
  if (/hall|entr|corridor|lobby|passage|foyer/.test(label)) return ['plant'];
  return ['plant'];
}

/** Adds validated pieces to an empty room, at most `limit`. Pieces that cannot fit are skipped. */
export function furnishRoom(scene: HouseDocument, roomId: string, catalogIds = roomKit(scene.rooms.find(room => room.id === roomId)?.name ?? ''), limit = 4): HouseDocument {
  const room = scene.rooms.find(entry => entry.id === roomId);
  if (!room) throw new Error('That room is not part of this home.');
  let working = structuredClone(scene);
  const order = wallOrder(room, 0);
  for (const [index, catalogId] of catalogIds.slice(0, limit).entries()) {
    const entry = catalog.find(candidate => candidate.id === catalogId);
    if (!entry || entry.mount !== 'floor') continue;
    let n = 1; while (working.instances.some(item => item.id === `${catalogId}-${roomId}-${n}`)) n++;
    const base = createInstance(working, `${catalogId}-${roomId}-${n}`, catalogId, roomId, room.x + room.width / 2, room.z + room.depth / 2);
    for (const candidate of candidatesFor(room, base, order, index, 0)) {
      const item = { ...base, position: [candidate.x, base.position[1], candidate.z] as [number, number, number], rotation: candidate.rotation };
      try { validateHousePlacement(working, item); working = { ...working, instances: [...working.instances, item] }; break; } catch { /* Try the next ranked position. */ }
    }
  }
  return validateHouse(working);
}

export type Arrangement = { operations: HouseOperation[]; arranged: string[]; skipped: string[] };

/** Rule-based layout for one room. Large pieces go back-to-wall on the longest free
 * walls, tables near the centre and lamps or plants into corners. Every candidate
 * passes the publication validator, so nothing overlaps, leaves the room or blocks
 * a door swing. `variant` rotates the wall order to offer a different option. */
export function arrangeRoom(scene: HouseDocument, roomId: string, variant = 0): Arrangement {
  const room = scene.rooms.find(entry => entry.id === roomId);
  if (!room) throw new Error('That room is not part of this home.');
  const movable = scene.instances.filter(item => item.roomId === roomId && !item.locked && catalog.find(entry => entry.id === item.catalogId)?.mount === 'floor')
    .sort((a, b) => b.dimensions[0] * b.dimensions[2] - a.dimensions[0] * a.dimensions[2]).slice(0, 4);
  const selection: DesignSelection = { kind: 'room', roomId };
  const order = wallOrder(room, variant);
  let working: HouseDocument = structuredClone(scene);
  const operations: HouseOperation[] = [], arranged: string[] = [], skipped: string[] = [];
  // Greedy and fully validated: each piece is tested against pieces already placed
  // and untouched ones. A piece with no valid candidate keeps its saved position.
  for (const [index, item] of movable.entries()) {
    const candidates = candidatesFor(room, item, order, index, variant);
    let placed = false;
    for (const candidate of candidates) {
      const step: HouseOperation[] = [{ op: 'move', entityId: item.id, position: [candidate.x, item.position[1], candidate.z] }, ...(candidate.rotation !== item.rotation ? [{ op: 'rotate' as const, entityId: item.id, rotation: candidate.rotation }] : [])];
      const next = valid(working, step, selection);
      if (next) { working = next; operations.push(...step); arranged.push(item.id); placed = true; break; }
    }
    if (!placed) skipped.push(item.id);
  }
  return { operations: operations.slice(0, 8), arranged, skipped };
}
