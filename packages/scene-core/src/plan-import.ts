import type { HouseDocument, PlanConfirmation, PlanReading } from '@vibeestimate/scene-schema';
import { planConfirmationSchema, planReadingSchema } from '@vibeestimate/scene-schema';
import { validateHouse } from './house.js';
import { structure } from './house-fixtures.js';
import { furnishRoom } from './layout.js';

/** Floor-plan import. A model reports what it sees (boxes, door points, verbatim
 * text) in a 0–1000 frame; this module derives scale, walls and openings in code
 * so a person only confirms. Nothing here trusts a model-supplied number as metric. */
export type PlanImage = { width: number; height: number };
export type ScaleEvidence = { kind: 'room-size' | 'room-area' | 'total-area'; room: number | null; text: string; mmPerPixel: number };
export type ScaleFit = { mmPerPixel: number | null; status: 'confirmed' | 'conflict' | 'missing'; evidence: ScaleEvidence[]; spread: number };
export type PlanBuild = { document: HouseDocument; issues: string[]; rooms: { index: number; id: string; name: string; widthMm: number; depthMm: number }[] };

const FOOT = 304.8, INCH = 25.4;
const toPx = (box: readonly number[], image: PlanImage) => ({ x0: box[1]! / 1000 * image.width, y0: box[0]! / 1000 * image.height, x1: box[3]! / 1000 * image.width, y1: box[2]! / 1000 * image.height });

/** Two lengths from labels such as "3.6 x 4.2 m", "3600 × 4200", "12'6\" x 10'", "12 x 10 ft". */
export function parseRoomSize(input: string): [number, number] | null {
  const text = input.toLowerCase().replace(/[×✕]/g, 'x').replace(/’|′/g, "'").replace(/”|″/g, '"').replace(/,/g, '.');
  const imperial = text.match(/(\d{1,2})\s*'\s*(?:(\d{1,2}(?:\.\d+)?)\s*"?)?\s*x\s*(\d{1,2})\s*'\s*(?:(\d{1,2}(?:\.\d+)?)\s*"?)?/);
  if (imperial) return [Number(imperial[1]) * FOOT + Number(imperial[2] ?? 0) * INCH, Number(imperial[3]) * FOOT + Number(imperial[4] ?? 0) * INCH].map(Math.round) as [number, number];
  const pair = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|feet)?\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|feet)?/);
  if (!pair) return null;
  const unit = pair[4] ?? pair[2] ?? '';
  const a = Number(pair[1]), b = Number(pair[3]);
  const factor = unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : unit === 'ft' || unit === 'feet' ? FOOT
    : Math.max(a, b) > 100 ? 1 : Math.max(a, b) <= 15 ? 1000 : null; // bare numbers: millimetres or metres
  if (!factor) return null;
  const size = [Math.round(a * factor), Math.round(b * factor)] as [number, number];
  return size.every(value => value >= 800 && value <= 30_000) ? size : null;
}
/** Area in m² from labels such as "15.8 m²", "15.8 sqm", "170 sq ft". */
export function parseArea(input: string): number | null {
  const text = input.toLowerCase().replace(/,/g, '.');
  const metric = text.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sq\.?\s*m|sqm)/);
  const imperial = text.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|ft²|ft2|sft)/);
  const area = metric ? Number(metric[1]) : imperial ? Number(imperial[1]) * 0.092903 : null;
  return area && area >= 1 && area <= 2000 ? area : null;
}

function containing(reading: PlanReading, box: readonly number[]) {
  const cy = (box[0]! + box[2]!) / 2, cx = (box[1]! + box[3]!) / 2;
  let best: number | null = null, size = Infinity;
  for (const [index, room] of reading.rooms.entries()) {
    const [y0, x0, y1, x1] = room.box;
    if (cy >= y0 && cy <= y1 && cx >= x0 && cx <= x1 && (y1 - y0) * (x1 - x0) < size) { best = index; size = (y1 - y0) * (x1 - x0); }
  }
  return best;
}

/** Scale from the plan's own printed numbers, cross-checked. Conflicts and missing
 * labels are reported rather than guessed; the person then confirms with one tap. */
