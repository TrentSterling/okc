#!/usr/bin/env node
// Export real streamed tile buffers into the existing native diagnostic format.
// Render with render-city-diagnostics.py. This does not run a browser or measure FPS.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registerThree} from '../lib/register-three.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const directory = path.resolve(option('--dist', path.join(root, 'dist')));
const output = path.resolve(option('--output', '/tmp/okc-metro-diagnostics'));
const label = option('--label', 'Prairie Prism 0.7 metro geometry');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const load = name => import(pathToFileURL(path.join(directory, name)).href);
const json = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
registerThree(root);
const require = createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || root, 'package.json'));
const {createCanvas} = require('@napi-rs/canvas');
globalThis.document = {createElement: () => createCanvas(1, 1)};
const THREE = await import('three');
const [{compileTile}, {createMetroMaterials}, {createCityMaterials}, {mountTile}] = await Promise.all([
  load('metro/mesh-builder.js'), load('metro/materials.js'), load('world/materials.js'), load('metro/tile-scene.js'),
]);
const atlas = json('geo/metro/manifest.json');
const places = json('geo/metro/pois.json').pois;
const inventory = new Map(atlas.tiles.map(tile => [tile.id, tile]));
const examples = [
  {id: 'yukon-park', name: 'Yukon / Christmas in the Park surroundings', poi: 'yukon-christmas-lights', eye: [180, 80, 180], aim: [0, 0, 0]},
  {id: 'bethany-streets', name: 'Bethany / NW 39th street and neighborhood', poi: 'birrieria-diaz-bethany', eye: [110, 70, 160], aim: [0, 3, 0]},
  {id: 'west-reno', name: 'West Reno / OKC Outlets footprint and access roads', poi: 'okc-outlets', eye: [250, 110, 270], aim: [0, 0, 0]},
  {id: 'lake-hefner', name: 'Lake Hefner / Stars & Stripes shoreline', poi: 'stars-stripes', eye: [180, 100, 100], aim: [0, 0, -150]},
];
fs.mkdirSync(output, {recursive: true});
const manifest = {
  label, directory, views: [], materials: [], draws: [], stride: 11, sourceTiles: [],
  scope: 'Actual compileTile production mesh buffers, mapped footprint/road/water polygons, UVs, native Canvas color-map pixels and production mapped-tree instances. Fixed diagnostic Lambert shading and logarithmic depth. Includes the production prairie ground plane. Excludes Three PBR, sky, shadow maps, point lights, festive instancing, UI, driving and streaming timing. Not a browser screenshot, photo replica or FPS benchmark.',
};
const materials = createMetroMaterials();
const materialIds = new Map();
function materialId(material) {
  if (materialIds.has(material.uuid)) return materialIds.get(material.uuid);
  const id = manifest.materials.length;
  let map = null;
  if (material.map?.image?.getContext) {
    const texture = material.map;
    const file = `texture-${id}.png`;
    fs.writeFileSync(path.join(output, file), texture.image.toBuffer('image/png'));
    map = {file, width: texture.image.width, height: texture.image.height, flipY: texture.flipY,
      wrapS: texture.wrapS, wrapT: texture.wrapT, repeat: texture.repeat.toArray(),
      offset: texture.offset.toArray(), colorSpace: texture.colorSpace};
  }
  materialIds.set(material.uuid, id);
  manifest.materials.push({id, name: material.name || material.type, color: material.color?.toArray() || [1, 1, 1],
    map, side: material.side, roughness: material.roughness ?? 1, metalness: material.metalness ?? 0,
    transparent: !!material.transparent, depthWrite: material.depthWrite, opacity: material.opacity ?? 1});
  return id;
}
const file = fs.openSync(path.join(output, 'city.f32'), 'w');
const geometryHash = createHash('sha256');
let vertexCount = 0;
function writeMesh(name, positions, normals, uvs, material) {
  if (positions.length % 9 || normals.length !== positions.length || uvs.length * 3 !== positions.length * 2)
    throw Error(`Invalid geometry buffer layout: ${name}`);
  const count = positions.length / 3;
  const values = new Float32Array(count * 11);
  for (let i = 0; i < count; i++) {
    const p = i * 3, u = i * 2;
    const v = [positions[p], positions[p + 1], positions[p + 2], normals[p], normals[p + 1], normals[p + 2], uvs[u], uvs[u + 1], 1, 1, 1];
    if (!v.every(Number.isFinite)) throw Error(`Nonfinite geometry: ${name}, vertex ${i}`);
    values.set(v, i * 11);
  }
  const bytes = Buffer.from(values.buffer);
  fs.writeSync(file, bytes); geometryHash.update(bytes);
  manifest.draws.push({name, material: materialId(material), start: vertexCount, count});
  vertexCount += count;
}

function writeInstances(object, name) {
  const g = object.geometry, position = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
  const count = g.index?.count ?? position.count;
  const positions = new Float32Array(count * object.count * 3), normals = new Float32Array(positions.length);
  const uvs = new Float32Array(count * object.count * 2);
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  object.updateMatrixWorld(true);
  for (let instance = 0; instance < object.count; instance++) {
    object.getMatrixAt(instance, matrix); matrix.premultiply(object.matrixWorld); normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < count; i++) {
      const index = g.index?.getX(i) ?? i, at = instance * count + i;
      p.fromBufferAttribute(position, index).applyMatrix4(matrix);
      n.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix).normalize();
      positions.set(p.toArray(), at * 3); normals.set(n.toArray(), at * 3);
      uvs.set([uv?.getX(index) || 0, uv?.getY(index) || 0], at * 2);
    }
  }
  writeMesh(name, positions, normals, uvs, object.material);
}

