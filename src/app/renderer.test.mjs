import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {WebGLState} from 'three/src/renderers/webgl/WebGLState.js';
import {resetRendererState, configureDepthOffsets} from './renderer.js';
import {createCaptureController} from './captures.js';
import {createAtmosphere} from '../sky.js';
import {createRoadPaintMaterial} from '../world/paint-material.js';

assert.equal(THREE.REVISION, '180', 'Review this regression when updating the pinned renderer');
// Use the pinned renderer's actual camera-uniform code, not a rewritten model
// of its one-way promotion from ordinary to reversed projection. A real GL
// context/shader compile is covered separately by the native pixel checks.
const rendererSource = fs.readFileSync(new URL(import.meta.resolve('three/src/renderers/WebGLRenderer.js')), 'utf8');
const cameraStart = rendererSource.indexOf('const reversedDepthBuffer = state.buffers.depth.getReversed();');
const cameraEnd = rendererSource.indexOf("p_uniforms.setValue( _gl, 'viewMatrix'", cameraStart);
assert.ok(cameraStart > 0 && cameraEnd > cameraStart, 'Pinned Three camera upload boundary must be found');
const uploadProjection = new Function('state', 'camera', 'p_uniforms', '_gl', rendererSource.slice(cameraStart, cameraEnd));

function fixture(reversed) {
  const calls = [], enabled = new Set();
  const native = {clipRange: 0x935E, clearDepth: 1, depthFunc: 0x0201, depthMask: true, polygonOffset: [0, 0]};
  const extension = {LOWER_LEFT_EXT: 0x8CA1, NEGATIVE_ONE_TO_ONE_EXT: 0x935E, ZERO_TO_ONE_EXT: 0x935F,
    clipControlEXT(origin, range) { calls.push(['clipControl', origin, range]); native.clipRange = range; }};
  let serial = 0x10000;
  const gl = new Proxy({
    canvas: {width: 1280, height: 720},
    VERSION: 0x1F02, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D, SCISSOR_BOX: 0x0C10, VIEWPORT: 0x0BA2,
    LESS: 0x0201, LEQUAL: 0x0203, GREATER: 0x0204, GEQUAL: 0x0206,
    getParameter(key) {
      if (key === gl.VERSION) return 'WebGL 2.0';
      if (key === gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 8;
      if (key === gl.SCISSOR_BOX || key === gl.VIEWPORT) return [0, 0, 1280, 720];
      throw Error(`Unexpected GL parameter ${key}`);
    },
    createTexture: () => ({}),
    clearDepth(value) { native.clearDepth = value; calls.push(['clearDepth', value]); },
    depthFunc(value) { native.depthFunc = value; calls.push(['depthFunc', value]); },
    depthMask(value) { native.depthMask = value; },
    polygonOffset(factor, units) { native.polygonOffset = [factor, units]; },
    enable(value) { enabled.add(value); }, disable(value) { enabled.delete(value); },
  }, {get(target, key) {
    if (!(key in target)) target[key] = /^[A-Z0-9_]+$/.test(key) ? serial++ : () => {};
    return target[key];
  }});
  // The real Three state machine owns all GL writes and caches in this test.
  const state = new WebGLState(gl, {get(name) {
    assert.equal(name, 'EXT_clip_control');
    assert.equal(reversed, true, 'Ordinary/log-depth mode must not require clip-control support');
    return extension;
  }});
  state.buffers.depth.setReversed(reversed);
  state.buffers.depth.setClear(1);
  const road = new THREE.MeshStandardMaterial();
  state.setMaterial(road, false);
  const renderer = {
    state, capabilities: {reversedDepthBuffer: reversed}, coordinateSystem: THREE.WebGLCoordinateSystem,
    shadowMap: {enabled: true, autoUpdate: false}, xr: {enabled: false},
    autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: true,
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08,
    color: new THREE.Color(0x192235), alpha: .7, target: {name: 'caller target'}, face: 2, mip: 1,
    viewport: new THREE.Vector4(5, 7, 640, 360), scissor: new THREE.Vector4(10, 12, 600, 300), scissorTest: true,
    resetCalls: 0, renders: [], pixelRatio: 1.25, width: 1280, height: 720,
    domElement: {toDataURL: () => 'data:image/png;base64,fixture'},
    resetState() { this.resetCalls++; this.target = null; this.face = this.mip = 0; state.reset(); },
    setClearColor(value, alpha = 1) { this.color.set(value); this.alpha = alpha; },
    getClearColor(out) { return out.copy(this.color); }, getClearAlpha() { return this.alpha; },
    setRenderTarget(target, face = 0, mip = 0) { Object.assign(this, {target, face, mip}); },
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.mip; },
    setViewport(...v) { typeof v[0] === 'object' ? this.viewport.copy(v[0]) : this.viewport.set(...v); },
    getViewport(out) { return out.copy(this.viewport); },
    setScissor(...v) { typeof v[0] === 'object' ? this.scissor.copy(v[0]) : this.scissor.set(...v); },
    getScissor(out) { return out.copy(this.scissor); },
    setScissorTest(value) { this.scissorTest = value; }, getScissorTest() { return this.scissorTest; },
    setPixelRatio(value) { this.pixelRatio = value; }, setSize(width, height) { Object.assign(this, {width, height}); },
    compile() {},
    clear() { assert.equal(native.clearDepth, reversed ? 0 : 1, 'A frame must clear to the configured far depth'); },
    render(scene, camera) {
      state.setMaterial(road, false);
      projectCamera(renderer, camera);
      this.renders.push({reversed: state.buffers.depth.getReversed(), cameraReversed: camera.reversedDepth, clearDepth: native.clearDepth});
      this.onRender?.(scene, camera);
    },
  };
  return {renderer, native, gl, calls, extension, road};
}

