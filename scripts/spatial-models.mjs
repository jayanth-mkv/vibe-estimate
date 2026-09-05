import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'frontend/public/models');
const definitions = [
  ['sofa', [2.2, .85, .9]], ['table', [1.4, .75, .8]], ['chair', [.5, .9, .55]],
  ['bed', [1.6, .65, 2.1]], ['cabinet', [1.2, 2.1, .5]], ['pendant', [.4, .3, .4]], ['floor-lamp', [.4, 1.6, .4]],
];
const materials = {
  body: new MeshStandardMaterial({ name: 'slot_body', color: '#b4866b', roughness: .82 }),
  oak: new MeshStandardMaterial({ name: 'slot_oak', color: '#b68b5e', roughness: .76 }),
  metal: new MeshStandardMaterial({ name: 'slot_metal', color: '#293b44', roughness: .45, metalness: .25 }),
  linen: new MeshStandardMaterial({ name: 'slot_linen', color: '#f3eadb', roughness: .92 }),
  bulb: new MeshStandardMaterial({ name: 'slot_bulb', color: '#fff4da', roughness: .7 }),
};
let serial = 0;
function part(group, geometry, position, material = materials.body, rotation = [0, 0, 0]) {
  const mesh = new Mesh(geometry, material); mesh.name = `${group.name}-part-${++serial}`;
  mesh.position.set(...position); mesh.rotation.set(...rotation); group.add(mesh); return mesh;
}
function box(group, size, position, material, radius = .018) {
  return part(group, radius ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(v => v / 4))) : new BoxGeometry(...size), position, material);
}
function cylinder(group, top, bottom, height, position, material, rotation) {
  return part(group, new CylinderGeometry(top, bottom, height, 24), position, material, rotation);
}
function authored(id) {
  const g = new Group(); g.name = `poc-${id}`;
  if (id === 'sofa') {
    box(g, [2.12, .21, .84], [0, .265, 0]);
    box(g, [2.2, .46, .18], [0, .62, -.36]);
    for (const x of [-1.015, 1.015]) box(g, [.17, .48, .84], [x, .54, 0]);
    for (const x of [-.49, .49]) { box(g, [.945, .17, .64], [x, .435, .035], materials.body, .035); box(g, [.94, .34, .145], [x, .66, -.23], materials.linen, .04); }
    for (const x of [-.91, .91]) for (const z of [-.31, .31]) cylinder(g, .035, .045, .17, [x, .085, z], materials.oak);
  } else if (id === 'table') {
    box(g, [1.4, .075, .8], [0, .7125, 0], materials.body, .024);
    box(g, [1.15, .11, .58], [0, .625, 0], materials.oak);
    for (const x of [-.56, .56]) for (const z of [-.26, .26]) box(g, [.075, .675, .075], [x, .3375, z], materials.oak, .008);
  } else if (id === 'chair') {
    box(g, [.5, .075, .5], [0, .4625, .025], materials.body, .025);
    box(g, [.48, .32, .075], [0, .74, -.2375], materials.body, .025);
    for (const x of [-.19, .19]) {
      box(g, [.05, .86, .05], [x, .43, -.225], materials.oak, .008);
      box(g, [.05, .44, .05], [x, .22, .215], materials.oak, .008);
    }
  } else if (id === 'bed') {
    box(g, [1.6, .21, 2.02], [0, .225, .04], materials.oak);
    box(g, [1.6, .65, .10], [0, .325, -1], materials.body, .024);
    box(g, [1.52, .18, 1.97], [0, .42, .055], materials.linen, .045);
    box(g, [1.55, .095, 1.25], [0, .53, .39], materials.body, .035);
    for (const x of [-.39, .39]) box(g, [.64, .11, .40], [x, .54, -.63], materials.linen, .04);
    for (const x of [-.67, .67]) for (const z of [-.85, .85]) box(g, [.09, .14, .09], [x, .07, z], materials.metal, .008);
  } else if (id === 'cabinet') {
    box(g, [1.2, 2.01, .49], [0, 1.095, -.005], materials.body);
    for (const x of [-.3, .3]) {
      box(g, [.586, 1.86, .035], [x, 1.12, .2325], materials.body, .008);
      box(g, [.018, .23, .027], [x > 0 ? .035 : -.035, 1.13, .265], materials.metal, .007);
    }
    for (const x of [-.50, .50]) for (const z of [-.16, .16]) box(g, [.06, .13, .06], [x, .065, z], materials.oak, .006);
  } else if (id === 'pendant') {
    cylinder(g, .075, .19, .205, [0, .1475, 0], materials.body);
    cylinder(g, .20, .20, .024, [0, .037, 0], materials.body);
    cylinder(g, .012, .012, .05, [0, .275, 0], materials.metal);
    cylinder(g, .105, .105, .018, [0, .026, 0], materials.linen);
    part(g, new SphereGeometry(.03, 16, 10), [0, .03, 0], materials.bulb);
  } else if (id === 'floor-lamp') {
    cylinder(g, .20, .20, .035, [0, .0175, 0], materials.metal);
    cylinder(g, .013, .013, 1.33, [0, .69, 0], materials.metal);
    cylinder(g, .125, .20, .27, [0, 1.465, 0], materials.body);
    cylinder(g, .185, .185, .015, [0, 1.3375, 0], materials.linen);
    part(g, new SphereGeometry(.038, 16, 10), [0, 1.37, 0], materials.bulb);
  }
  return g;
}

