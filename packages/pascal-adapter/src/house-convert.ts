import { BuildingNode, CeilingNode, DoorNode, ItemNode, LevelNode, SceneMaterial, SlabNode, WallNode, WindowNode, type AnyNode } from '@pascal-app/core';
import { validateHouse } from '@vibeestimate/scene-core';
import { catalog, type HouseDocument } from '@vibeestimate/scene-schema';

const metres = (value: number) => value / 1000;
export const houseRotation = (degrees: number) => -degrees * Math.PI / 180;
const materialRef = (id: string) => `scene:mat_${id}`;

/** All renderer-only URLs are resolved from the admitted local catalog here. */
export function houseToPascal(input: HouseDocument, origin: string) {
  const document = validateHouse(input);
  const local = new URL(origin);
  if (local.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(local.hostname)) throw new Error('House assets require the loopback preview origin');
  const materials = Object.fromEntries(document.materials.map(entry => {
    const material = SceneMaterial.parse({ id: `mat_${entry.id}`, name: entry.name, material: { preset: 'custom', properties: { color: entry.color, roughness: entry.roughness, side: 'front' } } });
    return [material.id, material];
  }));
  for (const [id, color] of [['door', '#8c6347'], ['frame', '#344e60'], ['ceiling', '#eee9df'], ['oak', '#b68b5e'], ['metal', '#293b44'], ['linen', '#f3eadb'], ['bulb', '#fff4da']]) {
    const material = SceneMaterial.parse({ id: `mat__house_${id}`, name: `Illustrative ${id}`, material: { preset: 'custom', properties: { color, roughness: .8, side: 'front' } } });
    materials[material.id] = material;
  }
  const building = BuildingNode.parse({ id: `building_house-${document.id}`, parentId: null, children: [`level_${document.level.id}`] });
  const level = LevelNode.parse({ id: `level_${document.level.id}`, parentId: building.id, level: 0, children: [] });
  const nodes: Record<string, AnyNode> = { [building.id]: building, [level.id]: level };
  const entityNodeIds: Record<string, string> = {};
  const nodeEntityIds: Record<string, string> = {};
  const add = (node: AnyNode, entityId?: string, primary = true) => {
    nodes[node.id] = node;
    if (node.parentId === level.id) (level.children as string[]).push(node.id);
    if (entityId) { nodeEntityIds[node.id] = entityId; if (primary) entityNodeIds[entityId] = node.id; }
  };
  for (const wall of document.walls) {
    const openings = document.openings.filter(opening => opening.wallId === wall.id);
    add(WallNode.parse({ id: `wall_${wall.id}`, parentId: level.id, name: wall.id,
      start: wall.start.map(metres), end: wall.end.map(metres), thickness: metres(wall.thickness), height: metres(wall.height),
      // Pascal's two material slots are called interior/exterior. The host
      // maps them to independent front/back faces, including shared walls.
      frontSide: 'interior', backSide: 'exterior',
      slots: { interior: materialRef(wall.frontMaterialId), exterior: materialRef(wall.backMaterialId) },
      children: openings.map(opening => `${opening.kind}_${opening.id}`),
    }), wall.id);
    for (const opening of openings) {
      const common = { id: `${opening.kind}_${opening.id}`, parentId: `wall_${wall.id}`, wallId: `wall_${wall.id}`,
        width: metres(opening.width), height: metres(opening.height),
        position: [metres(opening.offset + opening.width / 2), metres(opening.sill + opening.height / 2), 0], frameDepth: metres(wall.thickness),
      };
      add(opening.kind === 'door'
        ? DoorNode.parse({ ...common, threshold: false, hingesSide: 'right', swingAngle: Math.PI / 2, slots: { panel: 'scene:mat__house_door', frame: 'scene:mat__house_frame' } })
        : WindowNode.parse({ ...common, columnRatios: [1, 1], slots: { frame: 'scene:mat__house_frame' } }), opening.id);
    }
  }
  for (const room of document.rooms) {
    // Pascal extends equal-height neighboring slabs to their shared wall
    // centerline and exterior slabs to the outer wall face. Separate narrow
    // threshold slabs collapse under that native coverage rule and must not
    // be added: the existing room slabs already cover doorway floors.
    const polygon = [[room.x, room.z], [room.x + room.width, room.z], [room.x + room.width, room.z + room.depth], [room.x, room.z + room.depth]].map(point => point.map(metres));
    add(SlabNode.parse({ id: `slab_room-${room.id}`, parentId: level.id, elevation: 0, polygon, autoFromWalls: false, slots: { surface: materialRef(room.floorMaterialId) } }), room.id);
    // Pascal subtracts 10 mm in CeilingRenderer; compensate to keep the
    // visible underside at the host's stated ceiling height. Its underside
    // faces the room, so the open overview remains readable from above.
    add(CeilingNode.parse({ id: `ceiling_room-${room.id}`, parentId: level.id, polygon, height: metres(document.level.ceilingHeight) + .01, autoFromWalls: false, children: [], slots: { surface: 'scene:mat__house_ceiling' } }), room.id, false);
  }
  for (const instance of document.instances) {
    const entry = catalog.find(entry => entry.id === instance.catalogId)!;
    const src = new URL(entry.modelPath, local).href;
    add(ItemNode.parse({ id: `item_${instance.id}`, parentId: level.id, name: entry.name,
      position: instance.position.map(metres), rotation: [0, houseRotation(instance.rotation), 0],
      scale: instance.dimensions.map((value, axis) => value / entry.dimensions[axis]),
      // Every GLB material goes through Pascal's selected material pipeline.
      // Leaving a detail material unassigned retains its authored Standard
      // PBR material even in solid mode, which failed the native GPU spike.
      slots: { body: materialRef(instance.materialId), oak: 'scene:mat__house_oak', metal: 'scene:mat__house_metal', linen: 'scene:mat__house_linen', bulb: 'scene:mat__house_bulb' },
      asset: { id: entry.id, name: entry.name, category: entry.kind === 'light' ? 'lighting' : 'furniture',
        src, thumbnail: new URL(entry.thumbnailPath, local).href, dimensions: entry.dimensions.map(metres),
        offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        ...(entry.mount === 'ceiling' ? { attachTo: 'ceiling' } : {}),
        // Named host-owned pointLights share this Pascal Viewer. Omitting
        // interactive.effects prevents duplicate anonymous pooled lights.
      },
    }), instance.id);
  }
  return { nodes, rootNodeIds: [building.id], materials, entityNodeIds, nodeEntityIds, buildingId: building.id, levelId: level.id };
}

export function houseLightColor(temperature: 'warm' | 'neutral' | 'cool') {
  return { warm: '#ffd9a0', neutral: '#fff3df', cool: '#cfe3ff' }[temperature];
}
