import { catalog, designResponseSchema, designSelectionSchema, housePatchSchema, type DesignSelection, type HouseDocument, type HouseInstance, type HouseOperation, type HousePatch, type HouseScope } from '@vibeestimate/scene-schema';
import { applyHousePatch, entitiesInRegion, validateHouse, validateHousePlacement } from './house.js';
import { createInstance } from './house-fixtures.js';

export function resolveDesignScope(scene: HouseDocument, input: DesignSelection): HouseScope {
  const selection = designSelectionSchema.parse(input);
  if (selection.kind === 'home') return { selectedIds: [...scene.rooms, ...scene.walls, ...scene.instances].map(item => item.id) };
  if (selection.kind === 'room' || selection.kind === 'region') {
    const room = scene.rooms.find(item => item.id === selection.roomId);
    if (!room) throw new Error('That room is not part of this home.');
    if (selection.kind === 'region') {
      const { kind: _, ...region } = selection;
      if (region.x < room.x || region.z < room.z || region.x + region.width > room.x + room.width || region.z + region.depth > room.z + room.depth) throw new Error('Keep the selected area inside its room.');
      return { region, selectedIds: entitiesInRegion(scene, region) };
    }
    return { selectedIds: [room.id, ...scene.instances.filter(item => item.roomId === room.id).map(item => item.id), ...scene.walls.filter(wall => [wall.frontRoomId, wall.backRoomId].includes(room.id)).map(wall => wall.id)] };
  }
  if (selection.kind === 'object' && !scene.instances.some(item => item.id === selection.entityId)) throw new Error('Select a furniture item or light.');
  if (selection.kind === 'surface') {
    const valid = selection.surface === 'floor' ? scene.rooms.some(room => room.id === selection.entityId) : selection.surface === 'body' ? scene.instances.some(item => item.id === selection.entityId) : scene.walls.some(wall => wall.id === selection.entityId);
    if (!valid) throw new Error('That surface is not part of this home.');
  }
  return { selectedIds: [selection.entityId] };
}

/** Authorization includes a wall face, not merely the shared wall's entity ID. */
export function applyDesignPatch(scene: HouseDocument, input: unknown, inputSelection: DesignSelection): HouseDocument {
  const selection = designSelectionSchema.parse(inputSelection), scope = resolveDesignScope(scene, selection), patch = housePatchSchema.parse(input);
  for (const operation of patch.operations) {
    if (operation.op === 'planMoveOpening') throw new Error('AI and furnishing changes cannot alter walls, doors or windows.');
    if (selection.kind === 'surface' && (operation.op !== 'setMaterial' || operation.entityId !== selection.entityId || operation.surface !== selection.surface)) throw new Error('Change only the selected surface.');
    if (operation.op === 'setMaterial' && selection.kind === 'room' && ['front', 'back'].includes(operation.surface)) {
      const wall = scene.walls.find(item => item.id === operation.entityId);
      if (!wall || (operation.surface === 'front' ? wall.frontRoomId : wall.backRoomId) !== selection.roomId) throw new Error('The opposite wall face belongs to another room.');
    }
  }
  return applyHousePatch(scene, patch, scope);
}

