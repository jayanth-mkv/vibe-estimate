'use client';

import { loadPlugin, nodeRegistry, sceneRegistry, useScene } from '@pascal-app/core';
import { builtinPlugin } from '@pascal-app/nodes';
import { clearMaterialCache, useViewer, Viewer } from '@pascal-app/viewer';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box3, Box3Helper, Color, Euler, Material, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3, type Object3D, type PointLight } from 'three';
import { catalog, type HouseDocument } from '@vibeestimate/scene-schema';
import { houseLightColor, houseRotation, houseToPascal } from './house-convert';

type Mirror = ReturnType<typeof houseToPascal>;
export type HouseMode = 'overview' | 'inside';
export type HouseLighting = 'day' | 'evening';
type MaterialReport = { mesh: string; index: number; name: string; color: string | null; opacity: number; slot: string | string[] | null };
export type HouseEntityReport = { nodeId: string; type: string; min: number[]; max: number[]; position: number[]; rotation: number[]; scale: number[]; meshes: number; meshNames: string[]; materials: MaterialReport[] };
export type HouseLightReport = { id: string; position: number[]; color: string; intensity: number; distance: number; decay: number; visible: boolean; castShadow: boolean };
type FaceReport = { hits: number; color: string | null; materialIndex: number | null };
export type HouseRendererReport = {
  documentId: string; backend: string; shading: string; lighting: HouseLighting; frames: number; ready: boolean;
  camera: number[]; cameraTarget: number[]; meshCount: number; entities: Record<string, HouseEntityReport>;
  lights: Record<string, HouseLightReport>; openings: Record<string, { holeHits: number; lintelHits: number | null }>;
  wallFaces: Record<string, { front: FaceReport; back: FaceReport }>; assetFailures: string[]; highlightedIds: string[];
  drawCalls: number; triangles: number;
};
export type HouseViewerProps = {
  document: HouseDocument; mode: HouseMode; roomId?: string | null; reset: number; lighting: HouseLighting; selectedIds: readonly string[];
  onSelect: (canonicalId: string) => void; onReady: (report: HouseRendererReport) => void; onFailure: (message?: string) => void;
};
declare global {
  interface Window {
    __house?: { inspect: () => HouseRendererReport; loseContext: () => void };
    __houseLifecycle?: { mounts: number; disposals: number; disposedGeometries: number; disposedMaterials: number };
  }
}

let preparation: Promise<void> | undefined;
const trackedRenderers = new WeakSet<object>();
function prepareHouse() {
  preparation ??= (async () => {
    useScene.temporal.getState().pause(); useScene.temporal.getState().clear();
    useViewer.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    if (!nodeRegistry.has('wall')) await loadPlugin(builtinPlugin);
  })();
  return preparation;
}
function assertGraphics() {
  if ((navigator as Navigator & { gpu?: unknown }).gpu) return;
  const probe = window.document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('Neither WebGPU nor WebGL2 is available');
  probe.getExtension('WEBGL_lose_context')?.loseContext();
}

