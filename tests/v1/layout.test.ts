import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDesignPatch, arrangeRoom, createHomeTemplate, homeTemplates, rotateQuarter, snapMove, validateHouse } from '@vibeestimate/scene-core';

const roomOf = (scene: ReturnType<typeof createHomeTemplate>, id: string) => scene.rooms.find(room => room.id === id)!;

test('dragging a sofa near a wall snaps its back flush and turns it to face the room', () => {
  const scene = createHomeTemplate('compact-apartment');
  const sofa = scene.instances.find(item => item.catalogId === 'sofa')!, room = roomOf(scene, sofa.roomId);
  const west = snapMove(scene, sofa.id, room.x + 120, room.z + room.depth / 2 + 23);
  assert.equal(west.wall, 'west');
  assert.equal(west.rotation, 270);
  assert.equal(west.position[0], room.x + sofa.dimensions[2] / 2);
  assert.equal(west.position[2] % 50, 0);
  if (west.valid) validateHouse(applyDesignPatch(scene, { schemaVersion: 2, operations: west.operations }, { kind: 'object', entityId: sofa.id }));
  const south = snapMove(scene, sofa.id, room.x + room.width / 2, room.z + room.depth - 50);
  assert.equal(south.wall, 'south');
  assert.equal(south.rotation, 180);
  assert.equal(south.position[2], room.z + room.depth - sofa.dimensions[2] / 2);
});

test('a drag away from walls keeps rotation, stays on the 50 mm grid and inside its room', () => {
  const scene = createHomeTemplate('compact-apartment');
  const table = scene.instances.find(item => item.catalogId === 'table')!, room = roomOf(scene, table.roomId);
  const moved = snapMove(scene, table.id, room.x + room.width / 2 + 13, room.z + room.depth / 2 - 7);
  assert.equal(moved.wall, null);
  assert.equal(moved.rotation, table.rotation);
  assert.ok(moved.position.every(value => value % 50 === 0 || value === table.position[1]));
  const far = snapMove(scene, table.id, room.x - 5000, room.z - 5000);
  assert.ok(far.position[0] >= room.x && far.position[2] >= room.z, 'an object never leaves its room');
});

test('an invalid drop is reported, never saved, and a quarter turn is validated', () => {
  const scene = createHomeTemplate('compact-apartment');
  const [first, second] = scene.instances.filter(item => item.roomId === 'living');
  const onTop = snapMove(scene, first!.id, second!.position[0], second!.position[2]);
  assert.equal(onTop.valid, false);
  const turn = rotateQuarter(scene, first!.id);
  assert.equal(turn.operations[0]!.op, 'rotate');
});

test('arranging every templated room yields only validated, bounded changes', () => {
  for (const template of homeTemplates) {
    const scene = createHomeTemplate(template.id);
    for (const room of scene.rooms) for (const variant of [0, 1, 2]) {
      const result = arrangeRoom(scene, room.id, variant);
      assert.ok(result.operations.length <= 8);
      if (!result.operations.length) continue;
      const next = applyDesignPatch(scene, { schemaVersion: 2, operations: result.operations }, { kind: 'room', roomId: room.id });
      assert.deepEqual(validateHouse(next), next);
      for (const item of next.instances.filter(entry => result.arranged.includes(entry.id))) assert.equal(item.roomId, room.id);
      assert.deepEqual(next.walls, scene.walls, 'architecture is never changed');
    }
  }
});

test('locked pieces stay exactly where they are', () => {
  const scene = createHomeTemplate('garden-home');
  const bed = scene.instances.find(item => item.catalogId === 'bed')!;
  bed.locked = true;
  const result = arrangeRoom(scene, bed.roomId);
  assert.ok(!result.arranged.includes(bed.id));
  assert.ok(!result.operations.some(operation => 'entityId' in operation && operation.entityId === bed.id));
});

test('a different variant offers a different arrangement when the room allows it', () => {
  const scene = createHomeTemplate('garden-home');
  const a = JSON.stringify(arrangeRoom(scene, 'living', 0).operations), b = JSON.stringify(arrangeRoom(scene, 'living', 1).operations);
  assert.notEqual(a, b);
});
