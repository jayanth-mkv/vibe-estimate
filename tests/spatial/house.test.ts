import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHousePatch, createInstance, entitiesInRegion, experimentExamples, footprint, houseFixtures, validateHouse } from '@vibeestimate/scene-core';
import { type HouseDocument, type HousePatch, type HouseScope } from '@vibeestimate/scene-schema';

const apply = (operations: HousePatch['operations'], selectedIds: string[], scene = houseFixtures.house) => applyHousePatch(scene, { schemaVersion: 2, operations }, { selectedIds });

test('all fixtures are valid, deterministic and contain shared walls only once', () => {
  for (const scene of Object.values(houseFixtures)) assert.deepEqual(validateHouse(JSON.parse(JSON.stringify(scene))), scene);
  assert.equal(houseFixtures.adjoining.walls.length, 7);
  assert.equal(houseFixtures.adjoining.walls.filter(w => w.frontRoomId && w.backRoomId).length, 1);
  const house = houseFixtures.house;
  assert.equal(house.rooms.length, 6);
  assert.equal(house.walls.length, 19);
  assert.equal(house.openings.length, 11);
  assert.equal(house.rooms.reduce((sum, room) => sum + room.width * room.depth, 0), 93_840_000);
  // Every room connects to the hall through one physical opening.
  for (const room of house.rooms.filter(r => r.id !== 'hall')) assert.ok(house.openings.some(o => o.kind === 'door' && house.walls.some(w => w.id === o.wallId && [w.frontRoomId, w.backRoomId].includes(room.id) && [w.frontRoomId, w.backRoomId].includes('hall'))));
});

test('positive programmatic examples work on every fixture; intentional failures remain atomic', () => {
  for (const source of Object.values(houseFixtures)) for (const example of experimentExamples(source)) {
    const before = JSON.stringify(source);
    if (example.id.startsWith('reject-')) assert.throws(() => applyHousePatch(source, example.patch, example.scope, { planMode: example.view === 'plan' }), `${source.id}: ${example.id}`);
    else assert.doesNotThrow(() => applyHousePatch(source, example.patch, example.scope, { planMode: example.view === 'plan' }), `${source.id}: ${example.id}`);
    assert.equal(JSON.stringify(source), before, `${example.id} mutated source`);
  }
});

test('adding lights preserves architecture and furniture; changing one light preserves its neighbours', () => {
  const source = houseFixtures.house, example = experimentExamples(source).find(e => e.id === 'light-every-room')!;
  const lit = applyHousePatch(source, example.patch, example.scope);
  assert.equal(lit.instances.filter(i => i.light).length, 7);
  assert.deepEqual(lit.walls, source.walls);
  assert.deepEqual(lit.instances.slice(0, source.instances.length), source.instances);
  const dimmed = apply([{ op: 'setLight', entityId: 'ceiling-living', light: { enabled: true, intensity: 35, temperature: 'cool' } }], ['ceiling-living'], lit);
  assert.deepEqual(dimmed.instances.filter(i => i.id !== 'ceiling-living'), lit.instances.filter(i => i.id !== 'ceiling-living'));
  assert.equal(dimmed.instances.find(i => i.id === 'ceiling-living')!.light!.intensity, 35);
});

test('shared-wall painting changes exactly one face and preserves the opposite room', () => {
  const source = houseFixtures.house, wall = source.walls.find(w => w.frontRoomId === 'living' && w.backRoomId === 'kitchen')!;
  const painted = apply([{ op: 'setMaterial', entityId: wall.id, surface: 'front', materialId: 'paint-clay' }], [wall.id]);
  assert.equal(painted.walls.find(w => w.id === wall.id)!.frontMaterialId, 'paint-clay');
  assert.equal(painted.walls.find(w => w.id === wall.id)!.backMaterialId, wall.backMaterialId);
  assert.deepEqual(painted.walls.filter(w => w.id !== wall.id), source.walls.filter(w => w.id !== wall.id));
  assert.deepEqual(painted.rooms, source.rooms);
});

test('region selection contains whole rotated footprints; placements must remain inside the frozen region', () => {
  const scene = houseFixtures.house, region = { roomId: 'living', x: 4500, z: 600, width: 600, depth: 600 };
  assert.deepEqual(entitiesInRegion(scene, region), ['lamp-living']);
  assert.deepEqual(entitiesInRegion(scene, { ...region, width: 200 }), []);
  const selected = { selectedIds: [], region: { roomId: 'living', x: 250, z: 1500, width: 800, depth: 800 } };
  const instance = createInstance(scene, 'new-lamp', 'floor-lamp', 'living', 650, 1900);
  assert.doesNotThrow(() => applyHousePatch(scene, { schemaVersion: 2, operations: [{ op: 'place', instance }] }, selected));
  assert.throws(() => applyHousePatch(scene, { schemaVersion: 2, operations: [{ op: 'place', instance: { ...instance, position: [300, 0, 1900] } }] }, selected), /inside the selected region/);
  assert.throws(() => applyHousePatch(scene, { schemaVersion: 2, operations: [{ op: 'rotate', entityId: 'lamp-living', rotation: 90 }] }, { selectedIds: [], region }), /outside the frozen selection/);
  const table = { ...scene.instances.find(i => i.id === 'table-living')!, rotation: 90 };
  const points = footprint(table);
  assert.equal(Math.round(Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))), 800);
});