function projectCamera(renderer, camera) {
  let uploaded;
  uploadProjection(renderer.state, camera, {setValue(gl, name, value) {
    assert.equal(name, 'projectionMatrix'); uploaded = value;
  }}, {});
  assert.equal(uploaded, camera.projectionMatrix);
}

function windowDepth(camera, distance, native) {
  const ndc = new THREE.Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z;
  return native.clipRange === 0x935F ? ndc : ndc * .5 + .5;
}

function passes(fixture, fragment, stored) {
  const {native, gl} = fixture;
  if (native.depthFunc === gl.LEQUAL) return fragment <= stored;
  if (native.depthFunc === gl.GEQUAL) return fragment >= stored;
  throw Error(`Unexpected native depth comparison ${native.depthFunc}`);
}

function assertOcclusion(f, camera) {
  const near = windowDepth(camera, 2, f.native), far = windowDepth(camera, 1000, f.native);
  assert.ok(near >= 0 && near <= 1 && far >= 0 && far <= 1);
  assert.equal(passes(f, far, f.native.clearDepth), true, 'Far geometry must pass a cleared depth buffer');
  assert.equal(passes(f, near, far), true, 'Near geometry must cover far geometry');
  assert.equal(passes(f, far, near), false, 'Far geometry must remain behind a near occluder');
}

test('actual r180 reset disables reverse depth; restoring only reversal still leaves the wrong clear value', () => {
  const f = fixture(true), camera = new THREE.PerspectiveCamera(48, 1, .5, 7500);
  projectCamera(f.renderer, camera);
  assert.equal(camera.reversedDepth, true);
  assertOcclusion(f, camera);
  f.renderer.resetState();
  assert.equal(f.renderer.state.buffers.depth.getReversed(), false);
  assert.equal(f.native.clipRange, f.extension.NEGATIVE_ONE_TO_ONE_EXT);
  assert.equal(f.native.clearDepth, 1);
  f.renderer.state.setMaterial(f.road, false);
  projectCamera(f.renderer, camera);
  assert.equal(camera.reversedDepth, true, 'The renderer does not demote a camera after its state reset');
  assert.equal(passes(f, windowDepth(camera, 1000, f.native), windowDepth(camera, 2, f.native)), true,
    'Negative control: the broken reset lets far geometry cover the near surface');
  f.renderer.state.buffers.depth.setReversed(true);
  assert.equal(f.native.clearDepth, 1, 'Negative control: cached null clear survives setReversed alone');
  resetRendererState(f.renderer);
  f.renderer.state.setMaterial(f.road, false);
  projectCamera(f.renderer, camera);
  assertOcclusion(f, camera);
});

test('the first main-camera draw restores the configured projection for the historical startup failure', () => {
  const f = fixture(true), camera = new THREE.PerspectiveCamera(48, 1, .5, 7500);
  const paint = createRoadPaintMaterial({color: 0xffffff}), scene = new THREE.Scene();
  // Keep the pre-v0.8.2 material explicit: this is the native-validated
  // startup failure, even after production removes its slope-dependent bias.
  paint.polygonOffsetFactor = -1;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), paint));
  configureDepthOffsets(scene, true);
  assert.equal(camera.reversedDepth, false, 'Fresh main camera has not rendered yet');
  f.renderer.resetState(); projectCamera(f.renderer, camera); f.renderer.state.setMaterial(paint, false);
  assert.equal(camera.reversedDepth, false);
  assert.equal(f.native.depthFunc, f.gl.LEQUAL);
  assert.deepEqual(f.native.polygonOffset, [1, 2], 'Negative control: the reverse bias is paired with ordinary depth');
  resetRendererState(f.renderer); projectCamera(f.renderer, camera); f.renderer.state.setMaterial(paint, false);
  assert.equal(camera.reversedDepth, true);
  assert.equal(f.native.depthFunc, f.gl.GEQUAL);
  assert.equal(f.native.clipRange, f.extension.ZERO_TO_ONE_EXT);
  assert.deepEqual(f.native.polygonOffset, [1, 2]);
  assertOcclusion(f, camera);
  scene.children[0].geometry.dispose(); paint.dispose();
});

