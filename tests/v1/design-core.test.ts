import test from 'node:test';
import assert from 'node:assert/strict';
import { homeTemplates, createHomeTemplate, validateHouse, resolveDesignScope, applyDesignPatch, designPlacements, compileDesignResponse, fixtureDesignResponse, describeDesignChanges } from '@vibeestimate/scene-core';
import { catalog, type DesignSelection } from '@vibeestimate/scene-schema';
import { houseToPascal } from '../../packages/pascal-adapter/src/house-convert.js';

test('every offered home has a connected door graph and a complete valid measured floor', () => {
  assert.equal(homeTemplates.length, 3);
  for (const template of homeTemplates) {
    const scene = createHomeTemplate(template.id);
    assert.deepEqual(validateHouse(scene), scene);
    assert.equal(scene.units, 'mm');
    assert.ok(scene.rooms.length >= 5);
    assert.ok(scene.rooms.length <= 8);
    const reached = new Set<string>();
    const neighbours = new Map(scene.rooms.map(room => [room.id, new Set<string>()]));
    for (const opening of scene.openings.filter(opening => opening.kind === 'door')) {
      const wall = scene.walls.find(wall => wall.id === opening.wallId)!;
      if (wall.frontRoomId && wall.backRoomId) {
        neighbours.get(wall.frontRoomId)!.add(wall.backRoomId);
        neighbours.get(wall.backRoomId)!.add(wall.frontRoomId);
      } else reached.add((wall.frontRoomId ?? wall.backRoomId)!);
    }
    assert.ok(reached.size, 'At least one real exterior doorway is required.');
    const pending = [...reached];
    while (pending.length) for (const next of neighbours.get(pending.shift()!)!) if (!reached.has(next)) { reached.add(next); pending.push(next); }
    assert.deepEqual([...reached].sort(), scene.rooms.map(room => room.id).sort());
    assert.ok(scene.instances.some(item => item.catalogId === 'toilet'));
    assert.ok(scene.instances.some(item => item.catalogId === 'shower'));
    assert.ok(scene.instances.some(item => item.catalogId === 'kitchen-counter'));
    scene.name = 'Local copy';
    assert.notEqual(template.document.name, scene.name);
  }
});

test('six meaningful fixture design requests validate for every offered home without mutating the original', () => {
  for (const template of homeTemplates) {
    const scene = template.document;
    const wall = scene.walls.find(wall => wall.frontRoomId === 'living')!;
    const table = scene.instances.find(item => item.catalogId === 'table' && item.roomId === 'living')!;
    const requests: [string, DesignSelection][] = [
      [template.prompts[0], { kind: 'home' }],
      ['Add warm ceiling lights throughout the home.', { kind: 'home' }],
      ['Use a smaller table in this living room.', { kind: 'room', roomId: 'living' }],
      ['Make this wall warm clay.', { kind: 'surface', entityId: wall.id, surface: 'front' }],
      ['Rotate this table.', { kind: 'object', entityId: table.id }],
      ['Add a reading light.', { kind: 'room', roomId: 'living' }],
    ];
    const before = JSON.stringify(scene);
    for (const [prompt, selection] of requests) {
      const response = fixtureDesignResponse(scene, prompt, selection);
      const result = compileDesignResponse(scene, response, selection);
      assert.notDeepEqual(result.document, scene, template.id + ': ' + prompt);
      assert.deepEqual(result.document.walls.map(wall => ({ ...wall, frontMaterialId: '', backMaterialId: '' })), scene.walls.map(wall => ({ ...wall, frontMaterialId: '', backMaterialId: '' })));
      assert.deepEqual(result.document.openings, scene.openings);
      assert.equal(JSON.stringify(scene), before);
    }
  }
});

test('a room cannot repaint the shared face belonging to its neighbour and batches remain atomic', () => {
  const scene = createHomeTemplate('family-home');
  const wall = scene.walls.find(wall => wall.frontRoomId === 'living' && wall.backRoomId)!;
  const before = JSON.stringify(scene);
  const valid = { op: 'setMaterial' as const, entityId: 'living', surface: 'floor' as const, materialId: 'wood-dark' };
  const wrong = { op: 'setMaterial' as const, entityId: wall.id, surface: 'back' as const, materialId: 'paint-clay' };
  assert.throws(() => applyDesignPatch(scene, { schemaVersion: 2, operations: [valid, wrong] }, { kind: 'room', roomId: 'living' }), /opposite wall face/);
  assert.throws(() => applyDesignPatch(scene, { schemaVersion: 2, operations: [wrong] }, { kind: 'surface', entityId: wall.id, surface: 'front' }), /selected surface/);
  assert.throws(() => resolveDesignScope(scene, { kind: 'region', roomId: 'living', x: -100, z: 0, width: 500, depth: 500 }), /inside its room/);
  assert.equal(JSON.stringify(scene), before);
});

