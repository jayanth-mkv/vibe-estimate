import { catalog, type HouseDocument } from '@vibeestimate/scene-schema';
import { validateHouse } from './house.js';

/** One-tap looks computed in code: no model call, no typed values, one saved version.
 * Kits only change finishes and light settings; architecture and positions never move. */
export type StyleKit = { id: string; name: string; description: string; floor: string; darkFloor?: boolean; walls: string; feature: string; fabric: string; wood: string; light: { temperature: 'warm' | 'neutral' | 'cool'; intensity: number } };
export const styleKits: readonly StyleKit[] = [
  { id: 'warm-natural', name: 'Warm & natural', description: 'Oak floors, soft white walls, linen fabrics and warm light.', floor: 'wood-oak', walls: 'paint-white', feature: 'paint-white', fabric: 'fabric-cream', wood: 'wood-oak', light: { temperature: 'warm', intensity: 75 } },
  { id: 'calm-sage', name: 'Calm sage', description: 'Sage living spaces, pale oak and gentle neutral light.', floor: 'wood-oak', walls: 'paint-white', feature: 'paint-sage', fabric: 'fabric-cream', wood: 'wood-oak', light: { temperature: 'neutral', intensity: 70 } },
  { id: 'bold-navy', name: 'Bold navy', description: 'Deep blue feature rooms, smoked oak and ochre accents.', floor: 'wood-dark', walls: 'paint-white', feature: 'paint-navy', fabric: 'fabric-ochre', wood: 'wood-dark', light: { temperature: 'warm', intensity: 85 } },
  { id: 'earthy-clay', name: 'Earthy clay', description: 'Clay-toned walls, smoked oak and a cosy evening glow.', floor: 'wood-dark', walls: 'paint-white', feature: 'paint-clay', fabric: 'fabric-ochre', wood: 'wood-dark', light: { temperature: 'warm', intensity: 70 } },
];
const wet = (id: string, name: string) => /kitchen|bath|toilet|wc|laundry/i.test(`${id} ${name}`);
const feature = (id: string, name: string) => /living|lounge|bed|study|dining|family/i.test(`${id} ${name}`);
const FABRIC = new Set(['sofa', 'bed', 'armchair']);
const WOOD = new Set(['table', 'chair', 'desk', 'cabinet', 'bookcase', 'coffee-table', 'side-table']);

export function applyStyleKit(input: HouseDocument, kitId: string): { document: HouseDocument; changes: string[] } {
  const kit = styleKits.find(item => item.id === kitId);
  if (!kit) throw new Error('Choose one of the available styles.');
  const scene = structuredClone(validateHouse(input));
  const materials = new Set(scene.materials.map(item => item.id));
  for (const id of [kit.floor, kit.walls, kit.feature, kit.fabric, kit.wood, 'tile-stone']) if (!materials.has(id)) throw new Error('This home does not include the materials for that style.');
  const rooms = new Map(scene.rooms.map(room => [room.id, room]));
  for (const room of scene.rooms) room.floorMaterialId = wet(room.id, room.name) ? 'tile-stone' : kit.floor;
  const faceFor = (roomId: string | null) => { const room = roomId ? rooms.get(roomId) : undefined; return room && !wet(room.id, room.name) && feature(room.id, room.name) ? kit.feature : kit.walls; };
  for (const wall of scene.walls) { wall.frontMaterialId = faceFor(wall.frontRoomId); wall.backMaterialId = faceFor(wall.backRoomId); }
  let lights = 0;
  for (const item of scene.instances) {
    if (item.locked) continue;
    const entry = catalog.find(candidate => candidate.id === item.catalogId);
    if (entry?.kind === 'light' && item.light) { item.light = { ...item.light, enabled: true, ...kit.light }; lights++; }
    else if (FABRIC.has(item.catalogId)) item.materialId = kit.fabric;
    else if (WOOD.has(item.catalogId)) item.materialId = kit.wood;
  }
  const document = validateHouse(scene);
  const changes = [`Applied the ${kit.name} style: ${kit.description}`, 'Floors, wall finishes and furniture fabrics updated; positions and architecture unchanged.', ...(lights ? [`${lights} light${lights === 1 ? '' : 's'} set to ${kit.light.temperature} at ${kit.light.intensity}%.`] : [])];
  return { document, changes };
}
