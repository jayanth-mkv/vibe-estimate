import type { HouseDocument, HouseRoom } from '@vibeestimate/scene-schema';

/** Home Tour: an eye-level route through every room, derived from the real door graph.
 * Keyframes are integer millimetres; `seconds` is the time to reach a keyframe from the
 * previous one at 1x. The renderer only plays them, so the route is testable here.
 * Halls and corridors are walked through, not toured, so the visit reaches real rooms
 * quickly; doorways are crossed straight through their centre, perpendicular to the wall. */
export type TourKeyframe = { roomId: string; position: [number, number, number]; look: [number, number, number]; seconds: number };
export type HomeTour = { rooms: { roomId: string; name: string; start: number }[]; keyframes: TourKeyframe[]; seconds: number };

const EYE = 1600, LOOK_Y = 1450, WALK = 1400, LOOK_SECONDS = 1.8, THROUGH = 650, INSET = 350;
const PASS_THROUGH = /hall|corridor|passage|landing|entr|lobby|foyer|lift/i;
/** A visitor sees living spaces first and bathrooms last. */
const PRIORITY: [RegExp, number][] = [[/living|lounge|family|sitting/i, 0], [/kitchen|dining/i, 1], [/main|master/i, 2], [/bed/i, 3], [/study|office|work/i, 4], [/bath|toilet|wc|shower|laundry|utility/i, 6]];
const priority = (name: string) => PRIORITY.find(([pattern]) => pattern.test(name))?.[1] ?? 5;
type Point = [number, number, number];
const centre = (room: HouseRoom): Point => [Math.round(room.x + room.width / 2), EYE, Math.round(room.z + room.depth / 2)];
const flat = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const clampInto = (room: HouseRoom, x: number, z: number): Point => [
  Math.round(Math.min(Math.max(x, room.x + INSET), room.x + room.width - INSET)), EYE,
  Math.round(Math.min(Math.max(z, room.z + INSET), room.z + room.depth - INSET)),
];
type Door = { a: string; b: string | null; x: number; z: number; horizontal: boolean };

