import { designResponseSchema, type DesignResponse, type DesignSelection, type HouseDocument } from '@vibeestimate/scene-schema';
import { compileDesignResponse, designPlacements, resolveDesignScope } from './design.js';

/** Explicit local test provider. Never imported as a live-model fallback. */
export function fixtureDesignResponse(scene: HouseDocument, prompt: string, selection: DesignSelection): DesignResponse {
  const text = prompt.toLowerCase(), scope = resolveDesignScope(scene, selection);
  const operations: DesignResponse['operations'] = [];
  const color = text.includes('clay') ? 'paint-clay' : text.includes('sage') || text.includes('green') ? 'paint-sage' : text.includes('blue') || text.includes('navy') ? 'paint-navy' : 'paint-white';
  if (/demolish|wall removal|remove.*wall|structural|ignore.*selection|unselected|arbitrary|http:|https:/.test(text)) throw new Error('This request is outside the supported local design examples. Select a surface or ask for lights, a table or finishes.');
  if (selection.kind === 'surface') operations.push({ op: 'setMaterial', entityId: selection.entityId, surface: selection.surface, materialId: color });
  else if (selection.kind === 'object') {
    const item = scene.instances.find(i => i.id === selection.entityId)!;
    if (/remove/.test(text)) operations.push({ op: 'remove', entityId: item.id });
    else if (item.light) operations.push({ op: 'setLight', entityId: item.id, light: { enabled: !/off/.test(text), intensity: /dim|soft/.test(text) ? 35 : 85, temperature: /cool/.test(text) ? 'cool' : 'warm' } });
    else if (/smaller|resize/.test(text) && item.catalogId === 'table') operations.push({ op: 'resize', entityId: item.id, dimensions: [1100, 750, 700] });
    else if (/turn|rotate/.test(text)) operations.push({ op: 'rotate', entityId: item.id, rotation: (item.rotation + 180) % 360 });
    else operations.push({ op: 'setMaterial', entityId: item.id, surface: 'body', materialId: color });
  } else if (/smaller|turn.*sofa|resize/.test(text)) {
    const table = scene.instances.find(i => scope.selectedIds.includes(i.id) && i.catalogId === 'table');
    if (table) operations.push({ op: 'resize', entityId: table.id, dimensions: [1100, 750, 700] });
    const sofa = scene.instances.find(i => scope.selectedIds.includes(i.id) && i.catalogId === 'sofa');
    if (sofa && /turn|rotate/.test(text)) operations.push({ op: 'rotate', entityId: sofa.id, rotation: (sofa.rotation + 180) % 360 });
  } else if (/wall|clay|sage|finish/.test(text) && !/light/.test(text)) {
    const room = scene.rooms.find(r => scope.selectedIds.includes(r.id));
    const wall = scene.walls.find(w => w.frontRoomId === room?.id || w.backRoomId === room?.id);
    if (wall && room) operations.push({ op: 'setMaterial', entityId: wall.id, surface: wall.frontRoomId === room.id ? 'front' : 'back', materialId: color });
  } else {
    const placements = designPlacements(scene, selection);
    const rooms = scene.rooms.filter(room => scope.selectedIds.includes(room.id) || scope.region?.roomId === room.id);
    if (/light|warm|comfortable|calm|welcoming|gather/.test(text)) {
      for (const room of rooms) {
        const existing = scene.instances.find(item => item.roomId === room.id && item.catalogId === 'pendant');
        if (existing && scope.selectedIds.includes(existing.id)) operations.push({ op: 'setLight', entityId: existing.id, light: { enabled: true, intensity: 85, temperature: 'warm' } });
        else {
          const candidate = placements.find(p => p.instance.roomId === room.id && p.instance.catalogId === 'pendant');
          if (candidate) operations.push({ op: 'place', placementId: candidate.id, materialId: 'paint-white', light: { enabled: true, intensity: 85, temperature: 'warm' } });
        }
        if (operations.length === 7) break;
      }
      if (/floor lamp|reading light/.test(text) && operations.length < 8) {
        const candidate = placements.find(p => p.instance.catalogId === 'floor-lamp');
        if (candidate) operations.push({ op: 'place', placementId: candidate.id, materialId: 'paint-clay', light: { enabled: true, intensity: 75, temperature: 'warm' } });
      }
    }
    if (/table|work|desk/.test(text) && operations.length < 8) {
      const candidate = placements.find(p => p.instance.catalogId === 'table');
      if (candidate) operations.push({ op: 'place', placementId: candidate.id, materialId: 'wood-oak' });
    }
  }
  if (!operations.length) throw new Error('This local test provider supports lighting, a table, smaller tables and surface finishes. Gemini handles the live design request.');
  const result = designResponseSchema.parse({ title: /light|warm/.test(text) ? 'A warmer home' : 'Your considered home', summary: `Prepared ${operations.length} validated design changes for the selected area. Furniture and finishes are suggestions; template dimensions and the assumed ceiling are unchanged.`, operations });
  compileDesignResponse(scene, result, selection);
  return result;
}
