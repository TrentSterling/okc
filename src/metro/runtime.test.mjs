import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createGeometryCompiler} from './geometry-jobs.js';
import {createRouterClient} from './router-client.js';
import {createRouter, sampleRoute} from './road-router.js';
import {loadTileData} from './tile-data.js';
import {interpretRoof} from './roof-shapes.js';
import {mountTile, unmountTile, setTileAppearance} from './tile-scene.js';
import {createDrivingWorld} from '../driving.js';
import {createMetroStreamer} from './streaming.js';

function fakeWorkers() {
  const workers = [];
  const factory = () => {
    const worker = {messages: [], dead: false, postMessage(message) { this.messages.push(message); }, terminate() { this.dead = true; }};
    workers.push(worker); return worker;
  };
  const answer = (worker, result) => worker.onmessage({data: {request: worker.messages.at(-1).request, result}});
  return {workers, factory, answer};
}

test('geometry work uses two workers, queues excess, and releases every pending promise', async () => {
  const {workers, factory, answer} = fakeWorkers();
  const pool = createGeometryCompiler({workerFactory: factory, hardwareConcurrency: 8});
  const a = pool.compile({id: 'a'}, {}), b = pool.compile({id: 'b'}, {}), c = pool.compile({id: 'c'}, {});
  assert.deepEqual(pool.stats(), {workers: 2, active: 2, queued: 1});
  answer(workers[0], {id: 'a'});
  assert.deepEqual(await a, {id: 'a'});
  assert.equal(workers[0].messages.at(-1).tile.id, 'c');
  answer(workers[1], {id: 'b'}); answer(workers[0], {id: 'c'});
  await Promise.all([b, c]);
  const pending = [pool.compile({}, {}).catch(error => error), pool.compile({}, {}).catch(error => error), pool.compile({}, {}).catch(error => error)];
  pool.dispose();
  assert.ok((await Promise.all(pending)).every(error => error.name === 'AbortError'));
  assert.ok(workers.every(worker => worker.dead));
  assert.deepEqual(pool.stats(), {workers: 0, active: 0, queued: 0});
});

test('aborting stale tile work frees a worker for the new neighborhood', async () => {
  const {workers, factory, answer} = fakeWorkers(), controller = new AbortController();
  const pool = createGeometryCompiler({workerFactory: factory, hardwareConcurrency: 2});
  const old = pool.compile({id: 'old'}, {}, {signal: controller.signal}).catch(error => error);
  const current = pool.compile({id: 'new'}, {});
  controller.abort();
  assert.equal((await old).name, 'AbortError');
  assert.equal(workers[0].dead, true);
  assert.equal(workers[1].messages[0].tile.id, 'new');
  answer(workers[1], {id: 'new'});
  assert.equal((await current).id, 'new'); pool.dispose();
});

test('worker startup failure yields a usable fallback without swallowing geometry errors', async () => {
  const {workers, factory} = fakeWorkers(); let fallbacks = 0;
  const pool = createGeometryCompiler({workerFactory: factory, fallback: async () => { fallbacks++; return {ok: true}; }});
  const promise = pool.compile({}, {});
  workers[0].onerror({preventDefault() {}});
  assert.deepEqual(await promise, {ok: true}); assert.equal(fallbacks, 1); pool.dispose();
});

test('routing graph is lazy and idle disposal allows a clean reopen', async () => {
  const {workers, factory, answer} = fakeWorkers();
  const router = createRouterClient({url: 'https://example.test/network.json', workerFactory: factory, idleMs: 10});
  assert.equal(workers.length, 0);
  const route = router.route({x: 0, z: 0}, {x: 10, z: 0});
  assert.equal(workers[0].messages[0].method, 'route');
  answer(workers[0], {ok: true}); assert.deepEqual(await route, {ok: true});
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(workers[0].dead, true);
  const nearest = router.closestRoad({x: 4, z: 2});
  assert.equal(workers.length, 2); answer(workers[1], {x: 4, z: 0});
  assert.deepEqual(await nearest, {x: 4, z: 0}); router.dispose();
});

