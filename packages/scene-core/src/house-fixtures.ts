import { catalog, type HouseDocument, type HouseInstance, type HousePatch, type HouseScope, type HouseWall } from '@vibeestimate/scene-schema';
import { validateHouse } from './house';

type Cell = { id: string; name: string; x: number; z: number; width: number; depth: number };
const materials: HouseDocument['materials'] = [
  { id: 'paint-white', name: 'Warm white', color: '#e8e1d5', roughness: 0.85 },
  { id: 'paint-clay', name: 'Soft clay', color: '#ba7761', roughness: 0.85 },
  { id: 'paint-sage', name: 'Sage green', color: '#809b86', roughness: 0.85 },
  { id: 'paint-navy', name: 'Deep blue', color: '#344e60', roughness: 0.8 },
  { id: 'wood-oak', name: 'Natural oak', color: '#bb9666', roughness: 0.7 },
  { id: 'wood-dark', name: 'Smoked oak', color: '#6f503c', roughness: 0.75 },
  { id: 'tile-stone', name: 'Pale stone', color: '#b6b6af', roughness: 0.6 },
  { id: 'fabric-cream', name: 'Linen cream', color: '#d9cdb7', roughness: 1 },
  { id: 'fabric-ochre', name: 'Ochre fabric', color: '#c08d3a', roughness: 1 },
];

