import { catalog, houseInstanceSchema, houseDocumentSchema, housePatchSchema, houseScopeSchema, type HouseDocument, type HouseInstance, type HouseRoom, type HouseScope, type HouseWall } from '@vibeestimate/scene-schema';
export type { HouseDocument, HouseInstance, HousePatch, HouseRoom, HouseScope } from '@vibeestimate/scene-schema';
export type HouseRegion = NonNullable<HouseScope['region']>;
type Point = [number, number];
const fail = (message: string): never => { throw new Error(message); };
const entryFor = (id: string) => catalog.find(entry => entry.id === id) ?? fail(`Unknown catalog asset: ${id}`);
const EPS = 0.01;

export function footprint(instance: HouseInstance): Point[] {
  const angle = instance.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const [w, , d] = instance.dimensions;
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as Point[]).map(([x, z]) => [instance.position[0] + x * c - z * s, instance.position[2] + x * s + z * c]);
}
function intersects(a: Point[], b: Point[]) {
  for (const points of [a, b]) for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length], current = points[i];
    const axis: Point = [-(next[1] - current[1]), next[0] - current[0]];
    const pa = a.map(p => p[0] * axis[0] + p[1] * axis[1]), pb = b.map(p => p[0] * axis[0] + p[1] * axis[1]);
    if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false;
  }
  return true;
}
function contained(points: Point[], rect: { x: number; z: number; width: number; depth: number }) {
  return points.every(([x, z]) => x >= rect.x - EPS && x <= rect.x + rect.width + EPS && z >= rect.z - EPS && z <= rect.z + rect.depth + EPS);
}
export function entitiesInRegion(document: HouseDocument, region: HouseRegion): string[] {
  return document.instances.filter(item => item.roomId === region.roomId && contained(footprint(item), region)).map(item => item.id);
}
function wallLength(wall: HouseWall) { return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]); }
function wallSide(wall: HouseWall, room: HouseRoom, front: boolean): { side: number; start: number; end: number } {
  const t = wall.thickness / 2, horizontal = wall.start[1] === wall.end[1];
  if (horizontal) {
    if (wall.start[1] !== (front ? room.z - t : room.z + room.depth + t)) fail(`${wall.id}: wall does not meet ${room.id}'s inside face`);
    if (wall.start[0] < room.x - t || wall.end[0] > room.x + room.width + t) fail(`${wall.id}: shared wall must be split at room boundaries`);
    return { side: front ? 0 : 2, start: wall.start[0], end: wall.end[0] };
  }
  if (wall.start[0] !== (front ? room.x + room.width + t : room.x - t)) fail(`${wall.id}: wall does not meet ${room.id}'s inside face`);
  if (wall.start[1] < room.z - t || wall.end[1] > room.z + room.depth + t) fail(`${wall.id}: shared wall must be split at room boundaries`);
  return { side: front ? 1 : 3, start: wall.start[1], end: wall.end[1] };
}