// A small glTF 2.0 writer: embedded geometry/UVs only, no decoder, URI, image, or
// extension. Flattening the normalized transforms makes the admitted bounds
// independent of a downstream importer's pivot and hierarchy conventions.
function toGlb(group, dimensions) {
  group.updateMatrixWorld(true);
  const original = new Box3().setFromObject(group), size = original.getSize(new Vector3());
  group.scale.set(...dimensions.map((value, i) => value / size.getComponent(i)));
  group.position.set(-(original.min.x + original.max.x) / 2 * group.scale.x, -original.min.y * group.scale.y, -(original.min.z + original.max.z) / 2 * group.scale.z);
  group.updateMatrixWorld(true);
  const chunks = [], views = [], accessors = [], meshes = [], nodes = [], glMaterials = [], materialIds = new Map();
  let byteLength = 0;
  function accessor(array, type, componentType, count, target, extrema) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded);
    const index = accessors.length;
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
    chunks.push(padded); byteLength += padded.length;
    accessors.push({ bufferView: views.length - 1, componentType, count, type, ...extrema });
    return index;
  }
  group.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld); geometry.computeBoundingBox();
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    if (!uv || uv.count !== p.count) throw new Error(`${object.name}: complete UV coordinates are required`);
    const indexArray = geometry.index ? new Uint32Array(geometry.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
    const position = accessor(new Float32Array(p.array), 'VEC3', 5126, p.count, 34962, { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() });
    const normal = accessor(new Float32Array(n.array), 'VEC3', 5126, n.count, 34962);
    const texcoord = accessor(new Float32Array(uv.array), 'VEC2', 5126, uv.count, 34962);
    const indices = accessor(indexArray, 'SCALAR', 5125, indexArray.length, 34963);
    if (!materialIds.has(object.material)) {
      materialIds.set(object.material, glMaterials.length);
      const mat = object.material;
      glMaterials.push({ name: mat.name, pbrMetallicRoughness: { baseColorFactor: [...mat.color.toArray(), 1], metallicFactor: mat.metalness, roughnessFactor: mat.roughness }, doubleSided: false });
    }
    meshes.push({ name: object.name, primitives: [{ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: texcoord }, indices, material: materialIds.get(object.material) }] });
    nodes.push({ name: object.name, mesh: meshes.length - 1 }); geometry.dispose();
  });
  const gltf = { asset: { version: '2.0', generator: 'Pascal PoC local authored geometry' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials: glMaterials, accessors, bufferViews: views, buffers: [{ byteLength }] };
  const text = Buffer.from(JSON.stringify(gltf)), json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(json);
  const binary = Buffer.concat(chunks), header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8);
  jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, jsonHeader, json, binHeader, binary]), meshCount: meshes.length, vertexCount: accessors.filter(a => a.type === 'VEC3').reduce((n, a) => n + a.count, 0) / 2, slotIds: glMaterials.map(material => material.name.slice(5)).sort() };
}