export type DesignPlacement = { id: string; label: string; instance: HouseInstance };
const placementCache = new WeakMap<HouseDocument, { fingerprint: string; selections: Map<string, DesignPlacement[]> }>();
/** Deterministic collision-checked choices keep coordinate arithmetic out of AI. */
export function designPlacements(scene: HouseDocument, selection: DesignSelection): DesignPlacement[] {
  const scope = resolveDesignScope(scene, selection), placements: DesignPlacement[] = [];
  const fingerprint = JSON.stringify(scene), selectionKey = JSON.stringify(selection);
  let cached = placementCache.get(scene);
  if (!cached || cached.fingerprint !== fingerprint) {
    cached = { fingerprint, selections: new Map() }; placementCache.set(scene, cached);
  }
  const previous = cached.selections.get(selectionKey);
  if (previous) return structuredClone(previous);
  const rooms = selection.kind === 'home' ? scene.rooms : selection.kind === 'room' || selection.kind === 'region' ? scene.rooms.filter(room => room.id === selection.roomId) : [];
  for (const room of rooms) for (const entry of catalog) {
    if (entry.kind === 'light' && scene.instances.filter(item => item.light).length >= 12) continue;
    const region = scope.region ?? room;
    const points: [number, number][] = [[region.x + region.width / 2, region.z + region.depth / 2]];
    for (const x of [.15, .35, .65, .85]) for (const z of [.15, .35, .65, .85]) points.push([region.x + region.width * x, region.z + region.depth * z]);
    let found = 0;
    for (const [x, z] of points) {
      let n = 1; while (scene.instances.some(item => item.id === `${entry.id}-${room.id}-${n}`)) n++;
      const item = createInstance(scene, `${entry.id}-${room.id}-${n}`, entry.id, room.id, Math.round(x), Math.round(z));
      try {
        validateHousePlacement(scene, item, scope.region);
        placements.push({ id: `p-${room.id}-${entry.id}-${found}`, label: `${entry.name} in ${room.name} at ${Math.round(x)}, ${Math.round(z)} mm`, instance: item });
        if (++found === 3) break;
      } catch { /* A candidate must satisfy the same publication validator. */ }
    }
  }
  // Immutable-request reuse avoids repeating every collision check for prompt
  // context and response compilation. Bound interactive region variants, clone
  // outputs and invalidate on content mutation; callers never own cached data.
  if (cached.selections.size >= 8) cached.selections.delete(cached.selections.keys().next().value!);
  cached.selections.set(selectionKey, structuredClone(placements));
  return placements;
}

export function designContext(scene: HouseDocument, selection: DesignSelection) {
  validateHouse(scene);
  return {
    scene, selection, scope: resolveDesignScope(scene, selection),
    catalog: catalog.map(({ modelPath: _, thumbnailPath: __, ...entry }) => entry),
    materials: scene.materials, placements: designPlacements(scene, selection),
    rules: ['Positions and sizes are integer millimetres. Rotation is clockwise in plan.', 'Choose supplied placement IDs for additions. Existing objects may move only within their current rooms.', 'At most eight operations. Preserve locked objects, clear door swings and every unselected surface.', 'Each placement candidate is valid alone. Choose non-overlapping candidates and never choose the same instance ID twice.', 'Ceiling heights and finishes are illustrative; do not claim construction or lighting accuracy.', 'Only furniture, lights and finishes. Never invent prices, source evidence, approval or architectural changes.'],
  };
}

export function compileDesignResponse(scene: HouseDocument, input: unknown, selection: DesignSelection) {
  const response = designResponseSchema.parse(input);
  const placements = designPlacements(scene, selection);
  const operations: HouseOperation[] = response.operations.map(operation => {
    if (operation.op !== 'place') return operation as HouseOperation;
    if (!('placementId' in operation)) throw new Error('Choose a supplied placement.');
    const placement = placements.find(item => item.id === operation.placementId);
    if (!placement) throw new Error('That placement is unavailable for the selected area.');
    const instance = structuredClone(placement.instance);
    instance.materialId = operation.materialId;
    if (operation.light) instance.light = operation.light;
    return { op: 'place', instance };
  });
  const patch: HousePatch = { schemaVersion: 2, operations };
  return { document: applyDesignPatch(scene, patch, selection), patch, title: response.title, summary: response.summary };
}