/** Validate all geometry before changing Pascal's mirror. No renderer dependency. */
export function validateHouse(input: unknown): HouseDocument {
  const scene = houseDocumentSchema.parse(input);
  const ids = [scene.id, scene.level.id, ...scene.rooms.map(r => r.id), ...scene.walls.map(w => w.id), ...scene.openings.map(o => o.id), ...scene.instances.map(i => i.id), ...scene.materials.map(m => m.id)];
  if (new Set(ids).size !== ids.length) fail('All scene IDs must be unique');
  const material = (id: string) => { if (!scene.materials.some(m => m.id === id)) fail(`Unknown material: ${id}`); };
  const t = scene.walls[0].thickness;
  for (const room of scene.rooms) {
    material(room.floorMaterialId);
    for (const other of scene.rooms) if (room.id < other.id && room.x < other.x + other.width && other.x < room.x + room.width && room.z < other.z + other.depth && other.z < room.z + room.depth) fail(`${room.id}: rooms overlap`);
  }
  const cover = new Map(scene.rooms.map(room => [room.id, [[], [], [], []] as { start: number; end: number }[][]]));
  for (const wall of scene.walls) {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1];
    if (!((dx > 0 && dz === 0) || (dz > 0 && dx === 0))) fail(`${wall.id}: walls must be nonzero and run east or south`);
    if (wall.thickness !== t || wall.height !== scene.level.ceilingHeight) fail(`${wall.id}: inconsistent wall thickness or height`);
    if (!wall.frontRoomId && !wall.backRoomId) fail(`${wall.id}: wall has no room`);
    if (wall.frontRoomId && wall.frontRoomId === wall.backRoomId) fail(`${wall.id}: shared wall must have different rooms`);
    material(wall.frontMaterialId); material(wall.backMaterialId);
    for (const [id, front] of [[wall.frontRoomId, true], [wall.backRoomId, false]] as const) {
      if (!id) continue;
      const room = scene.rooms.find(r => r.id === id) ?? fail(`${wall.id}: unknown room ${id}`);
      const side = wallSide(wall, room, front);
      cover.get(id)![side.side].push(side);
    }
    for (const other of scene.walls) {
      if (wall.id >= other.id) continue;
      const horizontal = dx > 0, otherHorizontal = other.start[1] === other.end[1];
      if (horizontal === otherHorizontal) {
        const a = horizontal ? 0 : 1, b = 1 - a;
        if (wall.start[b] === other.start[b] && wall.start[a] < other.end[a] && other.start[a] < wall.end[a]) fail(`${wall.id}: duplicate or overlapping wall`);
      } else {
        const h = horizontal ? wall : other, v = horizontal ? other : wall;
        if (v.start[0] > h.start[0] && v.start[0] < h.end[0] && h.start[1] > v.start[1] && h.start[1] < v.end[1]) fail(`${wall.id}: walls cross without a junction`);
      }
    }
  }
  for (const room of scene.rooms) for (const [side, pieces] of cover.get(room.id)!.entries()) {
    const min = side % 2 === 0 ? room.x - t / 2 : room.z - t / 2;
    const max = min + (side % 2 === 0 ? room.width : room.depth) + t;
    let cursor = min;
    for (const piece of pieces.sort((a, b) => a.start - b.start)) { if (piece.start !== cursor) fail(`${room.id}: perimeter has a gap or duplicate wall`); cursor = piece.end; }
    if (cursor !== max) fail(`${room.id}: room perimeter is incomplete`);
  }
  for (const [index, opening] of scene.openings.entries()) {
    const wall = scene.walls.find(w => w.id === opening.wallId) ?? fail(`${opening.id}: unknown wall`);
    if (opening.offset < t / 2 || opening.offset + opening.width > wallLength(wall) - t / 2 || opening.sill + opening.height > wall.height) fail(`${opening.id}: opening does not fit its wall`);
    if (opening.kind === 'door' && opening.sill !== 0) fail(`${opening.id}: door must meet the floor`);
    for (const other of scene.openings.slice(0, index)) if (other.wallId === opening.wallId && opening.offset < other.offset + other.width && other.offset < opening.offset + opening.width && opening.sill < other.sill + other.height && other.sill < opening.sill + opening.height) fail(`${opening.id}: openings overlap`);
  }
  if (scene.instances.filter(i => entryFor(i.catalogId).kind === 'light').length > 12) fail('The experiment allows at most 12 light instances');
  for (const [index, item] of scene.instances.entries()) assertInstance(scene, item, scene.instances.slice(0, index));
  return scene;
}


function assertInstance(scene: HouseDocument, item: HouseInstance, neighbours: HouseInstance[]) {
  const t = scene.walls[0].thickness;
    const entry = entryFor(item.catalogId), room = scene.rooms.find(r => r.id === item.roomId) ?? fail(`${item.id}: unknown room`);
    if (!scene.materials.some(material => material.id === item.materialId)) fail('Unknown material: ' + item.materialId);
    if (!entry.resizable && item.dimensions.some((n, i) => n !== entry.dimensions[i])) fail(`${item.id}: ${entry.name} does not support resizing`);
    if (entry.resizable && item.dimensions.some((n, i) => n < entry.dimensions[i] / 2 || n > entry.dimensions[i] * 2)) fail(`${item.id}: resize must remain between 50% and 200% of admitted dimensions`);
    if (entry.kind === 'light' ? !item.light : Boolean(item.light)) fail(`${item.id}: light settings must match the catalog type`);
    if (item.position[1] !== (entry.mount === 'floor' ? 0 : scene.level.ceilingHeight - item.dimensions[1])) fail(`${item.id}: object does not meet its ${entry.mount} mounting surface`);
    if (item.position[1] + item.dimensions[1] > scene.level.ceilingHeight || !contained(footprint(item), room)) fail(`${item.id}: object must fit inside ${room.name}`);
    for (const other of neighbours) {
      if (item.roomId !== other.roomId || item.position[1] >= other.position[1] + other.dimensions[1] || other.position[1] >= item.position[1] + item.dimensions[1]) continue;
      if (intersects(footprint(item), footprint(other))) fail(`${item.id}: collision with ${other.id}`);
    }
    for (const door of scene.openings.filter(o => o.kind === 'door' && item.position[1] < o.height)) {
      const wall = scene.walls.find(w => w.id === door.wallId)!;
      if (![wall.frontRoomId, wall.backRoomId].includes(item.roomId)) continue;
      const length = wallLength(wall), u: Point = [(wall.end[0] - wall.start[0]) / length, (wall.end[1] - wall.start[1]) / length];
      const sign = wall.frontRoomId === item.roomId ? 1 : -1, n: Point = [-u[1] * sign, u[0] * sign];
      const a: Point = [wall.start[0] + u[0] * door.offset + n[0] * t / 2, wall.start[1] + u[1] * door.offset + n[1] * t / 2];
      const b: Point = [a[0] + u[0] * door.width, a[1] + u[1] * door.width];
      const sweep: Point[] = [a, b, [b[0] + n[0] * door.width, b[1] + n[1] * door.width], [a[0] + n[0] * door.width, a[1] + n[1] * door.width]];
      if (intersects(footprint(item), sweep)) fail(`${item.id}: keep ${door.id}'s door swing clear`);
    }
}