test('one-way routing cannot jump backwards between two points on the same segment', () => {
  const router = createRouter({nodes: [[0, 0], [100, 0], [100, 100], [0, 100]], roads: [
    {id: 'east', n: [0, 1], oneway: true}, {id: 'around', n: [1, 2, 3, 0], oneway: true},
  ]});
  const forward = router.route({x: 20, z: 1}, {x: 80, z: 1});
  assert.equal(forward.ok, true); assert.equal(forward.meters, 60);
  const backwards = router.route({x: 80, z: 1}, {x: 20, z: 1});
  assert.equal(backwards.ok, true); assert.equal(backwards.meters, 340);
  assert.deepEqual(backwards.points, [[80, 0], [100, 0], [100, 100], [0, 100], [0, 0], [20, 0]]);
  assert.equal(sampleRoute(backwards, 340).finished, true);
  const deadEnd = createRouter({nodes: [[0, 0], [100, 0]], roads: [{id: 'east', n: [0, 1], oneway: true}]});
  assert.equal(deadEnd.route({x: 80, z: 1}, {x: 20, z: 1}).ok, false);
  assert.equal(deadEnd.route({x: 20, z: 1}, {x: 100, z: 0}).ok, true);
  assert.equal(sampleRoute(deadEnd.route({x: 20, z: 1}, {x: 20, z: 1}), 0).finished, true);
});

test('compressed downloads accept both gzip bytes and browser-decoded JSON', async t => {
  const originalFetch = globalThis.fetch, expected = {buildings: [{id: 'b'}]};
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const payload of [gzipSync(JSON.stringify(expected)), JSON.stringify(expected)]) {
    globalThis.fetch = async () => new Response(payload);
    assert.deepEqual(await loadTileData({url: 'plain', gzipUrl: 'compressed'}), expected);
  }
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response('', {status: 404}) : new Response(JSON.stringify(expected));
  assert.deepEqual(await loadTileData({url: 'plain', gzipUrl: 'compressed'}), expected);
  assert.equal(calls, 2);
});

test('pitched roofs stay within the mapped footprint and total height; courtyards remain open', () => {
  const ring = [[3000, 0], [3020, 0], [3020, 10], [3000, 10]];
  const roof = interpretRoof({roof: 'gabled', roofHeight: 1.5, roofSource: 'OSM roof:shape'}, ring, 6, true);
  assert.equal(roof.shape, 'gabled'); assert.equal(roof.eaves, 4.5);
  assert.equal(roof.heightAt(3010, 5), 6); assert.equal(roof.heightAt(3000, 0), 4.5);
  for (const piece of roof.pieces) for (const [x, z] of piece) {
    assert.ok(x >= 3000 && x <= 3020 && z >= 0 && z <= 10);
    assert.ok(roof.heightAt(x, z) <= 6);
  }
  const hip=interpretRoof({roof:'hipped',roofHeight:1.5},ring,6,true);assert.equal(hip.shape,'hipped');assert.equal(hip.heightAt(3010,5),6);assert.equal(hip.heightAt(3000,5),4.5);
  assert.equal(interpretRoof({roof: 'unknown'}, ring, 6, true).source, 'Inferred residential pitched roof');
  assert.equal(interpretRoof({roof: 'gabled', holes: [[[3005, 2], [3010, 2], [3010, 8], [3005, 8]]]}, ring, 6, true).shape, 'flat');
});

let compileTile;
async function meshCompiler(t) {
  if (compileTile) return compileTile;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'okc-metro-test-'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  fs.mkdirSync(path.join(directory, 'metro'));
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  for (const name of ['mesh-builder.js', 'roof-shapes.js']) fs.copyFileSync(path.join(root, 'src/metro', name), path.join(directory, 'metro', name));
  fs.symlinkSync(path.join(root, 'public/vendor'), path.join(directory, 'vendor'), 'dir');
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  ({compileTile} = await import(pathToFileURL(path.join(directory, 'metro/mesh-builder.js')).href));
  return compileTile;
}

test('compiled gable and courtyard geometry is finite with upward roofs and closed inner walls', async t => {
  const compile = await meshCompiler(t);
  const result = compile({id: '6_0', buildings: [
    {id: 'house', kind: 'house', roof: 'gabled', roofHeight: 1.5, h: 6, p: [[3100, 0], [3120, 0], [3120, 10], [3100, 10]]},
    {id: 'court', h: 8, p: [[3200, 0], [3220, 0], [3220, 20], [3200, 20]], holes: [[[3205, 5], [3215, 5], [3215, 15], [3205, 15]]]},
  ]});
  assert.equal(result.buildings.length, 2);
  assert.equal(result.buildings[0].renderedRoof, 'gabled');
  for (const mesh of result.meshes) {
    assert.equal(mesh.layer, 'buildings');
    for (const array of [mesh.positions, mesh.normals, mesh.uvs]) assert.ok(array.every(Number.isFinite));
    if (mesh.kind === 'roof') for (let i = 1; i < mesh.normals.length; i += 3) assert.ok(mesh.normals[i] > .5);
  }
  const walls = result.meshes.filter(mesh => /^brick|stone|stucco|metal/.test(mesh.kind));
  assert.ok(walls.some(mesh => {
    for (let i = 0; i < mesh.positions.length; i += 3) if (mesh.positions[i] === 3205 && mesh.positions[i + 2] === 5) return true;
    return false;
  }), 'inner courtyard wall geometry exists');
});

