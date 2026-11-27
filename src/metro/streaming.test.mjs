import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, PerspectiveCamera} from 'three';
import {createDrivingWorld} from '../driving.js';
import {createMetroStreamer} from './streaming.js';
import {meshBounds} from './mesh-bounds.js';

const car = {x: 256, z: 256};
const bubble = [];
for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) bubble.push(x + '_' + z);
const flush = () => new Promise(resolve => setImmediate(resolve));
const abortError = () => Object.assign(new Error('Cancelled'), {name: 'AbortError'});
function cameraAt(x = 256, y = 120, z = 256, tx = 1856, tz = 256, fov = 65) {
  const camera = new PerspectiveCamera(fov, 1, .5, 7500);
  camera.position.set(x, y, z); camera.lookAt(tx, 0, tz); return camera;
}

function fixture(t, {entries, coreBounds, quality = 'balanced'} = {}) {
  const original = {document: globalThis.document, raf: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame};
  const context = {createImageData: () => ({data: new Uint8ClampedArray(256 * 256 * 4)}), putImageData() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}};
  globalThis.document = {createElement: () => ({getContext: () => context})};
  let serial = 0, frame = 0;
  const callbacks = new Map(), mounted = [], jobs = [];
  globalThis.requestAnimationFrame = callback => { callbacks.set(++serial, callback); return serial; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  function submit(kind, value, options, {signal} = {}) {
    const id = kind === 'load' ? new URL(value.url).pathname.match(/\/tiles\/([^/]+)\.json$/)[1] : value.id;
    const job = {kind, id, options: {...options}, signal, settled: false};
    const promise = new Promise((resolve, reject) => {
      const finish = (error, result) => { if (job.settled) return; job.settled = true; signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(result); };
      const abort = () => finish(abortError());
      job.resolve = replacement => {
        const result = replacement || {id, meshes: [], buildings: [], lamps: []};
        finish(null, kind === 'load' ? {raw: {id, roads: []}, result} : result);
      };
      job.reject = error => finish(error);
      signal?.addEventListener('abort', abort, {once: true});
    });
    jobs.push(job); return promise;
  }
  const compiler = {load: (source, options, control) => submit('load', source, options, control),
    compile: (raw, options, control) => submit('compile', raw, options, control),
    stats: () => ({workers: 2, active: jobs.filter(job => !job.settled).length, queued: 0}),
    dispose() { for (const job of jobs) job.reject(abortError()); }};
  if (!entries) {
    entries = [];
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) entries.push({id: x + '_' + z, url: `tiles/${x}_${z}.json`});
  }
  const scene = new Scene(), stream = createMetroStreamer({scene, manifest: {tileSizeMeters: 512, tiles: entries, coreBounds},
    drivingWorld: createDrivingWorld([], {minX: -20000, minZ: -20000, maxX: 20000, maxZ: 20000}), compiler,
    onTile: (_, group) => mounted.push(group.name.replace('Geographic tile ', ''))});
  stream.setQuality(quality);
  t.after(() => {
    stream.dispose(); globalThis.document = original.document;
    if (original.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = original.raf;
    if (original.cancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = original.cancel;
  });
  async function tick() {
    const before = mounted.length, current = [...callbacks.values()]; callbacks.clear(); frame++;
    for (const callback of current) callback(frame * 1000 / 60);
    await flush();
    assert(mounted.length - before <= 1, 'Worker completions may mount at most one tile per animation frame.');
  }
  async function resolveReady() { for (const job of jobs.filter(job => !job.settled)) job.resolve(); await flush(); }
  async function drain() {
    for (let i = 0; i < 300 && (stream.stats().pendingTiles || callbacks.size); i++) { await resolveReady(); await tick(); }
    assert.equal(stream.stats().pendingTiles, 0, 'All selected work must eventually settle.');
    assert.equal(callbacks.size, 0, 'No mount frame should remain after completion.');
  }
  return {stream, scene, jobs, mounted, callbacks, tick, resolveReady, drain};
}
function pinned(stream) { for (const id of bubble) assert(stream.tiles.has(id), `Loaded collision tile ${id} must remain pinned.`); }

test('three simultaneous completions mount one tile per RAF, not one burst', async t => {
  const f = fixture(t); f.stream.updatePosition(car);
  assert.equal(f.jobs.length, 3);
  await f.resolveReady();
  assert.equal(f.mounted.length, 0); assert.equal(f.stream.stats().queuedMounts, 3); assert.equal(f.callbacks.size, 1);
  await f.tick(); assert.equal(f.mounted.length, 1);
  await f.tick(); assert.equal(f.mounted.length, 2);
  await f.drain(); assert.equal(f.stream.tiles.size, 25); pinned(f.stream);
});

test('stationary-car camera rotation loads the new view and bounds resident cache', async t => {
  const f = fixture(t), camera = cameraAt();
  f.stream.updateView(car, camera, 0); await f.drain(); pinned(f.stream);
  assert(f.stream.tiles.has('2_0')); assert(!f.stream.tiles.has('-3_0'));
  camera.lookAt(-1344, 0, 256); f.stream.updateView(car, camera, 200); await f.drain();
  assert(f.stream.tiles.has('-3_0'), 'A changed camera direction must request new tiles without car movement.');
  pinned(f.stream); assert(f.stream.tiles.size <= 48);
  camera.lookAt(256, 0, -1600); f.stream.updateView(car, camera, 400); await f.drain();
  pinned(f.stream); assert(f.stream.tiles.size <= 48);
  f.stream.setQuality('low'); await f.drain(); pinned(f.stream); assert(f.stream.tiles.size <= 24);
});

test('projection-only zoom invalidates streaming selection without moving the camera', async t => {
  const f = fixture(t, {quality: 'high'}), camera = cameraAt(256, 2500, 256, 256, 256);
  camera.zoom = 4; camera.updateProjectionMatrix();
  f.stream.updateView(car, camera, 0); await f.drain(); assert(!f.stream.tiles.has('2_0'));
  camera.zoom = 1; camera.updateProjectionMatrix();
  f.stream.updateView(car, camera, 200); await f.drain();
  assert(f.stream.tiles.has('2_0'), 'Zooming out must request newly visible tiles.'); pinned(f.stream);
});

test('view changes abort stale compiler and queued mount work while preserving car jobs', async t => {
  const f = fixture(t), camera = cameraAt(); f.stream.updateView(car, camera, 0);
  while (f.stream.tiles.size < 9) { await f.resolveReady(); await f.tick(); }
  const stale = f.jobs.filter(job => !bubble.includes(job.id) && !f.stream.tiles.has(job.id));
  assert(stale.length > 0, 'The old view must have work in flight for this regression.');
  camera.lookAt(-1344, 0, 256); f.stream.updateView(car, camera, 200);
  assert(stale.some(job => job.signal.aborted));
  assert(f.jobs.filter(job => bubble.includes(job.id)).every(job => !job.signal.aborted));
  await f.drain(); pinned(f.stream); assert(f.stream.tiles.has('-3_0'));
  for (const job of stale.filter(job => job.signal.aborted)) assert(!f.mounted.includes(job.id), 'Aborted old-view output must not mount later.');
});

test('detail upgrades requested after compilation still reach the mounted tile', async t => {
  const f = fixture(t, {quality: 'low', entries: [{id: '0_0', url: 'tiles/0_0.json'}]});
  f.stream.updatePosition(car); await f.resolveReady();
  assert.equal(f.stream.stats().queuedMounts, 1); assert.equal(f.jobs[0].options.detail, false);
  f.stream.setQuality('high');
  await f.drain();
  assert.equal(f.stream.tiles.get('0_0').detail, true, 'A quality upgrade while waiting for RAF must not get lost.');
  assert(f.jobs.some(job => job.kind === 'compile' && job.options.detail), 'The pending low-detail result must be upgraded.');
});

test('disposal rejects a collision ensure waiting on RAF and cancels its mount', async t => {
  const f = fixture(t, {entries: [{id: '0_0', url: 'tiles/0_0.json'}]});
  const ready = f.stream.ensure(car).then(() => null, error => error);
  await f.resolveReady(); assert.equal(f.stream.stats().queuedMounts, 1);
  f.stream.dispose();
  assert.equal((await ready).name, 'AbortError');
  assert.equal(f.callbacks.size, 0); assert.equal(f.scene.children.length, 0);
  await f.tick(); assert.equal(f.mounted.length, 0); assert(f.jobs.every(job => job.signal.aborted));
});

test('a collision bubble wholly covered by the static core needs no metro downloads', async t => {
  const f = fixture(t, {entries: bubble.map(id => ({id, url: `tiles/${id}.json`})),
    coreBounds: {minX: -512, maxX: 1024, minZ: -512, maxZ: 1024}});
  assert.equal(await f.stream.ensure(car), true);
  assert.equal(f.jobs.length, 0); assert.equal(f.stream.stats().pendingTiles, 0);
});

test('mounting retains the worker bounds and transferred vertex storage', async t => {
  const f = fixture(t, {entries: [{id: '0_0', url: 'tiles/0_0.json'}]});
  // Axis extrema give a conservative worker sphere larger than a fresh scan
  // of these six vertices would produce; preserve the already checked bound.
  const positions = new Float32Array([-1,0,0, 1,0,0, 0,-1,0, 0,1,0, 0,0,-1, 0,0,1]);
  const bounds = meshBounds(positions);
  f.stream.updatePosition(car);
  f.jobs[0].resolve({id: '0_0', meshes: [{kind: 'stone', positions, normals: new Float32Array(18), uvs: new Float32Array(12), bounds}], buildings: [], lamps: []});
  await flush(); await f.tick(); await f.drain();
  const geometry = f.stream.tiles.get('0_0').group.children[0].geometry;
  assert.equal(geometry.attributes.position.array, positions);
  assert.deepEqual(geometry.boundingBox.min.toArray(), [-1, -1, -1]);
  assert.deepEqual(geometry.boundingBox.max.toArray(), [1, 1, 1]);
  assert.deepEqual(geometry.boundingSphere.center.toArray(), [0, 0, 0]);
  assert.equal(geometry.boundingSphere.radius, Math.sqrt(3));
});
