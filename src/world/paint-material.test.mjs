import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WebGLRenderLists} from 'three/src/renderers/webgl/WebGLRenderLists.js';
import {createCityMaterials} from './materials.js';
import {createMetroMaterials} from '../metro/materials.js';
import {configureDepthOffsets} from '../app/renderer.js';
import {createSunlightBinding} from '../atmosphere/sunlight.js';

// Exercise the production factories and real Three materials. Texture drawing
// alone is stubbed: these are render-state/hook checks, not GPU pixel tests.
function withCanvas(callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = {
    createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = {width: 1, height: 1};
      const context = {
        canvas,
        createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
        putImageData() {}, drawImage() {}, fillRect() {},
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      };
      canvas.getContext = kind => { assert.equal(kind, '2d'); return context; };
      return canvas;
    },
  };
  try { return callback(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
}

let city, metro, group, paints;
before(() => {
  group = new THREE.Group();
  withCanvas(() => {
    city = createCityMaterials({group, dynamicLights: [], seed: 42});
    metro = createMetroMaterials();
  });
  paints = [
    ['downtown white', city.roadPaint], ['downtown yellow', city.yellow],
    ['metro white', metro.paint], ['metro yellow', metro.yellow],
  ];
});

after(() => {
  const materials = new Set(), textures = new Set(), geometry = new Set();
  function collect(value) {
    if (value?.isMaterial) materials.add(value);
    else if (value?.isBufferGeometry) geometry.add(value);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) collect(item);
  }
  collect(city); collect(metro);
  group?.traverse(object => { if (object.material) collect(object.material); if (object.geometry) geometry.add(object.geometry); });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const item of geometry) item.dispose();
});

test('all four production paints retain occlusion and enter the pass after opaque roads', () => {
  const lists = new WebGLRenderLists(), list = lists.get(new THREE.Scene(), 0);
  list.init();
  for (const [label, material] of paints) {
    assert.equal(material.isMeshStandardMaterial, true, label);
    assert.equal(material.transparent, true, `${label} must be scheduled after opaque roads`);
    assert.equal(material.opacity, 1, `${label} must remain solid paint`);
    assert.equal(material.depthTest, true, `${label} must stay behind cars and buildings`);
    assert.equal(material.depthWrite, false, `${label} must not become a second road depth owner`);
    assert.equal(material.blending, THREE.NormalBlending, label);
    assert.equal(material.polygonOffset, true, `${label} must receive the depth-mode surface offset`);
    assert.ok(material.polygonOffsetFactor < 0 && material.polygonOffsetUnits < 0, label);
    const mesh = new THREE.Mesh(city.paintGeometry, material);
    list.push(mesh, mesh.geometry, material, 0, 0, null);
  }
  const roads = [city.bakedMaterials['ground.road'], metro.asphalt];
  // Deliberately submit paint first. Material classification, not construction
  // order or camera distance, must keep opaque road draws ahead of its decals.
  for (const material of roads) {
    const mesh = new THREE.Mesh(city.paintGeometry, material);
    list.push(mesh, mesh.geometry, material, 0, 1, null);
    assert.equal(material.transparent, false);
    assert.equal(material.depthWrite, true);
  }
  list.sort(); list.finish();
  assert.deepEqual(new Set(list.opaque.map(item => item.material)), new Set(roads));
  assert.deepEqual(new Set(list.transparent.map(item => item.material)), new Set(paints.map(([, material]) => material)));
  assert.equal(list.transmissive.length, 0);
  assert.equal(city.white.transparent, false, 'Ordinary white scene details must not become decals');
  lists.dispose();
});

test('streamed paint remains double-sided without a duplicate transparent back-face pass', () => {
  for (const material of [metro.paint, metro.yellow]) {
    assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.transparent, true);
    assert.equal(material.forceSinglePass, true);
  }
});