test('strict patch boundary rejects scope injection, unknown assets, materials, operations and fields', () => {
  const source = houseFixtures.house, scope: HouseScope = { selectedIds: ['living'] };
  const mutations: unknown[] = [
    { schemaVersion: 2, operations: [{ op: 'execute', code: 'alert(1)' }] },
    { schemaVersion: 2, scope: { selectedIds: ['kitchen'] }, operations: [{ op: 'setMaterial', entityId: 'kitchen', surface: 'floor', materialId: 'wood-dark' }] },
    { schemaVersion: 2, operations: [{ op: 'setMaterial', entityId: 'living', surface: 'floor', materialId: 'unknown-material' }] },
    { schemaVersion: 2, operations: [{ op: 'place', instance: { ...createInstance(source, 'bad-lamp', 'floor-lamp', 'living', 650, 1900), catalogId: 'remote-url' } }] },
    { schemaVersion: 2, operations: [{ op: 'place', instance: { ...createInstance(source, 'bad-lamp', 'floor-lamp', 'living', 650, 1900), url: 'https://example.com/model.glb' } }] },
    { schemaVersion: 2, operations: Array(9).fill({ op: 'setMaterial', entityId: 'living', surface: 'floor', materialId: 'wood-dark' }) },
  ];
  for (const patch of mutations) assert.throws(() => applyHousePatch(source, patch, scope));
  assert.throws(() => apply([{ op: 'setMaterial', entityId: 'kitchen', surface: 'floor', materialId: 'wood-dark' }], ['living']), /outside the frozen selection/);
  assert.throws(() => apply([{ op: 'remove', entityId: 'sofa-living' }], []), /Select an entity/);
});

test('invalid topology, openings, collisions, mounting and light budgets cannot publish', () => {
  const source = houseFixtures.house;
  const cases: ((scene: HouseDocument) => void)[] = [
    s => { s.walls.pop(); },
    s => { s.walls.push({ ...s.walls[0], id: 'duplicate-wall' }); },
    s => { s.rooms[0].width -= 100; },
    s => { s.openings[0].width = 5000; },
    s => { s.openings.push({ ...s.openings[0], id: 'overlap-door' }); },
    s => { s.instances[0].position = [...s.instances[1].position]; },
    s => { s.instances[0].position = [200, 0, 200]; },
    s => { s.instances[0].position[1] = 100; },
    s => { s.instances.push(createInstance(s, 'blocked-entry', 'floor-lamp', 'hall', 400, 4600)); },
    s => { s.instances.push(...Array.from({ length: 12 }, (_, i) => createInstance(s, `ceiling-${i}`, 'pendant', 'living', 1000 + i * 50, 1000))); },
  ];
  for (const mutate of cases) { const bad = structuredClone(source); mutate(bad); assert.throws(() => validateHouse(bad)); }
});

test('locks, supported resizing, replacement/removal and Plan-only opening changes are enforced', () => {
  assert.throws(() => apply([{ op: 'rotate', entityId: 'bed-bedroom', rotation: 90 }], ['bed-bedroom']), /locked/);
  assert.throws(() => apply([{ op: 'resize', entityId: 'sofa-living', dimensions: [2000, 850, 900] }], ['sofa-living']), /does not support resizing/);
  assert.throws(() => apply([{ op: 'resize', entityId: 'table-living', dimensions: [5000, 750, 800] }], ['table-living']), /50% and 200%/);
  const replaced = apply([{ op: 'replace', entityId: 'chair-north', catalogId: 'floor-lamp' }], ['chair-north']);
  assert.equal(replaced.instances.find(i => i.id === 'chair-north')!.light!.enabled, true);
  assert.equal(apply([{ op: 'remove', entityId: 'chair-north' }], ['chair-north']).instances.length, houseFixtures.house.instances.length - 1);
  const opening = houseFixtures.house.openings.find(o => o.id === 'living-door')!;
  const patch: HousePatch = { schemaVersion: 2, operations: [{ op: 'planMoveOpening', entityId: opening.id, offset: opening.offset + 100 }] };
  assert.throws(() => applyHousePatch(houseFixtures.house, patch, { selectedIds: [opening.id] }), /Plan mode/);
  assert.equal(applyHousePatch(houseFixtures.house, patch, { selectedIds: [opening.id] }, { planMode: true }).openings.find(o => o.id === opening.id)!.offset, opening.offset + 100);
});