export function homeTour(scene: HouseDocument): HomeTour {
  const rooms = new Map(scene.rooms.map(room => [room.id, room]));
  const doors: Door[] = [];
  for (const opening of scene.openings.filter(item => item.kind === 'door')) {
    const wall = scene.walls.find(item => item.id === opening.wallId);
    if (!wall) continue;
    const horizontal = wall.start[1] === wall.end[1], along = opening.offset + opening.width / 2;
    const x = horizontal ? wall.start[0] + along : wall.start[0], z = horizontal ? wall.start[1] : wall.start[1] + along;
    const sides = [wall.frontRoomId, wall.backRoomId].filter((id): id is string => Boolean(id));
    doors.push({ a: sides[0]!, b: sides[1] ?? null, x, z, horizontal });
  }
  const links = new Map<string, { to: string; door: Door }[]>(scene.rooms.map(room => [room.id, []]));
  for (const door of doors) if (door.b) { links.get(door.a)!.push({ to: door.b, door }); links.get(door.b)!.push({ to: door.a, door }); }
  const entry = doors.find(door => !door.b);
  const start = entry?.a ?? scene.rooms[0]!.id;
  const passThrough = (id: string) => PASS_THROUGH.test(rooms.get(id)!.name) && scene.rooms.some(room => !PASS_THROUGH.test(room.name));

  // Door route between two rooms by fewest doorways.
  function route(from: string, to: string) {
    const previous = new Map<string, { room: string; door: Door } | null>([[from, null]]), queue = [from];
    while (queue.length) { const id = queue.shift()!; if (id === to) break; for (const link of links.get(id)!) if (!previous.has(link.to)) { previous.set(link.to, { room: id, door: link.door }); queue.push(link.to); } }
    if (!previous.has(to)) return null;
    const steps: { from: string; to: string; door: Door }[] = [];
    for (let id = to; id !== from;) { const step = previous.get(id)!; steps.unshift({ from: step.room, to: id, door: step.door }); id = step.room; }
    return steps;
  }

  const keyframes: TourKeyframe[] = [], tourRooms: HomeTour['rooms'] = [];
  const add = (roomId: string, position: Point, look: Point, seconds?: number) => {
    const last = keyframes.at(-1);
    keyframes.push({ roomId, position, look, seconds: Math.round((seconds ?? (last ? Math.max(0.5, flat(last.position, position) / WALK) : 0)) * 100) / 100 });
  };
  /** Stand on one side of a doorway, facing straight through it. */
  const doorSide = (door: Door, roomId: string): Point => {
    const room = rooms.get(roomId)!, c = centre(room);
    const sign = door.horizontal ? Math.sign(c[2] - door.z) || 1 : Math.sign(c[0] - door.x) || 1;
    return door.horizontal ? clampInto(room, door.x, door.z + sign * THROUGH) : clampInto(room, door.x + sign * THROUGH, door.z);
  };
  const through = (door: Door, from: string, to: string) => {
    const before = doorSide(door, from), after = doorSide(door, to);
    add(from, before, after); add(to, after, [after[0] * 2 - before[0], EYE, after[2] * 2 - before[2]]);
  };

  const first = rooms.get(start)!;
  if (entry) {
    const inside = doorSide(entry, start);
    add(start, inside, centre(first), 0);
  } else add(start, centre(first), [centre(first)[0], LOOK_Y, first.z], 0);

  const remaining = new Set(scene.rooms.map(room => room.id).filter(id => !passThrough(id)));
  let current = start;
  while (remaining.size) {
    // Visit the nearest unvisited room by doorways; unreachable rooms come last.
    const next = [...remaining].map(id => ({ id, steps: id === current ? [] : route(current, id) }))
      .sort((a, b) => (a.steps ? a.steps.length : 99) - (b.steps ? b.steps.length : 99) || priority(rooms.get(a.id)!.name) - priority(rooms.get(b.id)!.name) || a.id.localeCompare(b.id))[0]!;
    for (const step of next.steps ?? []) through(step.door, step.from, step.to);
    const room = rooms.get(next.id)!, last = keyframes.at(-1)!;
    // Stand just inside the way in and look across the room, like a property photo:
    // farthest corner first, then a slow sweep across the far corners.
    const way = last.roomId === room.id ? last.position : clampInto(room, room.x + INSET, room.z + INSET);
    const inward = Math.hypot(centre(room)[0] - way[0], centre(room)[2] - way[2]) || 1;
    const step = Math.min(800, inward * 0.5);
    const at = clampInto(room, way[0] + (centre(room)[0] - way[0]) / inward * step, way[2] + (centre(room)[2] - way[2]) / inward * step);
    const corners: Point[] = [[room.x + 250, LOOK_Y, room.z + 250], [room.x + room.width - 250, LOOK_Y, room.z + 250], [room.x + room.width - 250, LOOK_Y, room.z + room.depth - 250], [room.x + 250, LOOK_Y, room.z + room.depth - 250]].map(c => [Math.round(c[0]), c[1], Math.round(c[2])] as Point);
    const far = corners.sort((p, q) => flat(q, at) - flat(p, at)).slice(0, 3);
    const heading = (c: Point) => Math.atan2(c[0] - at[0], c[2] - at[2]);
    const sweep = [...far.slice(1)].sort((p, q) => heading(p) - heading(q));
    tourRooms.push({ roomId: room.id, name: room.name, start: keyframes.length });
    add(room.id, at, far[0]!);
    add(room.id, at, sweep[0]!, LOOK_SECONDS);
    add(room.id, at, far[0]!, LOOK_SECONDS);
    add(room.id, at, sweep[1]!, LOOK_SECONDS);
    remaining.delete(room.id); current = room.id;
  }
  return { rooms: tourRooms, keyframes, seconds: Math.round(keyframes.reduce((sum, frame) => sum + frame.seconds, 0) * 10) / 10 };
}
