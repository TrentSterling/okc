import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeGroundSurfaces} from './bake-ground-surfaces.mjs';

const road = {kind: 'road', y: .14, uvScale: 4, polygons: [{outer: [[0, 0], [0, 4], [4, 0]], holes: []}]};
const grass = {kind: 'grass', y: .025, uvScale: 24, polygons: [{outer: [[6, 0], [6, 4], [10, 0]], holes: []}]};
const world = {layers: [road, grass], groundTriangulation: {version: 1, cellSize: 1024,
  chunks: [{kind: 'road', cell: [0, 0], triangles: [[0, 0, 0, 4, 4, 0]]}]}};

test('painted ground emits constrained vertices with original elevation and UV scale', () => {
  const triangles = [], polygons = [], stats = {};
  bakeGroundSurfaces(world, {triangle: (...args) => triangles.push(args), polygon: (...args) => polygons.push(args)}, stats, 1024);
  assert.deepEqual(triangles, [[[0, .14, 0, 0, 1, 0, 0, 0], [0, .14, 4, 0, 1, 0, 0, 1],
    [4, .14, 0, 0, 1, 0, 1, 0], 'ground.road', false]]);
  assert.deepEqual(polygons, [[grass.polygons[0], .025, 'ground.grass', false, 24]]);
  assert.deepEqual(stats, {constrainedGroundTriangles: 1, constrainedGroundChunks: 1});
});

test('missing compiled ground or mismatched cell size fails instead of silently omitting roads', () => {
  const sinks = {triangle() {}, polygon() {}};
  assert.throws(() => bakeGroundSurfaces({layers: [road]}, sinks, {}, 1024), /Regenerate ground/);
  assert.throws(() => bakeGroundSurfaces(world, sinks, {}, 512), /mesh-cell size/);
  assert.throws(() => bakeGroundSurfaces({...world, groundTriangulation: {...world.groundTriangulation, chunks: []}}, sinks, {}, 1024), /Missing constrained road/);
});
