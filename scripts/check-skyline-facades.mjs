#!/usr/bin/env node
// Validate the actual compiled landmark assignment and metric facade UVs.
// Geometry/surface gates own all city-wide spatial invariants. This gate adds
// the specific regression that originally produced two incorrect BOK towers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CITY_DATA } from '../dist/city-data.js';
import { WORLD_SURFACES } from '../dist/world-surfaces.js';
import { BAKED_WORLD } from '../dist/world-meshes.js';
import { BOK_FACADE, facadeFloorBands, skylineFacadeProfile } from '../dist/world/skyline-profiles.js';

const bok = CITY_DATA.buildings.filter(building => building.osm === 752099946);
assert.equal(bok.length, 1, 'BOK is one mapped rotated tower, not two legacy GIS outlines');
assert.equal(bok[0].id, 752099946);
assert.equal(bok[0].h, 132);
assert.equal(bok[0].kind, 'glass');
assert.ok(!CITY_DATA.buildings.some(building => [165140, 165141].includes(building.id)), 'Legacy source outlines must not reappear as duplicate 132-meter towers');
assert.equal(skylineFacadeProfile({ id: 752099946 }), BOK_FACADE);
assert.equal(skylineFacadeProfile({ id: 165140, osm: 752099946 }), BOK_FACADE);
assert.equal(skylineFacadeProfile({ id: 165140 }), null, 'Do not classify an unrelated shape by a stale GIS id');
assert.equal(skylineFacadeProfile({ id: 113737419, kind: 'glass' }), null);

const bands = facadeFloorBands('bok');
assert.equal(bands.filter(band => band.occupied).length, 27);
assert.equal(bands.filter(band => band.crown).length, 1);
assert.equal(bands[0].bottom, 0);
assert.equal(bands[0].top, 10.668);
assert.equal(bands.at(-1).top, 132);
assert.equal(bands.at(-1).occupied, false);
assert.ok(Math.abs(bands.at(-1).bottom - 119.808) < 1e-9);
for (let i = 1; i < bands.length; i++) assert.ok(Math.abs(bands[i - 1].top - bands[i].bottom) < 1e-9, 'Floor bands must be continuous');
const sources = JSON.parse(fs.readFileSync(new URL('../dist/geo/skyline-facade-sources.json', import.meta.url), 'utf8'));
assert.equal(sources.building.osmWay, BOK_FACADE.osm);
assert.equal(sources.building.occupiedStories, 27);
assert.equal(sources.building.sources.length, 4);

const shells = WORLD_SURFACES.buildingShells.filter(shell => skylineFacadeProfile(CITY_DATA.buildings[shell.sourceIndex]));
assert.equal(shells.length, 1);
assert.equal(shells[0].id, bok[0].id);
const expectedArea = shells.reduce((sum, shell) => sum + shell.walls.reduce((area, wall) =>
  area + Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) * (wall.top - wall.base)
    - wall.openings.reduce((n, opening) => n + (opening.end - opening.start) * (opening.top - opening.bottom), 0), 0), 0);
const decode = (encoded, Type) => {
  const bytes = Buffer.from(encoded, 'base64');
  return new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
let triangles = 0, vertices = 0, area = 0;
const chunks = BAKED_WORLD.chunks.filter(chunk => chunk.material === 'building.bok');
assert.ok(chunks.length > 0, 'The actual bake must use the unique landmark material');
for (const chunk of chunks) {
  const values = decode(chunk.v, Float32Array), indices = decode(chunk.i, chunk.indexType === 32 ? Uint32Array : Uint16Array);
  vertices += values.length / 8;
  for (let i = 0; i < values.length; i += 8) {
    assert.ok(values[i + 7] >= -1e-6 && values[i + 7] <= 1 + 1e-6, 'BOK uses one full-height facade, without a repeated crown or lobby');
    assert.ok(Math.abs(values[i + 1] - 132 * values[i + 7]) < .0001, 'Full-height UVs match the retained metric height');
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(index => Array.from(values.slice(index * 8, index * 8 + 3)));
    const u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    triangles++;
  }
}
assert.ok(Math.abs(area - expectedArea) < Math.max(.03, expectedArea * 1e-6), 'All and only the BOK facade area receives the dedicated material');
console.log(JSON.stringify({
  building: bok[0].name, id: bok[0].id, height: bok[0].h, occupiedFloors: 27,
  lobbyHeight: 10.668, crownHeight: 12.192, chunks: chunks.length, triangles, vertices,
  facadeArea: area, expectedArea, floorPitchApproximation: sources.building.reconstruction.officeFloorPitchMeters,
  scope: 'Mapped identity, source anchors, occupied/crown band count, actual baked facade assignment and UVs; no GPU claim.',
}, null, 2));