test('depth offsets remain idempotent for shared and late-mounted production paint', () => {
  const scene = new THREE.Scene(), tile = new THREE.Group();
  const authored = new Map(paints.map(([, material]) => [material, [material.polygonOffsetFactor, material.polygonOffsetUnits]]));
  const offsets = material => [material.polygonOffsetFactor, material.polygonOffsetUnits];
  const expected = (material, reversed) => authored.get(material).map(value => value * (reversed ? -1 : 1));
  scene.add(new THREE.Mesh(city.paintGeometry, city.roadPaint),
    new THREE.Mesh(city.paintGeometry, [city.yellow, city.roadPaint]));
  assert.equal(configureDepthOffsets(scene, false), 2, 'Shared material is configured only once per traversal');
  assert.equal(configureDepthOffsets(scene, true), 2);
  assert.equal(configureDepthOffsets(scene, true), 2);
  for (const material of [city.roadPaint, city.yellow]) assert.deepEqual(offsets(material), expected(material, true));

  tile.add(new THREE.Mesh(city.paintGeometry, metro.paint),
    new THREE.Mesh(city.paintGeometry, [metro.yellow, metro.paint, metro.asphalt]));
  assert.equal(configureDepthOffsets(tile, true), 2, 'The streamed tile must configure both actual paint materials');
  scene.add(tile);
  assert.equal(configureDepthOffsets(scene, true), 4);
  assert.equal(configureDepthOffsets(tile, true), 2);
  for (const [, material] of paints) assert.deepEqual(offsets(material), expected(material, true));
  assert.equal(metro.asphalt.polygonOffset, false, 'Opaque asphalt must retain its authored depth');

  assert.equal(configureDepthOffsets(scene, false), 4);
  assert.equal(configureDepthOffsets(scene, false), 4);
  for (const [, material] of paints) assert.deepEqual(offsets(material), expected(material, false));
});

const standardShader = () => ({
  uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
  vertexShader: THREE.ShaderLib.standard.vertexShader,
  fragmentShader: THREE.ShaderLib.standard.fragmentShader,
});

test('sunlight binding preserves paint shader extensions, receiver, uniforms and cache identity', () => {
  const scene = new THREE.Scene(), renderer = {name: 'shader-hook renderer'};
  const uniforms = {uSolarCenterAltitude: {value: .3}, uSunDirection: {value: new THREE.Vector3(1, 1, 0).normalize()}};
  const bindings = new Map();
  for (const [label, material] of paints) {
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
    const extension = {value: .012}, state = {calls: 0, extension};
    state.factoryKey = previousKey;
    material.onBeforeCompile = function(shader, actualRenderer) {
      assert.equal(this, material, `${label} extension receiver`);
      assert.equal(actualRenderer, renderer);
      previous.call(this, shader, actualRenderer);
      state.calls++;
      shader.uniforms.uPaintExtension = extension;
      shader.fragmentShader = 'uniform float uPaintExtension;\n' + shader.fragmentShader;
    };
    material.customProgramCacheKey = () => previousKey + '|paint-test-extension';
    state.key = material.customProgramCacheKey();
    state.version = material.version;
    bindings.set(material, state);
    scene.add(new THREE.Mesh(city.paintGeometry, material), new THREE.Mesh(city.paintGeometry, material));
  }
  const bind = createSunlightBinding(uniforms);
  assert.equal(bind(scene), 4, 'Shared paints receive one sunlight wrapper each');
  assert.equal(bind(scene), 0, 'Repeat scene/tile binding must not stack shader hooks');
  for (const [label, material] of paints) {
    const state = bindings.get(material);
    assert.equal(material.version, state.version + 1, `${label} recompiles once`);
    const shader = standardShader();
    material.onBeforeCompile(shader, renderer);
    assert.equal(state.calls, 1, `${label} extension runs once`);
    assert.equal(shader.uniforms.uPaintExtension, state.extension);
    assert.equal(shader.uniforms.uSolarCenterAltitude, uniforms.uSolarCenterAltitude);
    assert.equal(shader.uniforms.uSunDirection, uniforms.uSunDirection);
    assert.equal(shader.fragmentShader.split('uniform float uPaintExtension;').length - 1, 1);
    assert.match(shader.vertexShader, /vPrismSolarHeight=\(modelMatrix\*prismSolarPosition\)\.y/);
    assert.match(shader.fragmentShader, /prismSolarVisibility\(vPrismSolarHeight\)/);
    assert.equal(state.key, state.factoryKey + '|paint-test-extension');
    assert.equal(material.customProgramCacheKey(), state.key + '|prism-height-sun-v1');
  }
});