test('tile unload removes its own collision cells and seasonal toggle preserves street lamps', () => {
  const world = createDrivingWorld([{id: 'baseline', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], height: 8}], {minX: -100, minZ: -100, maxX: 100, maxZ: 100});
  const parent = new THREE.Group(), materials = {stone: new THREE.MeshBasicMaterial()};
  const result = {meshes: [], buildings: [{id: 'added', p: [[5, 5], [10, 5], [10, 10], [5, 10]], h: 6}], lamps: [[4, 6, 4, 5], [5, 6, 5, 0]]};
  const tile = mountTile({parent, materials, drivingWorld: world, id: '0_0', result, raw: {}, detail: true});
  setTileAppearance(tile, {layers: {buildings: false}, season: 'normal', night: 1});
  assert.equal(tile.lights.find(light => !light.userData.seasonal).visible, true);
  assert.equal(tile.lights.find(light => light.userData.seasonal).visible, false);
  unmountTile({parent, drivingWorld: world, id: '0_0', tile});
  assert.equal(parent.children.length, 0);
  assert.ok([...world.grid.values()].flat().every(solid => solid.id === 'baseline'));
  materials.stone.dispose();
});


test('navigation holds destination tiles while the old car keeps producing frame updates', async t => {
  const originalDocument=globalThis.document;
  const context={createImageData:()=>({data:new Uint8ClampedArray(256*256*4)}),putImageData(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  globalThis.document={createElement:()=>({getContext:()=>context})};
  t.after(()=>{globalThis.document=originalDocument;});
  const jobs=[],compiler={load(source,options,{signal}){return new Promise(resolve=>jobs.push({source,signal,resolve}));},stats:()=>({workers:2,active:0,queued:0}),dispose(){}};
  const tiles=[];for(let x=16;x<=18;x++)for(let z=-1;z<=1;z++)tiles.push({id:x+'_'+z,url:'tiles/'+x+'_'+z+'.json'});
  const stream=createMetroStreamer({scene:new THREE.Scene(),manifest:{tiles,tileSize:512},drivingWorld:createDrivingWorld([],{minX:-20000,minZ:-20000,maxX:20000,maxZ:20000}),compiler});
  const navigation=stream.ensure({x:17*512,z:0});
  stream.updatePosition({x:0,z:0});
  assert.equal(stream.stats().pendingTiles,9);
  assert.ok(jobs.every(job=>!job.signal.aborted));
  for(let i=0;i<9;i++){const job=jobs.shift();assert.ok(job);job.resolve({raw:{roads:[]},result:{meshes:[],buildings:[],lamps:[]}});await new Promise(resolve=>setImmediate(resolve));}
  await navigation;
  assert.equal(stream.stats().loadedTiles,9);
  stream.updatePosition({x:0,z:0});
  assert.equal(stream.stats().loadedTiles,0);stream.dispose();
});


test('nested park, woodland and parking regions have deterministic depth ownership', async t => {
  const compile=await meshCompiler(t),ring=[[3000,0],[3020,0],[3020,20],[3000,20]];
  const result=compile({id:'6_0',surfaces:[{kind:'park',p:ring},{kind:'forest',p:ring},{kind:'parking',p:ring}]});
  const heights=Object.fromEntries(result.meshes.map(mesh=>[mesh.kind,mesh.positions[1]]));
  assert.ok(Math.abs(heights.grass-.008)<1e-6);assert.ok(Math.abs(heights.forest-.04)<1e-6);assert.ok(Math.abs(heights.parking-.08)<1e-6);
  assert.ok(heights.grass<heights.forest&&heights.forest<heights.parking&&heights.parking<.14);
  assert.equal(result.meshes.length,3,'semantic offsets do not split existing material buckets');
});