export function fitPlanScale(input: PlanReading, image: PlanImage): ScaleFit {
  const reading = planReadingSchema.parse(input), evidence: ScaleEvidence[] = [];
  for (const label of reading.texts) {
    const room = containing(reading, label.box), size = parseRoomSize(label.text), area = parseArea(label.text);
    if (room !== null && size) {
      const px = toPx(reading.rooms[room]!.box, image), w = px.x1 - px.x0, h = px.y1 - px.y0;
      if (w < 8 || h < 8) continue;
      const [long, short] = size[0] >= size[1] ? size : [size[1], size[0]];
      const [longPx, shortPx] = w >= h ? [w, h] : [h, w];
      evidence.push({ kind: 'room-size', room, text: label.text, mmPerPixel: long / longPx }, { kind: 'room-size', room, text: label.text, mmPerPixel: short / shortPx });
    } else if (area) {
      const target = room ?? null;
      const boxes = target === null ? reading.rooms.map(item => item.box) : [reading.rooms[target]!.box];
      const pxArea = boxes.reduce((sum, box) => { const p = toPx(box, image); return sum + (p.x1 - p.x0) * (p.y1 - p.y0); }, 0);
      if (pxArea > 64) evidence.push({ kind: target === null ? 'total-area' : 'room-area', room: target, text: label.text, mmPerPixel: Math.sqrt(area * 1e6 / pxArea) });
    }
  }
  if (!evidence.length) return { mmPerPixel: null, status: 'missing', evidence, spread: 0 };
  const values = evidence.map(item => item.mmPerPixel).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)]!, spread = values.at(-1)! / values[0]!;
  return { mmPerPixel: Math.round(median * 1000) / 1000, status: spread <= 1.15 ? 'confirmed' : 'conflict', evidence, spread: Math.round(spread * 100) / 100 };
}

/** One-tap home-size choices for plans without usable numbers. */
export function planSizeChoices(input: PlanReading, image: PlanImage, areas = [40, 55, 70, 85, 100, 120, 150, 180]) {
  const reading = planReadingSchema.parse(input);
  const pxArea = reading.rooms.reduce((sum, room) => { const p = toPx(room.box, image); return sum + (p.x1 - p.x0) * (p.y1 - p.y0); }, 0);
  return pxArea > 0 ? areas.map(area => ({ areaM2: area, mmPerPixel: Math.round(Math.sqrt(area * 1e6 / pxArea) * 1000) / 1000 })) : [];
}

const slug = (name: string, used: Set<string>) => {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (!/^[a-z]/.test(base)) base = `room-${base}`.replace(/-+$/, '');
  let id = base || 'room', n = 2; while (used.has(id)) id = `${base}-${n++}`;
  used.add(id); return id;
};
function cluster(values: number[], tolerance: number) {
  const sorted = [...new Set(values)].sort((a, b) => a - b), map = new Map<number, number>();
  let group: number[] = [];
  const flush = () => { const mean = Math.round(group.reduce((s, v) => s + v, 0) / group.length / 50) * 50; for (const v of group) map.set(v, mean); group = []; };
  for (const value of sorted) { if (group.length && value - group.at(-1)! > tolerance) flush(); group.push(value); }
  if (group.length) flush();
  return map;
}

