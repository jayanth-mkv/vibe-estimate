import type { HouseDocument } from '@vibeestimate/scene-schema';
import { createInstance, houseFixtures, structure } from './house-fixtures.js';
import { validateHouse } from './house.js';

function apartment(id: string, name: string, cells: Parameters<typeof structure>[2]) {
  const scene = structure(id, name, cells);
  const hall = scene.rooms.find(room => room.id === 'hall')!;
  // Every habitable room has a real door to the hall; the external entry meets
  // the hall directly. Synthetic template measurements are deliberately fixed.
  for (const room of scene.rooms) {
    const wall = scene.walls.find(w => room.id === 'hall'
      ? [w.frontRoomId, w.backRoomId].includes('hall') && (!w.frontRoomId || !w.backRoomId) && w.start[0] === hall.x - 100 && w.end[0] === w.start[0]
      : [w.frontRoomId, w.backRoomId].includes(room.id) && [w.frontRoomId, w.backRoomId].includes('hall'));
    if (!wall) throw new Error(`${room.id}: template must connect to its hall`);
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const width = room.id === 'bathroom' ? 800 : 900;
    const offset = room.id === 'hall' ? Math.round((length - width) / 2) : length - width - 350;
    scene.openings.push({ id: `${room.id}-door`, wallId: wall.id, kind: 'door', offset, width, height: 2100, sill: 0 });
    if (room.id !== 'hall') {
      const outer = scene.walls.filter(w => [w.frontRoomId, w.backRoomId].includes(room.id) && (!w.frontRoomId || !w.backRoomId)).sort((a, b) => Math.hypot(...[b.end[0] - b.start[0], b.end[1] - b.start[1]]) - Math.hypot(...[a.end[0] - a.start[0], a.end[1] - a.start[1]]))[0];
      const span = Math.hypot(outer.end[0] - outer.start[0], outer.end[1] - outer.start[1]);
      const windowWidth = room.id === 'bathroom' ? 900 : 1800;
      scene.openings.push({ id: `${room.id}-window`, wallId: outer.id, kind: 'window', offset: Math.round((span - windowWidth) / 2), width: windowWidth, height: 1200, sill: 900 });
    }
  }
  return validateHouse(scene);
}

function addFurnishings(scene: HouseDocument) {
  for (const room of scene.rooms) {
    if (room.id === 'hall') continue;
    const configs = room.id === 'living' ? [['sofa', 1500, 1100], ['table', 1700, 2500]] : room.id === 'kitchen' ? [['cabinet', 800, 400]] : room.id === 'bathroom' ? [['cabinet', 800, 400]] : room.id === 'study' ? [['table', 1100, 800], ['chair', 1100, 1600]] : [['bed', 1200, 1800]];
    for (const [asset, dx, dz] of configs) {
      const item = createInstance(scene, `${asset}-${room.id}`, String(asset), room.id, room.x + Number(dx), room.z + Number(dz), asset === 'cabinet' && ['kitchen', 'bathroom'].includes(room.id) ? { dimensions: [1200, 1050, 500] } : {});
      // Template furniture is authored; a failed placement never produces a
      // partial/invalid document. These positions are independently tested.
      scene.instances.push(item);
    }
  }
  return validateHouse(scene);
}

const compact = addFurnishings(apartment('compact-apartment', 'City apartment', [
  { id: 'living', name: 'Living & dining', x: 0, z: 0, width: 5000, depth: 3500 },
  { id: 'kitchen', name: 'Kitchen', x: 5000, z: 0, width: 3000, depth: 3500 },
  { id: 'hall', name: 'Hall', x: 0, z: 3500, width: 8000, depth: 1400 },
  { id: 'bedroom', name: 'Bedroom', x: 0, z: 4900, width: 5000, depth: 3500 },
  { id: 'bathroom', name: 'Bathroom', x: 5000, z: 4900, width: 3000, depth: 3500 },
]));
const family = structuredClone(houseFixtures.house);
family.id = 'family-home'; family.name = 'Family home';
// Catalog pieces are design suggestions, so the homeowner may change them.
family.instances.forEach(item => { item.locked = false; });
const flexible = addFurnishings(apartment('garden-home', 'Home with a study', [
  { id: 'living', name: 'Living & dining', x: 0, z: 0, width: 6000, depth: 4500 },
  { id: 'kitchen', name: 'Kitchen', x: 6000, z: 0, width: 3500, depth: 4500 },
  { id: 'study', name: 'Study', x: 9500, z: 0, width: 3500, depth: 4500 },
  { id: 'hall', name: 'Hall', x: 0, z: 4500, width: 13000, depth: 1500 },
  { id: 'bedroom', name: 'Bedroom', x: 0, z: 6000, width: 5000, depth: 4500 },
  { id: 'main-bedroom', name: 'Main bedroom', x: 5000, z: 6000, width: 5000, depth: 4500 },
  { id: 'bathroom', name: 'Bathroom', x: 10000, z: 6000, width: 3000, depth: 4500 },
]));

function completeHome(scene: HouseDocument) {
  const bath = scene.rooms.find(room => room.id === 'bathroom')!;
  scene.instances = scene.instances.filter(item => item.roomId !== bath.id);
  scene.instances.push(
    createInstance(scene, 'shower-bathroom', 'shower', bath.id, bath.x + 550, bath.z + bath.depth - 550, { materialId: 'paint-white' }),
    createInstance(scene, 'toilet-bathroom', 'toilet', bath.id, bath.x + bath.width - 400, bath.z + bath.depth - 600, { materialId: 'paint-white' }),
    createInstance(scene, 'vanity-bathroom', 'kitchen-counter', bath.id, bath.x + 650, bath.z + 1650, { dimensions: [900, 900, 450], materialId: 'paint-white' }),
  );
  for (const item of scene.instances.filter(item => item.roomId === 'kitchen' && item.catalogId === 'cabinet')) {
    item.catalogId = 'kitchen-counter'; item.dimensions = [Math.max(900, item.dimensions[0]), 900, 600];
  }
  const study = scene.instances.find(item => item.id === 'table-study');
  if (study) { study.catalogId = 'desk'; study.dimensions = [1200, 750, 600]; }
  return validateHouse(scene);
}
completeHome(compact); completeHome(family); completeHome(flexible);

export const homeTemplates = [
  { id: compact.id, name: compact.name, description: 'One bedroom, a separate kitchen and a generous living space.', bedrooms: 1, document: compact, prompts: ['Make a calm home with warm lighting and natural wood.', 'Add a table for two and a reading light.'] },
  { id: family.id, name: family.name, description: 'Two bedrooms, room to gather, and a kitchen of its own.', bedrooms: 2, document: validateHouse(family), prompts: ['Add warm ceiling lights throughout the home.', 'Make the living room welcoming with a smaller table and soft finishes.'] },
  { id: flexible.id, name: flexible.name, description: 'Two bedrooms and a dedicated study, with space for visitors.', bedrooms: 2, document: flexible, prompts: ['Create a comfortable home with a well-lit place to work.', 'Add warm lighting and a table in the study.'] },
].map(template => ({ ...template, areaM2: Number((template.document.rooms.reduce((sum, room) => sum + room.width * room.depth, 0) / 1e6).toFixed(1)), roomCount: template.document.rooms.length, thumbnailPath: `/homes/${template.id}.png` }));

export function createHomeTemplate(id: string): HouseDocument {
  const template = homeTemplates.find(item => item.id === id);
  if (!template) throw new Error('Choose an available home layout.');
  return structuredClone(template.document);
}