// Use the same material factory, seed and ground scale as the app bridge.
const group = new THREE.Group();
createCityMaterials({group, dynamicLights: [], seed: 1907});
const ground = group.children.find(object => object.material?.name === 'Prairie ground');
if (!ground) throw Error('Production prairie ground not found');
ground.scale.set(6, 6, 1); ground.updateMatrixWorld(true);
const geometry = ground.geometry.clone().toNonIndexed();
geometry.applyMatrix4(ground.matrixWorld);
writeMesh('Production prairie ground', geometry.attributes.position.array, geometry.attributes.normal.array,
  geometry.attributes.uv.array, ground.material);

const compiled = new Map();
const roofCounts = {};
let inspectedBuildings = 0, mappedTrees = 0;
for (const example of examples) {
  const poi = places.find(place => place.id === example.poi);
  if (!poi || !Number.isFinite(poi.x) || !Number.isFinite(poi.z)) throw Error(`Missing inspection anchor: ${example.poi}`);
  const cx = Math.floor(poi.x / atlas.tileSize), cz = Math.floor(poi.z / atlas.tileSize);
  const neighborhood = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const id = `${cx + dx}_${cz + dz}`;
    const info = inventory.get(id);
    if (!info) continue;
    neighborhood.push(id);
    if (compiled.has(id)) continue;
    const bytes = fs.readFileSync(path.join(directory, 'geo/metro', info.url));
    if (info.sha256 && hash(bytes) !== info.sha256) throw Error(`Tile changed during diagnostic export: ${id}`);
    const tile = JSON.parse(bytes);
    const result = compileTile(tile, {detail: true, core: atlas.coreBounds});
    compiled.set(id, result);
    manifest.sourceTiles.push({id, bytes: bytes.length, sha256: hash(bytes), buildings: result.buildings.length});
    for (const mesh of result.meshes)
      writeMesh(`${id} / ${mesh.layer || 'metro'} / ${mesh.kind}`, mesh.positions, mesh.normals, mesh.uvs, materials[mesh.kind] || materials.stone);
    if (result.trees?.length) {
      const parent = new THREE.Group();
      const treeTile = mountTile({parent, materials, drivingWorld: {bounds: atlas.bounds, grid: new Map()}, id,
        result: {meshes: [], buildings: [], lamps: [], trees: result.trees}, raw: tile, detail: true});
      treeTile.group.traverse(object => { if (object.isInstancedMesh) writeInstances(object, `${id} / ${object.name}`); });
      mappedTrees += result.trees.length;
    }
    for (const building of result.buildings) {
      const key = `${building.renderedRoof || 'flat'} / ${building.renderedRoofSource || 'unspecified'}`;
      roofCounts[key] = (roofCounts[key] || 0) + 1; inspectedBuildings++;
    }
  }
  manifest.views.push({id: example.id, name: example.name,
    eye: [poi.x + example.eye[0], example.eye[1], poi.z + example.eye[2]],
    target: [poi.x + example.aim[0], example.aim[1], poi.z + example.aim[2]], fov: 55,
    anchorId: poi.id, anchorAccuracy: poi.coordinateAccuracy || poi.coordinateSource || 'source map pin', tiles: neighborhood});
  if (example.id === 'bethany-streets') {
    const buildings = neighborhood.flatMap(id => compiled.get(id)?.buildings || []);
    const pitched = buildings.filter(b => b.renderedRoof === 'gabled' && b.h < 12)
      .sort((a, b) => (a.x - poi.x) ** 2 + (a.z - poi.z) ** 2 - (b.x - poi.x) ** 2 - (b.z - poi.z) ** 2)[0];
    if (pitched) manifest.views.push({id: 'bethany-roof-detail', name: 'Bethany / gable on a mapped footprint',
      eye: [pitched.x + 35, 21, pitched.z + 43], target: [pitched.x, pitched.h * .5, pitched.z], fov: 52,
      buildingId: pitched.id, roofSource: pitched.renderedRoofSource, footprintSource: pitched.footprintSource, tiles: neighborhood});
  }
}
fs.closeSync(file);
manifest.geometry = {vertices: vertexCount, triangles: vertexCount / 3, meshes: manifest.draws.length,
  sha256: geometryHash.digest('hex'), tiles: compiled.size, inspectedBuildings, mappedTrees, roofCounts, finiteBufferValues: true};
manifest.sourceHashes = Object.fromEntries(['geo/metro/manifest.json', 'metro/mesh-builder.js', 'metro/roof-shapes.js',
  'metro/materials.js', 'metro/tile-scene.js', 'world/materials.js', 'world/surface-textures.js']
  .filter(name => fs.existsSync(path.join(directory, name)))
  .map(name => [name, hash(fs.readFileSync(path.join(directory, name)))]));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({output, label, views: manifest.views.map(view => view.id), ...manifest.geometry}, null, 2));