/** Split collinear room edges at every junction, admitting each shared wall once. */
function structure(id: string, name: string, cells: Cell[]): HouseDocument {
  const lines = new Map<string, { horizontal: boolean; coordinate: number; edges: { start: number; end: number; roomId: string; front: boolean }[] }>();
  function edge(horizontal: boolean, coordinate: number, start: number, end: number, roomId: string, front: boolean) {
    const key = `${horizontal ? 'h' : 'v'}:${coordinate}`;
    const line = lines.get(key) ?? { horizontal, coordinate, edges: [] };
    line.edges.push({ start, end, roomId, front }); lines.set(key, line);
  }
  for (const c of cells) {
    edge(true, c.z, c.x, c.x + c.width, c.id, true);
    edge(true, c.z + c.depth, c.x, c.x + c.width, c.id, false);
    edge(false, c.x, c.z, c.z + c.depth, c.id, false);
    edge(false, c.x + c.width, c.z, c.z + c.depth, c.id, true);
  }
  const walls: HouseWall[] = [];
  const n = (value: number) => value < 0 ? `n${-value}` : String(value);
  for (const line of [...lines.values()].sort((a, b) => Number(b.horizontal) - Number(a.horizontal) || a.coordinate - b.coordinate)) {
    const points = [...new Set(line.edges.flatMap(e => [e.start, e.end]))].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], owners = line.edges.filter(e => e.start <= a && e.end >= b);
      if (!owners.length) continue;
      walls.push({ id: `wall-${line.horizontal ? 'h' : 'v'}-${n(line.coordinate)}-${n(a)}-${n(b)}`, start: line.horizontal ? [a, line.coordinate] : [line.coordinate, a], end: line.horizontal ? [b, line.coordinate] : [line.coordinate, b], thickness: 200, height: 2800, frontRoomId: owners.find(e => e.front)?.roomId ?? null, backRoomId: owners.find(e => !e.front)?.roomId ?? null, frontMaterialId: 'paint-white', backMaterialId: 'paint-white' });
    }
  }
  return { schemaVersion: 2, id, name, units: 'mm', axes: 'x-east-y-up-z-south', level: { id: 'ground-floor', name: 'Ground floor', elevation: 0, ceilingHeight: 2800, ceilingProvenance: 'assumed' }, rooms: cells.map(c => ({ id: c.id, name: c.name, x: c.x + 100, z: c.z + 100, width: c.width - 200, depth: c.depth - 200, floorMaterialId: ['kitchen', 'bathroom'].includes(c.id) ? 'tile-stone' : 'wood-oak' })), walls, openings: [], materials: structuredClone(materials), instances: [] };
}
function wallFor(scene: HouseDocument, roomId: string, side: 'north' | 'south' | 'west' | 'east', neighbour?: string) {
  const room = scene.rooms.find(r => r.id === roomId)!;
  return scene.walls.find(w => {
    if (![w.frontRoomId, w.backRoomId].includes(roomId) || (neighbour && ![w.frontRoomId, w.backRoomId].includes(neighbour))) return false;
    return side === 'north' ? w.start[1] === room.z - 100 && w.end[1] === w.start[1] : side === 'south' ? w.start[1] === room.z + room.depth + 100 && w.end[1] === w.start[1] : side === 'west' ? w.start[0] === room.x - 100 && w.end[0] === w.start[0] : w.start[0] === room.x + room.width + 100 && w.end[0] === w.start[0];
  })!;
}
function opening(scene: HouseDocument, id: string, wall: HouseWall, kind: 'door' | 'window', offset: number, width = kind === 'door' ? 900 : 1800) {
  scene.openings.push({ id, wallId: wall.id, kind, offset, width, height: kind === 'door' ? 2100 : 1200, sill: kind === 'door' ? 0 : 900 });
}
export function createInstance(scene: HouseDocument, id: string, catalogId: string, roomId: string, x: number, z: number, overrides: Partial<HouseInstance> = {}): HouseInstance {
  const entry = catalog.find(e => e.id === catalogId)!;
  return { id, catalogId, roomId, position: [x, entry.mount === 'floor' ? 0 : scene.level.ceilingHeight - entry.dimensions[1], z], dimensions: [...entry.dimensions], rotation: 0, materialId: catalogId === 'sofa' || catalogId === 'bed' ? 'fabric-cream' : catalogId.includes('lamp') || catalogId === 'pendant' ? 'paint-navy' : 'wood-oak', locked: false, ...(entry.kind === 'light' ? { light: { enabled: true, intensity: 80, temperature: 'warm' as const } } : {}), ...overrides };
}
function smallFixture(adjoining: boolean) {
  const scene = structure(adjoining ? 'adjoining-rooms' : 'room-study', adjoining ? 'Adjoining rooms' : 'Measured room', [
    { id: 'living', name: 'Living room', x: -100, z: -100, width: 5200, depth: 4200 },
    ...(adjoining ? [{ id: 'bedroom', name: 'Bedroom', x: 5100, z: -100, width: 4200, depth: 4200 }] : []),
  ]);
  opening(scene, 'entry-door', wallFor(scene, 'living', 'west'), 'door', 2500);
  opening(scene, 'living-window', wallFor(scene, 'living', 'north'), 'window', 1700);
  if (adjoining) {
    opening(scene, 'bedroom-door', wallFor(scene, 'living', 'east', 'bedroom'), 'door', 2500);
    opening(scene, 'bedroom-window', wallFor(scene, 'bedroom', 'north'), 'window', 1200);
    scene.instances.push(createInstance(scene, 'bed-bedroom', 'bed', 'bedroom', 7300, 1600, { locked: true }));
  }
  scene.instances.push(createInstance(scene, 'sofa-living', 'sofa', 'living', 2500, 3100), createInstance(scene, 'table-living', 'table', 'living', 2800, 1400), createInstance(scene, 'lamp-living', 'floor-lamp', 'living', 800, 800));
  return validateHouse(scene);
}
function wholeHouse() {
  const scene = structure('single-floor-house', 'Single-floor house', [
    { id: 'living', name: 'Living & dining', x: -100, z: -100, width: 5500, depth: 4000 },
    { id: 'kitchen', name: 'Kitchen', x: 5400, z: -100, width: 5500, depth: 4000 },
    { id: 'hall', name: 'Hall', x: -100, z: 3900, width: 11000, depth: 1500 },
    { id: 'bedroom', name: 'Bedroom', x: -100, z: 5400, width: 5500, depth: 4000 },
    { id: 'main-bedroom', name: 'Main bedroom', x: 5400, z: 5400, width: 3500, depth: 4000 },
    { id: 'bathroom', name: 'Bathroom', x: 8900, z: 5400, width: 2000, depth: 4000 },
  ]);
  opening(scene, 'entry-door', wallFor(scene, 'hall', 'west'), 'door', 300);
  opening(scene, 'living-door', wallFor(scene, 'living', 'south', 'hall'), 'door', 3900);
  opening(scene, 'kitchen-door', wallFor(scene, 'kitchen', 'south', 'hall'), 'door', 700);
  opening(scene, 'bedroom-door', wallFor(scene, 'bedroom', 'north', 'hall'), 'door', 3000);
  opening(scene, 'main-bedroom-door', wallFor(scene, 'main-bedroom', 'north', 'hall'), 'door', 400);
  opening(scene, 'bathroom-door', wallFor(scene, 'bathroom', 'north', 'hall'), 'door', 400, 800);
  opening(scene, 'living-window', wallFor(scene, 'living', 'north'), 'window', 1700);
  opening(scene, 'kitchen-window', wallFor(scene, 'kitchen', 'north'), 'window', 1700);
  opening(scene, 'bedroom-window', wallFor(scene, 'bedroom', 'south'), 'window', 1700);
  opening(scene, 'main-bedroom-window', wallFor(scene, 'main-bedroom', 'south'), 'window', 900);
  opening(scene, 'bathroom-window', wallFor(scene, 'bathroom', 'east'), 'window', 1900, 900);
  scene.instances.push(
    createInstance(scene, 'sofa-living', 'sofa', 'living', 1700, 2800),
    createInstance(scene, 'table-living', 'table', 'living', 3400, 1300),
    createInstance(scene, 'chair-north', 'chair', 'living', 3400, 450),
    createInstance(scene, 'chair-south', 'chair', 'living', 3400, 2050, { rotation: 180 }),
    createInstance(scene, 'cabinet-living', 'cabinet', 'living', 700, 300),
    createInstance(scene, 'lamp-living', 'floor-lamp', 'living', 4800, 900),
    createInstance(scene, 'counter-kitchen', 'cabinet', 'kitchen', 6300, 400, { dimensions: [1200, 1050, 600] }),
    createInstance(scene, 'cabinet-kitchen', 'cabinet', 'kitchen', 7900, 400, { dimensions: [1600, 1050, 600] }),
    createInstance(scene, 'table-kitchen', 'table', 'kitchen', 8500, 2300),
    createInstance(scene, 'bed-bedroom', 'bed', 'bedroom', 1800, 7800, { locked: true }),
    createInstance(scene, 'cabinet-bedroom', 'cabinet', 'bedroom', 4400, 5900),
    createInstance(scene, 'bed-main', 'bed', 'main-bedroom', 7100, 7800, { locked: true }),
    createInstance(scene, 'cabinet-main', 'cabinet', 'main-bedroom', 8100, 5900),
    createInstance(scene, 'cabinet-bathroom', 'cabinet', 'bathroom', 9900, 8850, { dimensions: [1200, 1050, 500], materialId: 'paint-white' }),
  );
  return validateHouse(scene);
}

