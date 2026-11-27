import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {createTileCoverage, qualityProfile} from './view-coverage.js';

const entries = [];
for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) entries.push({id: x + '_' + z});
const car = {x: 256, z: 256};
const bubble = [];
for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) bubble.push(x + '_' + z);
const cameraAt = (x, y, z, tx, tz, fov = 65) => {
  const camera = new PerspectiveCamera(fov, 1, .5, 7500);
  camera.position.set(x, y, z); camera.lookAt(tx, 0, tz);
  return camera;
};
function pinned(selection) { for (const id of bubble) assert(selection.wanted.has(id), `Car collision tile ${id} must remain selected.`); }

test('quality budgets and no-camera coverage preserve the local radius contract', () => {
  const coverage = createTileCoverage({entries});
  for (const [quality, count, desired, resident, range] of [['low', 9, 16, 24, 1400], ['balanced', 25, 40, 48, 2400], ['high', 49, 64, 80, 3600]]) {
    const result = coverage.select(car, null, quality), profile = qualityProfile(quality);
    assert.equal(result.wanted.size, count); pinned(result);
    assert.equal(profile.desiredLimit, desired); assert.equal(result.limit, resident); assert.equal(result.range, range);
    assert.deepEqual(result.anchors, [car]);
  }
  assert.equal(qualityProfile('unknown'), qualityProfile('balanced'));
});

test('rotating the camera 180 degrees changes visible tiles while the car stays still', () => {
  const coverage = createTileCoverage({entries}), camera = cameraAt(256, 120, 256, 1856, 256);
  const east = coverage.select(car, camera, 'balanced');
  camera.lookAt(-1344, 0, 256);
  const west = coverage.select(car, camera, 'balanced');
  pinned(east); pinned(west);
  assert(east.wanted.has('2_0')); assert(!east.wanted.has('-3_0'));
  assert(west.wanted.has('-3_0')); assert(!west.wanted.has('2_0'));
  assert.notDeepEqual([...east.wanted.keys()], [...west.wanted.keys()]);
});

test('zoom and panning change view coverage without losing the stationary car bubble', () => {
  const coverage = createTileCoverage({entries}), camera = cameraAt(256, 2500, 256, 256, 256);
  const wide = coverage.select(car, camera, 'high');
  camera.zoom = 4; camera.updateProjectionMatrix();
  const close = coverage.select(car, camera, 'high');
  pinned(wide); pinned(close);
  assert(wide.wanted.size > close.wanted.size, 'A narrower zoom must not retain the broad overhead footprint.');
  assert(wide.wanted.has('2_0')); assert(!close.wanted.has('2_0'));
  camera.position.set(4096, 900, 256); camera.lookAt(4096, 0, 256);
  const panned = coverage.select(car, camera, 'high'); pinned(panned);
  assert(panned.wanted.has('8_0'), 'A distant inspected neighborhood must load even while the car stays downtown.');
  assert.deepEqual(panned.anchors[1], {x: 4096, z: 256});
});

test('all quality caps retain every collision tile and deterministic request order', () => {
  const coverage = createTileCoverage({entries}), reversed = createTileCoverage({entries: [...entries].reverse()});
  const camera = cameraAt(256, 2500, 256, 256, 256, 100);
  for (const quality of ['low', 'balanced', 'high']) {
    const result = coverage.select(car, camera, quality); pinned(result);
    assert.equal(result.wanted.size, qualityProfile(quality).desiredLimit);
    assert.deepEqual([...result.wanted], [...reversed.select(car, camera, quality).wanted]);
    assert([...result.wanted.values()].every(value => Number.isFinite(value.priority)));
  }
});

test('collision-only selection ignores the view and retains exactly the local bubble', () => {
  const coverage = createTileCoverage({entries}), camera = cameraAt(4096, 900, 256, 4096, 256);
  const result = coverage.select(car, camera, 'high', {collisionOnly: true});
  assert.equal(result.wanted.size, 9); pinned(result); assert.deepEqual(result.anchors, [car]);
});

test('fully static core tiles are skipped while partial boundary tiles stay eligible', () => {
  const coreBounds = {minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000};
  const coverage = createTileCoverage({entries, coreBounds});
  const result = coverage.select(car, null, 'high');
  assert(!result.wanted.has('0_0')); assert(!result.wanted.has('-1_0'));
  assert(result.wanted.has('-2_0')); assert(result.wanted.has('1_0'));
  for (const id of result.wanted.keys()) {
    const [x, z] = id.split('_').map(Number);
    assert(!(x * 512 >= -1000 && (x + 1) * 512 <= 1000 && z * 512 >= -1000 && (z + 1) * 512 <= 1000));
  }
});

test('center-ray target is clipped to the quality range and reversed depth keeps coverage', () => {
  const coverage = createTileCoverage({entries}), camera = cameraAt(256, 40, 256, 4000, 256);
  const result = coverage.select(car, camera, 'low'), target = result.anchors[2];
  assert(Math.hypot(target.x - 256, target.z - 256) <= 1400);
  assert(target.x > 1600, 'The center-ray target should lead toward the viewed streets.');
  camera._reversedDepth = true; camera.updateProjectionMatrix();
  const reversed = coverage.select(car, camera, 'low');
  assert.deepEqual([...reversed.wanted.keys()], [...result.wanted.keys()]);
  for (const [id, value] of result.wanted) {
    assert.equal(reversed.wanted.get(id).detail, value.detail);
    assert(Math.abs(reversed.wanted.get(id).priority - value.priority) < 1e-6);
  }
});