/** Placement preview reuses publication geometry checks on an already validated scene. */
export function validateHousePlacement(scene: HouseDocument, input: unknown, region?: HouseRegion) {
  const item = houseInstanceSchema.parse(input);
  if (scene.instances.length >= 64) fail('This home has reached its furniture limit.');
  if ([scene, scene.level, ...scene.rooms, ...scene.walls, ...scene.openings, ...scene.instances, ...scene.materials].some(entity => entity.id === item.id)) fail('The new item needs a unique ID.');
  if (item.light && scene.instances.filter(entry => entry.light).length >= 12) fail('This home has reached its 12-light limit.');
  if (region && (item.roomId !== region.roomId || !contained(footprint(item), region))) fail('The item must fit in the selected area.');
  assertInstance(scene, item, scene.instances);
  return item;
}

/** Host scope is separate from generated JSON; a failed batch returns no document. */
export function applyHousePatch(document: HouseDocument, input: unknown, suppliedScope: HouseScope, options: { planMode?: boolean } = {}): HouseDocument {
  const next = validateHouse(document), patch = housePatchSchema.parse(input), scope = houseScopeSchema.parse(suppliedScope);
  const entityIds = new Set([...next.rooms, ...next.walls, ...next.openings, ...next.instances].map(e => e.id));
  for (const id of scope.selectedIds) if (!entityIds.has(id)) fail(`Selection contains unknown entity ${id}`);
  if (scope.region) {
    const room = next.rooms.find(r => r.id === scope.region!.roomId) ?? fail('Region must belong to a known room');
    const r = scope.region;
    if (!contained([[r.x, r.z], [r.x + r.width, r.z + r.depth]], room)) fail('Selection region must fit inside its room');
  }
  if (!scope.selectedIds.length && !scope.region) fail('Select an entity or room region before applying changes');
  for (const [index, op] of patch.operations.entries()) {
    try {
      if (op.op === 'place') {
        if (!scope.selectedIds.includes(op.instance.roomId) && !scope.region) fail('Placement room is outside the selection');
        if (scope.region && (op.instance.roomId !== scope.region.roomId || !contained(footprint(op.instance), scope.region))) fail('Placement must fit completely inside the selected region');
        next.instances.push(structuredClone(op.instance));
        continue;
      }
      if (!scope.selectedIds.includes(op.entityId)) fail(`${op.entityId} is outside the frozen selection`);
      const instance = next.instances.find(i => i.id === op.entityId);
      if (instance?.locked) fail(`${op.entityId} is locked`);
      if (op.op === 'setMaterial') {
        const wall = next.walls.find(w => w.id === op.entityId), room = next.rooms.find(r => r.id === op.entityId);
        if (instance && op.surface === 'body') instance.materialId = op.materialId;
        else if (room && op.surface === 'floor') room.floorMaterialId = op.materialId;
        else if (wall && op.surface === 'front') wall.frontMaterialId = op.materialId;
        else if (wall && op.surface === 'back') wall.backMaterialId = op.materialId;
        else fail(`${op.entityId}: unsupported material surface ${op.surface}`);
      } else if (op.op === 'planMoveOpening') {
        if (!options.planMode) fail('Architectural changes require Plan mode');
        const opening = next.openings.find(o => o.id === op.entityId) ?? fail(`${op.entityId}: select a door or window`);
        opening.offset = op.offset;
      } else {
        if (!instance) fail(`${op.entityId}: operation requires a catalog instance`);
        const item = instance!;
        if (op.op === 'move') item.position = [...op.position];
        else if (op.op === 'rotate') item.rotation = op.rotation;
        else if (op.op === 'resize') item.dimensions = [...op.dimensions];
        else if (op.op === 'setLight') { if (entryFor(item.catalogId).kind !== 'light') fail(`${item.id}: object is not a light`); item.light = { ...op.light }; }
        else if (op.op === 'remove') next.instances = next.instances.filter(i => i.id !== item.id);
        else if (op.op === 'replace') {
          const entry = entryFor(op.catalogId);
          item.catalogId = entry.id; item.dimensions = [...entry.dimensions];
          item.position[1] = entry.mount === 'floor' ? 0 : next.level.ceilingHeight - entry.dimensions[1];
          if (entry.kind === 'light') item.light = { enabled: true, intensity: 80, temperature: 'warm' }; else delete item.light;
        }
      }
    } catch (error) { fail(`Operation ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return validateHouse(next);
}