class HouseBoundary extends Component<{ children: ReactNode; onFailure: (message?: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

function ownMeshes(root: Object3D) {
  const result: Mesh[] = [];
  const registered = new Set(sceneRegistry.nodes.values());
  function walk(object: Object3D) {
    if (object !== root && registered.has(object)) return;
    if (object.userData.houseHelper) return;
    if (object instanceof Mesh && object.name !== 'collision-mesh' && object.name !== 'ceiling-grid' && object.geometry.attributes.position?.count > 3) result.push(object);
    for (const child of object.children) walk(child);
  }
  walk(root); return result;
}
function meshBounds(meshes: Mesh[]) {
  const bounds = new Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}
function colorOf(material: Material | undefined) {
  const color = (material as Material & { color?: Color } | undefined)?.color;
  return color ? `#${color.getHexString()}` : null;
}
function materialAt(mesh: Mesh, index = 0) { return Array.isArray(mesh.material) ? mesh.material[index] : mesh.material; }
function focus(document: HouseDocument, roomId: string | null | undefined) {
  const room = document.rooms.find(room => room.id === roomId);
  const rooms = room ? [room] : document.rooms;
  const minX = Math.min(...rooms.map(room => room.x)) / 1000, minZ = Math.min(...rooms.map(room => room.z)) / 1000;
  const maxX = Math.max(...rooms.map(room => room.x + room.width)) / 1000, maxZ = Math.max(...rooms.map(room => room.z + room.depth)) / 1000;
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

/** Actual named Three lights inside Pascal's own canvas and render pipeline. */
function HouseLights({ document }: { document: HouseDocument }) {
  return <>{document.instances.filter(instance => instance.light).map(instance => {
    const entry = catalog.find(entry => entry.id === instance.catalogId)!;
    const room = document.rooms.find(room => room.id === instance.roomId)!;
    const offset = new Vector3(...(entry.lightOffset ?? [0, 0, 0]).map(value => value / 1000));
    offset.multiply(new Vector3(...instance.dimensions.map((value, axis) => value / entry.dimensions[axis]))).applyEuler(new Euler(0, houseRotation(instance.rotation), 0));
    const position = offset.add(new Vector3(...instance.position.map(value => value / 1000)));
    const state = instance.light!;
    return <pointLight key={instance.id} name={`house-light-${instance.id}`} userData={{ houseLightId: instance.id }}
      position={position.toArray()} color={houseLightColor(state.temperature)} intensity={state.enabled ? state.intensity / 100 * 65 : 0}
      distance={Math.min(6, Math.max(room.width, room.depth) / 1000 * 1.35)} decay={2} castShadow={false} />;
  })}</>;
}

function HouseRuntime({ mirror, document, mode, roomId, reset, lighting, selectedIds, onSelect, onReady, onFailure }: HouseViewerProps & { mirror: Mirror }) {
  const { camera, gl, scene, size, invalidate } = useThree();
  const frames = useRef(0), lastReported = useRef<HouseDocument | null>(null), stableFrames = useRef(0);
  const latest = useRef({ mirror, document, lighting, selectedIds, onSelect, onReady, onFailure });
  const helpers = useRef(new Map<string, Box3Helper>());
  const lifetime = useRef({ generation: 0 });
  const selectedRoom = mode === 'inside' ? (roomId ?? document.rooms[0].id) : null;
  const nextArea = focus(document, selectedRoom);
  const area = useMemo(() => ({ x: nextArea.x, z: nextArea.z, width: nextArea.width, depth: nextArea.depth }), [nextArea.x, nextArea.z, nextArea.width, nextArea.depth]);
  const target = useMemo<[number, number, number]>(() => mode === 'inside' ? [area.x, 1.55, area.z - area.depth * .28] : [area.x, .4, area.z], [area, mode]);

  useEffect(() => { latest.current = { mirror, document, lighting, selectedIds, onSelect, onReady, onFailure }; }, [mirror, document, lighting, selectedIds, onSelect, onReady, onFailure]);
  useEffect(() => { stableFrames.current = 0; }, [document]);
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) camera.setFocalLength(camera.getFilmHeight() / (2 * Math.tan((mode === 'inside' ? 58 : 42) * Math.PI / 360)));
    if (mode === 'inside') camera.position.set(area.x, 1.6, area.z + area.depth * .32);
    else {
      // Fit all eight exterior corners in the actual viewport, including
      // phone aspect ratios. A span-only heuristic clips the near facade.
      const direction = new Vector3(.65, 1, .8).normalize();
      const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
      const up = new Vector3().crossVectors(direction, right).normalize();
      const tangentY = Math.tan(42 * Math.PI / 360), tangentX = tangentY * size.width / size.height;
      const centre = new Vector3(...target);
      let distance = 2;
      for (const x of [area.x - area.width / 2 - .2, area.x + area.width / 2 + .2])
        for (const z of [area.z - area.depth / 2 - .2, area.z + area.depth / 2 + .2])
          for (const y of [0, document.level.ceilingHeight / 1000]) {
            const relative = new Vector3(x, y, z).sub(centre);
            distance = Math.max(distance, relative.dot(direction) + 1.12 * Math.max(Math.abs(relative.dot(right)) / tangentX, Math.abs(relative.dot(up)) / tangentY));
          }
      camera.position.copy(centre.addScaledVector(direction, distance));
    }
    camera.lookAt(...target);
    camera.updateProjectionMatrix(); invalidate();
    useViewer.getState().setWallMode(mode === 'inside' ? 'up' : 'cutaway');
  }, [area, mode, reset, camera, target, size.width, size.height, document.level.ceilingHeight, invalidate]);
  useEffect(() => { useViewer.getState().setSceneTheme(lighting === 'day' ? 'studio' : 'night'); invalidate(); }, [lighting, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => { if (event.button === 0) down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      const start = down; down = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const rect = canvas.getBoundingClientRect(), pointer = new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const ray = new Raycaster(); ray.setFromCamera(pointer, camera); ray.layers.enableAll(); scene.updateMatrixWorld(true);
      const candidates: Mesh[] = [], owner = new Map<Mesh, string>();
      for (const [nodeId, id] of Object.entries(latest.current.mirror.nodeEntityIds)) {
        const object = sceneRegistry.nodes.get(nodeId); if (!object) continue;
        for (const mesh of ownMeshes(object)) {
          let ancestor: Object3D | null = mesh, visible = true;
          while (ancestor) { if (!ancestor.visible) { visible = false; break; } ancestor = ancestor.parent; }
          if (!visible || (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => material.opacity < .02)) continue;
          candidates.push(mesh); owner.set(mesh, id);
        }
      }
      const hit = ray.intersectObjects(candidates, false).find(hit => owner.has(hit.object as Mesh));
      if (hit) latest.current.onSelect(owner.get(hit.object as Mesh)!);
    };
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp);
    return () => { canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp); };
  }, [camera, gl, scene]);

  useEffect(() => {
    const backend = (gl as unknown as { backend?: { gl?: WebGL2RenderingContext; device?: { lost: Promise<unknown>; destroy: () => void; addEventListener: (name: string, callback: () => void) => void; removeEventListener: (name: string, callback: () => void) => void } } }).backend;
    const inspect = (): HouseRendererReport => {
      const current = latest.current;
      scene.updateMatrixWorld(true);
      const entities: Record<string, HouseEntityReport> = {};
      let meshCount = 0;
      for (const [id, nodeId] of Object.entries(current.mirror.entityNodeIds)) {
        const object = sceneRegistry.nodes.get(nodeId); if (!object) continue;
        const meshes = ownMeshes(object); if (!meshes.length) continue;
        const box = meshBounds(meshes), position = object.getWorldPosition(new Vector3());
        entities[id] = { nodeId, type: current.mirror.nodes[nodeId].type, min: box.min.toArray(), max: box.max.toArray(), position: position.toArray(), rotation: [object.rotation.x, object.rotation.y, object.rotation.z], scale: object.scale.toArray(), meshes: meshes.length, meshNames: meshes.map(mesh => mesh.name),
          materials: meshes.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material, index) => ({ mesh: mesh.name, index, name: material.name, color: colorOf(material), opacity: material.opacity, slot: (mesh.userData.slotId as string | string[] | null) ?? null }))),
        }; meshCount += meshes.length;
      }
      const rayFor = (wallId: string, origin: Vector3, direction: Vector3) => {
        const object = sceneRegistry.nodes.get(`wall_${wallId}`); if (!object) return [];
        const ray = new Raycaster(origin, direction, 0, 2); ray.layers.enableAll(); return ray.intersectObjects(ownMeshes(object), false);
      };
      const openings: HouseRendererReport['openings'] = {};
      for (const opening of current.document.openings) {
        const wall = current.document.walls.find(wall => wall.id === opening.wallId)!;
        const tangent = new Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]).normalize(), normal = new Vector3(-tangent.z, 0, tangent.x);
        const center = new Vector3(wall.start[0] / 1000, 0, wall.start[1] / 1000).addScaledVector(tangent, (opening.offset + opening.width / 2) / 1000);
        const origin = center.clone().addScaledVector(normal, wall.thickness / 1000 + .3); origin.y = (opening.sill + opening.height / 2) / 1000;
        const holeHits = rayFor(wall.id, origin, normal.clone().negate()).length;
        const lintelY = (opening.sill + opening.height + 100) / 1000;
        openings[opening.id] = { holeHits, lintelHits: lintelY < wall.height / 1000 ? rayFor(wall.id, origin.clone().setY(lintelY), normal.clone().negate()).length : null };
      }
      const wallFaces: HouseRendererReport['wallFaces'] = {};
      for (const wall of current.document.walls) {
        const tangent = new Vector3(wall.end[0] - wall.start[0], 0, wall.end[1] - wall.start[1]), length = tangent.length() / 1000; tangent.normalize();
        const normal = new Vector3(-tangent.z, 0, tangent.x);
        const at = new Vector3(wall.start[0] / 1000, wall.height / 1000 - .1, wall.start[1] / 1000).addScaledVector(tangent, length / 2);
        const face = (sign: number): FaceReport => {
          const hits = rayFor(wall.id, at.clone().addScaledVector(normal, sign * (wall.thickness / 1000 + .3)), normal.clone().multiplyScalar(-sign));
          const first = hits[0], materialIndex = first?.face?.materialIndex ?? null;
          return { hits: hits.length, color: first ? colorOf(materialAt(first.object as Mesh, materialIndex ?? 0)) : null, materialIndex };
        };
        wallFaces[wall.id] = { front: face(1), back: face(-1) };
      }
      const lights: Record<string, HouseLightReport> = {};
      scene.traverse(object => {
        const light = object as PointLight, id = object.userData.houseLightId as string | undefined;
        if (!id || !light.isPointLight) return;
        lights[id] = { id, position: object.getWorldPosition(new Vector3()).toArray(), color: `#${light.color.getHexString()}`, intensity: light.intensity, distance: light.distance, decay: light.decay, visible: light.visible, castShadow: light.castShadow };
      });
      const assetFailures = Object.keys(useViewer.getState().itemLoadFailures).map(id => current.mirror.nodeEntityIds[id] ?? id);
      const settled = current.document.instances.every(instance => sceneRegistry.nodes.get(`item_${instance.id}`)?.userData.itemModelSettled === true);
      const ready = settled && assetFailures.length === 0 && Object.keys(current.mirror.entityNodeIds).every(id => entities[id]?.meshes > 0);
      const renderInfo = gl.info.render as { calls?: number; drawCalls?: number; triangles?: number };
      return { documentId: current.document.id, backend: backend?.device ? 'WebGPU' : backend?.gl ? 'WebGL' : 'Unknown', shading: useViewer.getState().shading, lighting: current.lighting, frames: frames.current, ready,
        camera: camera.position.toArray(), cameraTarget: target, meshCount, entities, lights, openings, wallFaces, assetFailures, highlightedIds: [...helpers.current.keys()],
        drawCalls: renderInfo.calls ?? renderInfo.drawCalls ?? 0, triangles: renderInfo.triangles ?? 0,
      };
    };
    window.__house = { inspect, loseContext: () => { if (backend?.gl) backend.gl.getExtension('WEBGL_lose_context')?.loseContext(); else backend?.device?.destroy(); } };
    const lost = (event: Event) => { event.preventDefault(); latest.current.onFailure('The graphics context was lost.'); };
    const gpuError = () => latest.current.onFailure('The graphics pipeline failed.');
    let active = true;
    gl.domElement.addEventListener('webglcontextlost', lost); backend?.device?.addEventListener('uncapturederror', gpuError);
    void backend?.device?.lost.then(() => { if (active) latest.current.onFailure('The graphics device was lost.'); });
    return () => { active = false; gl.domElement.removeEventListener('webglcontextlost', lost); backend?.device?.removeEventListener('uncapturederror', gpuError); delete window.__house; };
  }, [camera, gl, scene, target]);

  useEffect(() => {
    const state = lifetime.current, token = ++state.generation;
    const selectionHelpers = helpers.current;
    window.__houseLifecycle ??= { mounts: 0, disposals: 0, disposedGeometries: 0, disposedMaterials: 0 };
    if (!trackedRenderers.has(gl)) { trackedRenderers.add(gl); window.__houseLifecycle.mounts++; }
    return () => queueMicrotask(() => {
      if (token !== state.generation) return;
      const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>();
      scene.traverse(object => { if (object instanceof Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
      for (const helper of selectionHelpers.values()) { scene.remove(helper); helper.geometry.dispose(); (helper.material as Material).dispose(); }
      selectionHelpers.clear(); gl.dispose();
      if (window.__houseLifecycle) { window.__houseLifecycle.disposals++; window.__houseLifecycle.disposedGeometries += geometries.size; window.__houseLifecycle.disposedMaterials += materials.size; }
    });
  }, [gl, scene]);

  useFrame(() => {
    frames.current++;
    const current = latest.current, selected = new Set(current.selectedIds);
    for (const [id, helper] of helpers.current) if (!selected.has(id) || !current.mirror.entityNodeIds[id]) { scene.remove(helper); helper.geometry.dispose(); (helper.material as Material).dispose(); helpers.current.delete(id); }
    scene.updateMatrixWorld(true);
    for (const id of selected) {
      const object = sceneRegistry.nodes.get(current.mirror.entityNodeIds[id]); if (!object) continue;
      const box = meshBounds(ownMeshes(object)); if (box.isEmpty()) continue;
      box.expandByScalar(.018);
      let helper = helpers.current.get(id);
      if (!helper) { helper = new Box3Helper(box, new Color('#c52031')); helper.name = `house-selection-${id}`; helper.userData.houseHelper = true; (helper.material as Material).depthTest = false; helper.renderOrder = 1000; helpers.current.set(id, helper); scene.add(helper); }
      helper.box.copy(box); helper.updateMatrixWorld(true);
    }
    if (lastReported.current === current.document || frames.current % 3 !== 0) return;
    const report = window.__house?.inspect();
    if (report?.assetFailures.length) { current.onFailure(`Local model unavailable: ${report.assetFailures.join(', ')}`); return; }
    if (!report?.ready) { stableFrames.current = 0; return; }
    stableFrames.current++;
    if (stableFrames.current >= 4) { lastReported.current = current.document; current.onReady(report); }
  });

  return <>
    <OrbitControls key={`${mode}-${selectedRoom ?? 'all'}-${reset}`} makeDefault target={target} enablePan={mode === 'overview'} minDistance={mode === 'inside' ? .2 : 2} maxDistance={90} maxPolarAngle={Math.PI / 2 - .001} enableDamping={false} />
    <HouseLights document={document} />
  </>;
}

export function HouseViewer(props: HouseViewerProps) {
  const [state, setState] = useState<{ document: HouseDocument; mirror: Mirror } | null>(null);
  const graphicsChecked = useRef(false);
  const failure = useRef(props.onFailure);
  useEffect(() => { failure.current = props.onFailure; }, [props.onFailure]);
  useEffect(() => {
    return () => { useScene.getState().unloadScene(); useScene.temporal.getState().clear(); sceneRegistry.clear(); clearMaterialCache(); };
  }, []);
  useEffect(() => {
    let active = true;
    void prepareHouse().then(() => {
      if (!active) return;
      if (!graphicsChecked.current) { assertGraphics(); graphicsChecked.current = true; }
      const mirror = houseToPascal(props.document, window.location.origin);
      useScene.getState().setScene(mirror.nodes, mirror.rootNodeIds, { materials: mirror.materials });
      useScene.getState().setReadOnly(true);
      useViewer.setState({ cameraMode: 'perspective', shading: 'solid', shadingByContext: { viewer: 'solid' }, textures: true, shadows: false, showGrid: false, showZones: false, showMeasurements: false, levelMode: 'stacked', renderPaused: false,
        selection: { buildingId: mirror.buildingId, levelId: mirror.levelId, zoneId: null, selectedIds: [] }, itemLoadFailures: {},
      });
      setState({ document: props.document, mirror });
    }).catch(error => { if (active) failure.current(error instanceof Error ? error.message : 'Invalid house rendering mirror.'); });
    return () => { active = false; };
  }, [props.document]);
  useEffect(() => {
    if (!state) return;
    const timeout = window.setTimeout(() => { if (!window.__house?.inspect().ready) failure.current('The house renderer did not become ready.'); }, 45_000);
    return () => window.clearTimeout(timeout);
  }, [state]);
  if (!state) return null;
  return <HouseBoundary onFailure={props.onFailure}><Viewer selectionManager="custom" renderContext="viewer" useBvh={false} disablePostFx sceneReadyKey={state.document.id}>
    <HouseRuntime {...props} document={state.document} mirror={state.mirror} />
  </Viewer></HouseBoundary>;
}