test('unknown placements, raw model coordinates, duplicate placements and collisions cannot publish', () => {
  const scene = createHomeTemplate('family-home');
  const selection = { kind: 'room' as const, roomId: 'living' };
  const placements = designPlacements(scene, selection);
  const place = placements.find(item => item.instance.catalogId === 'pendant')!;
  assert.ok(place);
  const operation = { op: 'place', placementId: place.id, materialId: 'paint-white' };
  const response = { title: 'Safe addition', summary: 'One selected light.', operations: [operation] };
  assert.doesNotThrow(() => compileDesignResponse(scene, response, selection));
  assert.throws(() => compileDesignResponse(scene, { ...response, operations: [{ ...operation, placementId: 'missing-placement' }] }, selection), /unavailable/);
  assert.throws(() => compileDesignResponse(scene, { ...response, operations: [{ op: 'place', instance: place.instance }] }, selection));
  assert.throws(() => compileDesignResponse(scene, { ...response, operations: [operation, operation] }, selection));
  const sofa = scene.instances.find(item => item.catalogId === 'sofa')!;
  const table = scene.instances.find(item => item.catalogId === 'table' && item.roomId === sofa.roomId)!;
  assert.throws(() => applyDesignPatch(scene, { schemaVersion: 2, operations: [{ op: 'move', entityId: table.id, position: sofa.position }] }, selection), /collision/);
  assert.throws(() => applyDesignPatch(scene, { schemaVersion: 2, operations: [{ op: 'planMoveOpening', entityId: scene.openings[0].id, offset: 1200 }] }, { kind: 'home' }), /cannot alter/);
});

test('deployment origin uses only admitted same-origin models over HTTPS', () => {
  const scene = createHomeTemplate('family-home');
  const rendered = houseToPascal(scene, 'https://app.example.test');
  const items = Object.values(rendered.nodes).filter(node => node.type === 'item');
  assert.equal(items.length, scene.instances.length);
  for (const item of items) {
    assert.equal(new URL(item.asset.src).origin, 'https://app.example.test');
    assert.ok(catalog.some(entry => new URL(item.asset.src).pathname === entry.modelPath));
  }
  assert.doesNotThrow(() => houseToPascal(scene, 'http://127.0.0.1:3100'));
  for (const origin of ['http://app.example.test', 'https://user:password@app.example.test', 'https://app.example.test/another-path', 'https://app.example.test?asset=outside', 'file:///models']) assert.throws(() => houseToPascal(scene, origin));
});

test('saved design comparisons disclose architectural differences between complete starting homes', () => {
  const family = createHomeTemplate('family-home'), apartment = createHomeTemplate('compact-apartment');
  assert.deepEqual(describeDesignChanges(family, structuredClone(family)), []);
  const description = describeDesignChanges(family, apartment).join('\n');
  const living = apartment.rooms.find(room => room.id === 'living')!;
  assert.ok(description.includes(`${living.width} × ${living.depth} mm`), 'A different room footprint cannot be described only as furnishing changes.');
  assert.match(description, /wall .*mm/);
  assert.match(description, /(?:door|window).*mm/);
  for (const removed of family.rooms.filter(room => !apartment.rooms.some(next => next.id === room.id))) assert.ok(description.includes('Removed ' + removed.name));
  for (const removed of family.openings.filter(opening => !apartment.openings.some(next => next.id === opening.id))) assert.ok(description.includes('Removed ' + removed.kind + ' ' + removed.id));
  const taller = structuredClone(family);
  taller.level.ceilingHeight = 2900;
  for (const wall of taller.walls) wall.height = 2900;
  validateHouse(taller);
  const heightChanges = describeDesignChanges(family, taller).join('\n');
  assert.match(heightChanges, /Ceiling height: 2900 mm \(assumed\)/);
  assert.match(heightChanges, /2900 mm high/);
  assert.doesNotMatch(heightChanges, /Added |Removed |Resized /);
});