/** Describes the saved geometry difference, independent of model-authored prose. */
export function describeDesignChanges(before: HouseDocument, after: HouseDocument): string[] {
  const changes: string[] = [];
  const roomName = (id: string) => after.rooms.find(room => room.id === id)?.name ?? before.rooms.find(room => room.id === id)?.name ?? 'Room';
  const materialName = (id: string) => after.materials.find(material => material.id === id)?.name ?? id;
  const itemName = (item: HouseInstance) => `${catalog.find(asset => asset.id === item.catalogId)?.name ?? 'Item'} · ${roomName(item.roomId)}`;
  for (const item of after.instances) {
    const previous = before.instances.find(old => old.id === item.id);
    if (!previous) { changes.push(`Added ${itemName(item)}${item.light ? `, ${item.light.temperature} light at ${item.light.intensity}%` : ''}.`); continue; }
    if (previous.catalogId !== item.catalogId) changes.push(`Replaced ${itemName(previous)} with ${catalog.find(asset => asset.id === item.catalogId)?.name ?? 'an admitted item'}.`);
    if (previous.position.some((value, axis) => value !== item.position[axis])) changes.push(`Moved ${itemName(item)} to ${item.position[0]}, ${item.position[2]} mm.`);
    if (previous.rotation !== item.rotation) changes.push(`Turned ${itemName(item)} to ${item.rotation}°.`);
    if (previous.dimensions.some((value, axis) => value !== item.dimensions[axis])) changes.push(`Resized ${itemName(item)} to ${item.dimensions.join(' × ')} mm.`);
    if (previous.materialId !== item.materialId) changes.push(`Finished ${itemName(item)} in ${materialName(item.materialId)}.`);
    if (JSON.stringify(previous.light) !== JSON.stringify(item.light) && item.light) changes.push(`${itemName(item)}: ${item.light.enabled ? `${item.light.temperature} light at ${item.light.intensity}%` : 'light off'}.`);
  }
  for (const item of before.instances) if (!after.instances.some(current => current.id === item.id)) changes.push(`Removed ${itemName(item)}.`);
  if (before.level.ceilingHeight !== after.level.ceilingHeight) changes.push(`Ceiling height: ${after.level.ceilingHeight} mm (assumed).`);
  for (const room of after.rooms) {
    const previous = before.rooms.find(old => old.id === room.id);
    if (!previous) changes.push(`Added ${room.name}, ${room.width} × ${room.depth} mm.`);
    else {
      if (previous.name !== room.name) changes.push(`Renamed ${previous.name} to ${room.name}.`);
      if (previous.x !== room.x || previous.z !== room.z || previous.width !== room.width || previous.depth !== room.depth) changes.push(`${room.name} layout: ${room.width} × ${room.depth} mm, origin ${room.x}, ${room.z} mm.`);
    }
    if (previous?.floorMaterialId !== room.floorMaterialId) changes.push(`${room.name} floor: ${materialName(room.floorMaterialId)}.`);
  }
  for (const room of before.rooms) if (!after.rooms.some(current => current.id === room.id)) changes.push(`Removed ${room.name}.`);
  for (const wall of after.walls) {
    const previous = before.walls.find(old => old.id === wall.id);
    const geometry = `${wall.start.join(', ')} to ${wall.end.join(', ')} mm; ${wall.thickness} mm thick, ${wall.height} mm high`;
    if (!previous) { changes.push(`Added wall ${wall.id}: ${geometry}.`); continue; }
    if (JSON.stringify([previous.start, previous.end, previous.thickness, previous.height, previous.frontRoomId, previous.backRoomId]) !== JSON.stringify([wall.start, wall.end, wall.thickness, wall.height, wall.frontRoomId, wall.backRoomId])) changes.push(`Changed wall ${wall.id}: ${geometry}.`);
    if (previous.frontMaterialId !== wall.frontMaterialId) changes.push(`${wall.frontRoomId ? roomName(wall.frontRoomId) : 'Exterior'} wall face: ${materialName(wall.frontMaterialId)}.`);
    if (previous.backMaterialId !== wall.backMaterialId) changes.push(`${wall.backRoomId ? roomName(wall.backRoomId) : 'Exterior'} wall face: ${materialName(wall.backMaterialId)}.`);
  }
  for (const wall of before.walls) if (!after.walls.some(current => current.id === wall.id)) changes.push(`Removed wall ${wall.id}.`);
  for (const opening of after.openings) {
    const previous = before.openings.find(old => old.id === opening.id);
    if (JSON.stringify(previous) !== JSON.stringify(opening)) changes.push(`${previous ? 'Changed' : 'Added'} ${opening.kind} ${opening.id}: ${opening.width} × ${opening.height} mm in wall ${opening.wallId}, offset ${opening.offset} mm, sill ${opening.sill} mm.`);
  }
  for (const opening of before.openings) if (!after.openings.some(current => current.id === opening.id)) changes.push(`Removed ${opening.kind} ${opening.id}.`);
  return changes;
}
