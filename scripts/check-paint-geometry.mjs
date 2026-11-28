#!/usr/bin/env node
// Audit actual built paint instance matrices against the actual packed ground.
// This is a geometry check, not a renderer, shader-depth or GPU-performance test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {register} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const directory = path.resolve(option('--dist', process.env.OKC_BUILD_OUTPUT || path.join(root, 'dist')));
const report = option('--report', null);
const started = performance.now();
const load = name => import(pathToFileURL(path.join(directory, name)).href);
const read = name => fs.readFileSync(path.join(directory, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
register(new URL('./lib/three-loader.mjs', import.meta.url), {
  data: {threeURL: pathToFileURL(path.join(directory, 'vendor/three.module.js')).href},
});

const THREE = await load('vendor/three.module.js');
const [{createBatching}, {addStreets}, {addRoadMarkings}] = await Promise.all([
  load('world/batching.js'), load('world/streets.js'), load('world/road-markings.js'),
]);
const compiled = JSON.parse(gunzipSync(read('geo/base-surfaces.json.gz')));
const group = new THREE.Group(), unit = new THREE.BoxGeometry(1, 1, 1);
// Same unit plane supplied by createCityMaterials to the production batching API.
const paintGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const roadPaint = new THREE.MeshBasicMaterial(), yellow = new THREE.MeshBasicMaterial();
const materials = {roadPaint, yellow};
const metadata = new Map([[roadPaint, []], [yellow, []]]);
const batching = createBatching({group, unit, paintGeometry, chunkSize: 1024});
let serial = 0, phase = 'compiled';
function addPaint(material, x, y, z, length, width, rotation = 0) {
  const id = serial++;
  const kind = phase === 'compiled' ? compiled.streetPaint[id]?.kind : 'road';
  if (!kind || !metadata.has(material)) throw Error(`Unexpected production paint record ${id}`);
  metadata.get(material).push({id, source: phase, color: material === yellow ? 'yellow' : 'white',
    kind, x, y, z, length, width, rotation});
  batching.addBatch(paintGeometry, material, [x, y, z], [length, 1, width], rotation);
}
// addStreets also creates unrelated lamp-pool textures. Only that canvas adapter
// and nonpaint decoration sinks are stubbed; paint planning and batching are real.
const previousDocument = globalThis.document;
try {
  globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => ({
    createRadialGradient: () => ({addColorStop() {}}), fillRect() {},
  })})};
  addStreets({group: {add() {}}, addBatch() {}, addBox() {}, addPaint, materials, dynamicLights: []});
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
if (serial !== compiled.streetPaint.length) throw Error('Built streetPaint and addStreets disagree');
phase = 'extra-road-markings';
const extraStats = addRoadMarkings({addPaint, materials});
batching.flush(materials);

// Read back Float32 instanceMatrix values instead of rebuilding ideal rectangles.
const marks = [], matrix = new THREE.Matrix4(), corner = new THREE.Vector3();
for (const mesh of group.children) for (let i = 0; i < mesh.count; i++) {
  mesh.getMatrixAt(i, matrix);
  const record = metadata.get(mesh.material)[i];
  marks.push({...record, corners: [0, 1, 3, 2].map(index =>
    corner.fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(matrix).toArray())});
}
marks.sort((a, b) => a.id - b.id);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'okc-paint-geometry-'));
try {
  const layout = JSON.parse(read('geo/base-city-layout.json'));
  const packed = gunzipSync(read('geo/base-city.bin.gz'));
  const groundFile = fs.openSync(path.join(temporary, 'ground.f64'), 'w');
  const draws = [];
  let cursor = 0;
  try {
    for (const chunk of layout.chunks) {
      if (!chunk.material.startsWith('ground.')) continue;
      const vertices = new Float32Array(packed.buffer, packed.byteOffset + chunk.vRange[0], chunk.vRange[1] / 4);
      const Index = chunk.indexType === 32 ? Uint32Array : Uint16Array;
      const indices = new Index(packed.buffer, packed.byteOffset + chunk.iRange[0], chunk.iRange[1] / Index.BYTES_PER_ELEMENT);
      const points = [];
      for (let k = 0; k < indices.length; k += 3) {
        if (Math.abs(vertices[indices[k] * 8 + 4]) < .5) continue; // vertical curb risers cannot underlie paint
        for (let j = 0; j < 3; j++) for (let axis = 0; axis < 3; axis++)
          points.push(vertices[indices[k + j] * 8 + axis] + chunk.origin[axis]);
      }
      fs.writeSync(groundFile, Buffer.from(new Float64Array(points).buffer));
      draws.push({kind: chunk.material.slice(7), key: chunk.key, start: cursor, vertices: points.length / 3});
      cursor += points.length / 3;
    }
  } finally { fs.closeSync(groundFile); }
  const dependencies = ['geo/base-city-layout.json', 'geo/base-city.bin.gz', 'geo/base-surfaces.json.gz',
    'city-data.js', 'world-surfaces.js', 'world/batching.js', 'world/streets.js', 'world/road-markings.js',
    'world/route.js', 'world/geometry.js', 'world/textures.js', 'vendor/three.module.js', 'vendor/three.core.js'];
  const sourceHashes = Object.fromEntries(dependencies.map(name => [name, hash(read(name))]));
  const checkHashes = Object.fromEntries(['scripts/check-paint-geometry.mjs', 'scripts/check-paint-geometry.py']
    .map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
  fs.writeFileSync(path.join(temporary, 'input.json'), JSON.stringify({
    scope: 'Production addStreets/addRoadMarkings/createBatching Float32 instance transforms and actual packed ground vertices, including chunk origins. No renderer, shader-depth or GPU-performance claim.',
    sourceHashes, checkHashes, extraStats, marks, draws,
  }));
  const result = spawnSync(process.env.OKC_PYTHON || 'python3', [path.join(root, 'scripts/check-paint-geometry.py'), temporary],
    {encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 90000});
  const reportPath = path.join(temporary, 'report.json');
  if (!fs.existsSync(reportPath)) throw Error(`Paint geometry audit failed: ${result.stderr || result.error?.message || result.stdout}`);
  const summary = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  summary.elapsedSeconds = Math.round((performance.now() - started) / 10) / 100;
  if (report) {
    const destination = path.resolve(report);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, JSON.stringify(summary, null, 2) + '\n');
  }
  console.log(JSON.stringify({scope: summary.scope, paintRectangles: summary.paintRectangles,
    groundTriangles: summary.groundTriangles, paintToOwnedSurfaceGapM: summary.paintToOwnedSurfaceGapM,
    significantPaintOverlapPairs: summary.paintPaintOverlap.pairsOver0_0001M2,
    failures: summary.failures, elapsedSeconds: summary.elapsedSeconds, report: report ? path.resolve(report) : null}));
  if (result.status !== 0) throw Error(`Paint geometry audit failed: ${summary.failures.join('; ') || result.stderr || result.error?.message}`);
} finally { fs.rmSync(temporary, {recursive: true, force: true}); }