await mkdir(output, { recursive: true });
const manifest = [];
for (const [id, dimensions] of definitions) {
  const model = authored(id), result = toGlb(model, dimensions);
  await writeFile(resolve(output, `${id}.glb`), result.bytes);
  manifest.push({ id, dimensionsMm: dimensions.map(n => Math.round(n * 1000)), boundsMm: { min: [-dimensions[0] * 500, 0, -dimensions[2] * 500], max: [dimensions[0] * 500, dimensions[1] * 1000, dimensions[2] * 500] }, pivot: 'bottom-centre', slotIds: result.slotIds, bytes: result.bytes.length, sha256: createHash('sha256').update(result.bytes).digest('hex'), meshes: result.meshCount, vertices: result.vertexCount, licence: 'MIT', source: 'Authored procedural geometry in scripts/generate-models.mjs' });
  model.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ generated: manifest.map(({ id, bytes, meshes }) => ({ id, bytes, meshes })), totalBytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0) }, null, 2));

if (process.argv.includes('--thumbnails')) {
  // Optional explicit headed capture. It uses its own ephemeral loopback
  // server and browser; it never starts/stops the application preview.
  const { createServer } = await import('node:http');
  const { build } = await import('esbuild');
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.cache/playwright');
  const { chromium } = await import('@playwright/test');
  const client = `import * as T from 'three';import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(384,384);renderer.setPixelRatio(1);renderer.setClearColor('#f4f6f8',1);renderer.outputColorSpace=T.SRGBColorSpace;document.body.appendChild(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.01,100),loader=new GLTFLoader();scene.add(new T.HemisphereLight('#ffffff','#c3b29d',2));const key=new T.DirectionalLight('#ffffff',3);key.position.set(3,6,5);scene.add(key);let current;
    window.loadModel=async(id)=>{if(current){scene.remove(current);current.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}})}current=(await loader.loadAsync('/models/'+id+'.glb')).scene;scene.add(current);const box=new T.Box3().setFromObject(current),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());const d=Math.max(size.x,size.y,size.z)*2.7;camera.position.copy(center).add(new T.Vector3(d*.75,d*.52,d*.92));camera.lookAt(center);renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));renderer.render(scene,camera);return {min:box.min.toArray(),max:box.max.toArray()}};`;
  const bundle = await build({ stdin: { contents: client, resolveDir: root }, bundle: true, format: 'iife', platform: 'browser', write: false });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<body style="margin:0"><script src="/bundle.js"></script></body>'); }
    if (path === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].contents); }
    const admitted = definitions.find(([id]) => path === `/models/${id}.glb`);
    if (!admitted) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', 'model/gltf-binary'); res.end(await readFile(resolve(output, `${admitted[0]}.glb`)));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 384, height: 384 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin); await page.waitForFunction(() => typeof window.loadModel === 'function');
    const checks = [];
    for (const [id, dimensions] of definitions) {
      const bounds = await page.evaluate(id => window.loadModel(id), id);
      for (let axis = 0; axis < 3; axis++) if (Math.abs(bounds.max[axis] - bounds.min[axis] - dimensions[axis]) > .00001) throw new Error(`${id}: rendered GLB bounds differ on axis ${axis}`);
      await page.locator('canvas').screenshot({ path: resolve(output, `${id}.png`) }); checks.push({ id, bounds });
    }
    await writeFile(resolve(output, 'thumbnail-verification.json'), JSON.stringify({ browser: 'headed Chromium', renderer: 'Three WebGL model-thumbnail renderer; house scene uses Pascal Viewer', models: checks }, null, 2) + '\n');
    console.log('Captured seven actual-model thumbnails and checked loaded GLB bounds.');
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}