export const houseFixtures: Record<'room' | 'adjoining' | 'house', HouseDocument> = { room: smallFixture(false), adjoining: smallFixture(true), house: wholeHouse() };
export type ExperimentExample = { id: string; name: string; description: string; scope: HouseScope; patch: HousePatch; view?: 'plan' | 'overview' | 'inside' };
export function experimentExamples(scene: HouseDocument): ExperimentExample[] {
  const room = scene.rooms.find(r => r.id === 'living') ?? scene.rooms[0];
  const sofa = scene.instances.find(i => i.id === 'sofa-living'), table = scene.instances.find(i => i.id === 'table-living');
  const examples: ExperimentExample[] = [];
  const add = (id: string, name: string, description: string, selectedIds: string[], operations: HousePatch['operations'], view?: ExperimentExample['view'], region?: HouseScope['region']) => examples.push({ id, name, description, scope: { selectedIds, ...(region ? { region } : {}) }, patch: { schemaVersion: 2, operations }, ...(view ? { view } : {}) });
  const ceilingOps: HousePatch['operations'] = scene.rooms.map(r => {
    const id = `ceiling-${r.id}`;
    return scene.instances.some(i => i.id === id) ? { op: 'setLight', entityId: id, light: { enabled: true, intensity: 100, temperature: 'warm' } } : { op: 'place', instance: createInstance(scene, id, 'pendant', r.id, Math.round(r.x + r.width / 2), Math.round(r.z + r.depth / 2), { light: { enabled: true, intensity: 100, temperature: 'warm' } }) };
  });
  add('light-every-room', 'Light every room', 'Add one warm ceiling pendant per room. Existing pendants are switched on.', [...scene.rooms.map(r => r.id), ...scene.instances.filter(i => i.id.startsWith('ceiling-')).map(i => i.id)], ceilingOps);
  const wall = scene.walls.find(w => w.frontRoomId === room.id && w.backRoomId) ?? scene.walls.find(w => w.frontRoomId === room.id)!;
  add('warm-finishes', 'Change the room finishes', 'Change one room-facing wall surface and its floor; preserve every other surface.', [wall.id, room.id], [{ op: 'setMaterial', entityId: wall.id, surface: 'front', materialId: 'paint-clay' }, { op: 'setMaterial', entityId: room.id, surface: 'floor', materialId: 'wood-dark' }]);
  if (sofa) add('move-sofa', 'Move and turn the sofa', 'Move the selected sofa and rotate it by 180 degrees inside the living room.', [sofa.id], [{ op: 'move', entityId: sofa.id, position: [room.x + 2000, 0, room.z + room.depth - 700] }, { op: 'rotate', entityId: sofa.id, rotation: 180 }]);
  if (table) add('resize-table', 'Resize the dining table', 'Increase the admitted table width while preserving its height and depth.', [table.id], [{ op: 'resize', entityId: table.id, dimensions: [1600, 750, 800] }]);
  const lamp = scene.instances.find(i => i.id === 'lamp-living');
  if (lamp) add('dim-lamp', 'Dim the floor lamp', 'Set the selected lamp to 30% warm light. Use Evening to inspect the illumination.', [lamp.id], [{ op: 'setLight', entityId: lamp.id, light: { enabled: true, intensity: 30, temperature: 'warm' } }], 'inside');
  const region = { roomId: room.id, x: room.x + 250, z: room.z + 1500, width: 800, depth: 800 };
  if (!scene.instances.some(i => i.id === 'region-lamp')) add('region-lamp', 'Add a lamp in a region', 'The lamp footprint must fit completely inside this numeric Plan region.', [], [{ op: 'place', instance: createInstance(scene, 'region-lamp', 'floor-lamp', room.id, region.x + 400, region.z + 400) }], 'plan', region);
  const door = scene.openings.find(o => o.id === 'living-door') ?? scene.openings.find(o => o.kind === 'window');
  if (door) add('move-opening', 'Move an opening in Plan', 'Shift the selected opening 100 mm along its existing wall. Architecture requires Plan mode.', [door.id], [{ op: 'planMoveOpening', entityId: door.id, offset: door.offset + 100 }], 'plan');
  if (sofa && table) add('reject-collision', 'Reject an atomic collision', 'This intentionally invalid batch must preserve the floor and all furniture.', [room.id, sofa.id], [{ op: 'setMaterial', entityId: room.id, surface: 'floor', materialId: 'tile-stone' }, { op: 'move', entityId: sofa.id, position: [...table.position] }]);
  const neighbour = scene.rooms.find(r => r.id !== room.id);
  if (neighbour) add('reject-scope', 'Reject an unselected change', 'The selected living room does not authorize changing the neighbouring floor.', [room.id], [{ op: 'setMaterial', entityId: neighbour.id, surface: 'floor', materialId: 'wood-dark' }]);
  const locked = scene.instances.find(i => i.locked);
  if (locked) add('reject-lock', 'Keep a locked object fixed', 'Even an explicitly selected locked object must stay unchanged.', [locked.id], [{ op: 'rotate', entityId: locked.id, rotation: 90 }]);
  return examples;
}