/** Build a validated single-floor home from a reading and the person's confirmation. */
export function buildHouseFromPlan(input: PlanReading, image: PlanImage, confirmationInput: PlanConfirmation, name = 'Your home'): PlanBuild {
  const reading = planReadingSchema.parse(input), confirmation = planConfirmationSchema.parse(confirmationInput), issues: string[] = [];
  if (confirmation.names.length !== reading.rooms.length) throw new Error('Confirm a name for every detected room.');
  const s = confirmation.mmPerPixel, kept = reading.rooms.map((room, index) => ({ room, index })).filter(({ index }) => !confirmation.removedRooms.includes(index));
  if (!kept.length) throw new Error('Keep at least one room.');
  const rects = kept.map(({ room, index }) => { const p = toPx(room.box, image); return { index, x0: p.x0 * s, z0: p.y0 * s, x1: p.x1 * s, z1: p.y1 * s }; });
  const extent = Math.max(...rects.map(r => r.x1)) - Math.min(...rects.map(r => r.x0));
  const tolerance = Math.max(250, extent * 0.025);
  const xs = cluster(rects.flatMap(r => [r.x0, r.x1]), tolerance), zs = cluster(rects.flatMap(r => [r.z0, r.z1]), tolerance);
  const minX = Math.min(...xs.values()), minZ = Math.min(...zs.values());
  let cells = rects.map(r => ({ index: r.index, x: xs.get(r.x0)! - minX, z: zs.get(r.z0)! - minZ, width: xs.get(r.x1)! - xs.get(r.x0)!, depth: zs.get(r.z1)! - zs.get(r.z0)! }));
  cells = cells.filter(cell => { const ok = cell.width >= 1200 && cell.depth >= 1200 && cell.width <= 30_000 && cell.depth <= 30_000; if (!ok) issues.push(`${confirmation.names[cell.index]} was too small or large to model and was left out.`); return ok; });
  // After snapping, overlapping rooms cannot both stand; keep the larger one.
  cells.sort((a, b) => b.width * b.depth - a.width * a.depth);
  const placed: typeof cells = [];
  for (const cell of cells) {
    if (placed.some(o => cell.x < o.x + o.width && o.x < cell.x + cell.width && cell.z < o.z + o.depth && o.z < cell.z + cell.depth)) issues.push(`${confirmation.names[cell.index]} overlapped another room and was left out.`);
    else placed.push(cell);
  }
  placed.sort((a, b) => a.index - b.index);
  const used = new Set<string>(), ids = new Map(placed.map(cell => [cell.index, slug(confirmation.names[cell.index]!, used)]));
  const scene = structure('uploaded-plan', name.slice(0, 80), placed.map(cell => ({ id: ids.get(cell.index)!, name: confirmation.names[cell.index]!, x: cell.x, z: cell.z, width: cell.width, depth: cell.depth })));
  for (const room of scene.rooms) room.floorMaterialId = /kitchen|bath|toilet|wc|laundry/i.test(room.name) ? 'tile-stone' : 'wood-oak';

  const t = scene.walls[0]!.thickness;
  const toMm = (point: readonly number[]) => ({ x: point[1]! / 1000 * image.width * s - minX, z: point[0]! / 1000 * image.height * s - minZ });
  const nearest = (walls: HouseDocument['walls'], x: number, z: number) => walls.map(wall => {
    const horizontal = wall.start[1] === wall.end[1], along = horizontal ? x - wall.start[0] : z - wall.start[1];
    const length = horizontal ? wall.end[0] - wall.start[0] : wall.end[1] - wall.start[1];
    const gap = horizontal ? Math.abs(z - wall.start[1]) + Math.max(0, -along, along - length) : Math.abs(x - wall.start[0]) + Math.max(0, -along, along - length);
    return { wall, along: Math.min(Math.max(along, 0), length), length, gap };
  }).sort((a, b) => a.gap - b.gap)[0];
  const add = (kind: 'door' | 'window', wallHit: NonNullable<ReturnType<typeof nearest>>, width: number, label: string) => {
    const { wall, along, length } = wallHit;
    if (length < width + t + 100) { issues.push(`A ${kind} near ${label} did not fit its wall and was left out.`); return; }
    const offset = Math.round(Math.min(Math.max(along - width / 2, t / 2 + 50), length - t / 2 - 50 - width));
    const height = kind === 'door' ? 2100 : 1200, sill = kind === 'door' ? 0 : 900;
    if (scene.openings.some(o => o.wallId === wall.id && offset < o.offset + o.width && o.offset < offset + width)) { issues.push(`A ${kind} near ${label} overlapped another opening and was left out.`); return; }
    scene.openings.push({ id: `${kind}-${scene.openings.length + 1}`, wallId: wall.id, kind, offset, width, height, sill });
  };
  for (const door of reading.doors) {
    const rooms = door.rooms.map(index => index >= 0 ? ids.get(index) : null).filter((id): id is string | null => id !== undefined);
    const inside = rooms.filter((id): id is string => typeof id === 'string');
    if (!inside.length) continue;
    const { x, z } = toMm(door.point);
    const walls = inside.length === 2 ? scene.walls.filter(w => inside.every(id => [w.frontRoomId, w.backRoomId].includes(id))) : scene.walls.filter(w => [w.frontRoomId, w.backRoomId].includes(inside[0]!) && (!w.frontRoomId || !w.backRoomId || rooms.length === 1));
    const hit = nearest(walls, x, z);
    const label = inside.map(id => scene.rooms.find(room => room.id === id)!.name).join(' and ');
    if (!hit) { issues.push(`A door between ${label} could not be matched to a shared wall.`); continue; }
    add('door', hit, /bath|toilet|wc/i.test(label) ? 800 : 900, label);
  }
  for (const item of reading.windows) {
    const id = ids.get(item.room); if (!id) continue;
    const { x, z } = toMm(item.point);
    const hit = nearest(scene.walls.filter(w => [w.frontRoomId, w.backRoomId].includes(id) && (!w.frontRoomId || !w.backRoomId)), x, z);
    const room = scene.rooms.find(entry => entry.id === id)!;
    if (!hit) { issues.push(`A window in ${room.name} is not on an outside wall and was left out.`); continue; }
    add('window', hit, Math.max(600, Math.min(1200, Math.floor((hit.length - t - 300) / 100) * 100)), room.name);
  }
  let document = validateHouse(scene);
  if (confirmation.furnish) for (const room of document.rooms) { try { document = furnishRoom(document, room.id); } catch { issues.push(`${room.name} could not be furnished automatically.`); } }
  if (!document.openings.some(o => o.kind === 'door')) issues.push('No doors were recognised. Your Home Tour moves between rooms directly until doors are added.');
  return { document: validateHouse(document), issues, rooms: placed.map(cell => ({ index: cell.index, id: ids.get(cell.index)!, name: confirmation.names[cell.index]!, widthMm: cell.width - t, depthMm: cell.depth - t })) };
}
