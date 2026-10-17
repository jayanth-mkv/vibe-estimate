import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeTemplate, homeTemplates, homeTour } from '@vibeestimate/scene-core';

const passThrough = /hall|corridor|passage|landing|entr|lobby|foyer|lift/i;

test('Home Tour enters every real room once, quickly, at eye level and inside the home', () => {
  for (const template of homeTemplates) {
    const scene = createHomeTemplate(template.id), tour = homeTour(scene);
    const real = scene.rooms.filter(room => !passThrough.test(room.name));
    assert.deepEqual(new Set(tour.rooms.map(room => room.roomId)), new Set(real.map(room => room.id)), 'halls are walked through, not toured');
    const entranceWall = scene.walls.find(wall => (!wall.frontRoomId || !wall.backRoomId) && scene.openings.some(o => o.kind === 'door' && o.wallId === wall.id));
    if (entranceWall) assert.equal(tour.keyframes[0]!.roomId, entranceWall.frontRoomId ?? entranceWall.backRoomId, 'starts at the entrance');
    let elapsed = 0; for (const frame of tour.keyframes.slice(0, tour.rooms[0]!.start + 1)) elapsed += frame.seconds;
    assert.ok(elapsed < 10, `${template.id}: first room reached in ${elapsed.toFixed(1)}s`);
    for (const frame of tour.keyframes) {
      assert.equal(frame.position[1], 1600);
      const room = scene.rooms.find(r => r.id === frame.roomId)!;
      assert.ok(frame.position[0] > room.x && frame.position[0] < room.x + room.width && frame.position[2] > room.z && frame.position[2] < room.z + room.depth, `${frame.roomId}: keyframe inside its room`);
      assert.ok(frame.seconds >= 0 && frame.seconds < 15);
    }
    for (const room of tour.rooms) assert.equal(tour.keyframes[room.start]!.roomId, room.roomId);
    assert.match(tour.rooms[0]!.name, /living/i, 'living spaces come first');
    assert.match(tour.rooms.at(-1)!.name + tour.rooms.at(-2)!.name, /bath/i, 'bathrooms come last');
    assert.ok(tour.seconds > 10 && tour.seconds < 150, `${template.id}: ${tour.seconds}s`);
  }
});

test('every room change crosses straight through a real doorway between those rooms', () => {
  for (const template of homeTemplates) {
    const scene = createHomeTemplate(template.id), tour = homeTour(scene);
    for (let i = 1; i < tour.keyframes.length; i++) {
      const a = tour.keyframes[i - 1]!, b = tour.keyframes[i]!;
      if (a.roomId === b.roomId) continue;
      const doors = scene.openings.filter(o => o.kind === 'door').map(o => ({ o, wall: scene.walls.find(w => w.id === o.wallId)! }))
        .filter(({ wall }) => [wall.frontRoomId, wall.backRoomId].includes(a.roomId) && [wall.frontRoomId, wall.backRoomId].includes(b.roomId));
      assert.ok(doors.length, `${a.roomId} → ${b.roomId} share a door`);
      const crossing = doors.some(({ o, wall }) => {
        const horizontal = wall.start[1] === wall.end[1];
        const lo = (horizontal ? wall.start[0] : wall.start[1]) + o.offset, hi = lo + o.width;
        const along = horizontal ? [a.position[0], b.position[0]] : [a.position[2], b.position[2]];
        return along[0] === along[1] && along[0]! > lo && along[0]! < hi;
      });
      assert.ok(crossing, `${a.roomId} → ${b.roomId} passes perpendicular through the door opening`);
    }
  }
});