test('repeated resets retain valid projection and production paint bias in both depth modes', () => {
  for (const reversed of [false, true]) {
    const f = fixture(reversed), paint = createRoadPaintMaterial({color: 0xffffff});
    const geometry = new THREE.PlaneGeometry(), scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, paint));
    assert.equal(paint.polygonOffsetFactor, 0);
    assert.equal(paint.polygonOffsetUnits, -2);
    configureDepthOffsets(scene, reversed);
    for (const camera of [new THREE.PerspectiveCamera(48, 1, .5, 7500), new THREE.OrthographicCamera(-2, 2, 2, -2, .5, 7500)]) {
      for (let i = 0; i < 3; i++) {
        resetRendererState(f.renderer); projectCamera(f.renderer, camera); f.renderer.state.setMaterial(paint, false);
        assert.equal(f.renderer.state.buffers.depth.getReversed(), reversed);
        assert.equal(camera.reversedDepth, reversed);
        assert.equal(f.native.clearDepth, reversed ? 0 : 1);
        assert.equal(f.native.depthFunc, reversed ? f.gl.GEQUAL : f.gl.LEQUAL);
        assert.ok(f.native.polygonOffset[0] === 0, 'Current production paint has no slope bias in either depth convention');
        assert.equal(f.native.polygonOffset[1], reversed ? 2 : -2, 'Unit bias follows the restored comparison');
        assertOcclusion(f, camera);
      }
    }
    assert.equal(f.renderer.toneMapping, THREE.ACESFilmicToneMapping);
    assert.equal(f.renderer.toneMappingExposure, 1.08);
    if (!reversed) assert.equal(f.calls.filter(call => call[0] === 'clipControl').length, 0);
    geometry.dispose(); paint.dispose();
  }
});

test('actual reflection cleanup restores depth and the caller state on success and failure', () => {
  for (const fail of [false, true]) {
    const f = fixture(true), {renderer} = f, scene = new THREE.Scene();
    const excluded = new THREE.Object3D(); scene.add(excluded);
    const atmosphere = createAtmosphere(renderer, scene);
    const saved = {target: renderer.target, face: renderer.face, mip: renderer.mip,
      color: renderer.color.clone(), alpha: renderer.alpha, viewport: renderer.viewport.clone(),
      scissor: renderer.scissor.clone(), scissorTest: renderer.scissorTest,
      toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure};
    let localMaps = 0;
    renderer.onRender = () => { assert.equal(excluded.visible, false); if (fail) throw Error('Controlled cube render failure'); };
    const capture = () => atmosphere.captureLocalReflection({glass: {setLocalReflection() { localMaps++; }}, exclude: [excluded], size: 16});
    if (fail) assert.throws(capture, /Controlled cube render failure/); else assert.equal(capture(), true);
    assert.equal(localMaps, fail ? 0 : 1);
    assert.equal(renderer.resetCalls, 1);
    assert.equal(renderer.state.buffers.depth.getReversed(), true);
    assert.equal(f.native.clearDepth, 0);
    assert.equal(excluded.visible, true);
    assert.equal(atmosphere.sky.visible, true);
    for (const name of ['target', 'face', 'mip', 'alpha', 'scissorTest', 'toneMapping']) assert.equal(renderer[name], saved[name], name);
    for (const name of ['color', 'viewport', 'scissor']) assert.ok(renderer[name].equals(saved[name]), name);
    assert.equal(renderer.toneMappingExposure, saved.exposure);
    assert.equal(renderer.autoClear, true); assert.equal(renderer.autoClearDepth, true);
    assert.equal(renderer.shadowMap.autoUpdate, false); assert.equal(renderer.shadowMap.needsUpdate, true);
  }
});

test('actual capture setup restores reverse depth before clearing and drawing the photograph', () => {
  const f = fixture(true), {renderer} = f, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, .5, 7500);
  const controller = createCaptureController({renderer, scene, camera,
    getState: () => ({progress: .63}), snapshot: () => ({state: {progress: .63}}),
    applyCapturePreset() {}, invalidateCamera() {}, updateCamera() { camera.updateProjectionMatrix(); }, resize() {},
  });
  const result = controller.captureView('approach-afterglow', 800, 450);
  assert.equal(renderer.resetCalls, 1);
  assert.equal(result.pose.renderTarget, 'canvas');
  assert.equal(renderer.scissorTest, false);
  assert.deepEqual(renderer.viewport.toArray(), [0, 0, 800, 450]);
  assert.deepEqual(renderer.renders.at(-1), {reversed: true, cameraReversed: true, clearDepth: 0});
  assertOcclusion(f, camera);
  assert.equal(renderer.toneMappingExposure, 1.08);
});
