#!/usr/bin/env node
// Prepare the actual Three r180 UI programs and surface.snapshot() attributes.
// No app bootstrap, browser, map compilation or replacement UI renderer.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {WebGLPrograms} from '../../node_modules/three/src/renderers/webgl/WebGLPrograms.js';
import {WebGLProgram} from '../../node_modules/three/src/renderers/webgl/WebGLProgram.js';
import {GPUSurface, UI_ATTRIBUTE_SIZES} from '../../src/ui/gpu-surface.js';
import {createBootstrapAssets} from '../../src/ui/bootstrap-font.js';
import {createWidgets} from '../../src/ui/widgets.js';
import {createInputRouter} from '../../src/ui/input-router.js';
import {drawHud} from '../../src/app/hud-view.js';
import {drawSettings} from '../../src/app/settings-view.js';
import {createMapBatches} from '../../src/explorer/map-batches.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = path.resolve(option('--output', path.join(root, 'qa/ui-native')));
const snapshotsFile = option('--snapshots', null);
if (args.includes('--help')) {
  console.log('node scripts/visual/prepare-ui-diagnostics.mjs [--output DIR] [--snapshots FILE]\nFILE: one debugSnapshot(), an array of {name,surface,targets}, or {views:[...]}.\nWithout FILE, capture production HUD/settings widgets and a glyph/clipping fixture in phone portrait/landscape. A bootstrap-font fixture is always included.');
  process.exit(0);
}
const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'))).version;
if (version !== '0.180.0') throw Error('UI diagnostics require the pinned three@0.180.0.');
const hash = value => createHash('sha256').update(value).digest('hex');
const metrics = JSON.parse(fs.readFileSync(path.join(root, 'public/ui/glyphs.json')));
const pixels = new Uint8Array(fs.readFileSync(path.join(root, 'public/ui/glyphs.r8')));
if (hash(pixels) !== metrics.sha256) throw Error('Glyph atlas hash mismatch.');
const assets = {metrics, pixels}, surface = new GPUSurface(assets);
const bootstrapAssets = createBootstrapAssets(), atlasAssets = {main: assets, bootstrap: bootstrapAssets};
fs.mkdirSync(output, {recursive: true});
const atlases = Object.fromEntries(Object.entries(atlasAssets).map(([id, value]) => {
  const file = id === 'main' ? 'glyphs.r8' : 'bootstrap-glyphs.r8';
  fs.writeFileSync(path.join(output, file), value.pixels);
  return [id, {file, width: value.metrics.width, height: value.metrics.height, sha256: hash(value.pixels)}];
}));
const sourceFiles = ['src/ui/gpu-surface.js', 'src/ui/glyphs.js', 'src/ui/widgets.js', 'src/ui/input-router.js',
  'src/ui/runtime.js', 'src/ui/bootstrap-font.js', 'src/app/hud-view.js', 'src/app/settings-view.js', 'src/explorer/map-batches.js', 'public/ui/glyphs.json'];
const sourceHashes = Object.fromEntries(sourceFiles.filter(file => fs.existsSync(path.join(root, file))).map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));

function prepare(reversed, {object = surface.mesh, scene = surface.scene, prefix = 'ui'} = {}) {
  const gl = {VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, createProgram: () => ({shaders: []}),
    createShader: kind => ({kind}), shaderSource(shader, source) { shader.source = source; }, compileShader() {},
    attachShader(program, shader) { program.shaders.push(shader); }, linkProgram() {}, bindAttribLocation() {}};
  const capabilities = {reversedDepthBuffer: reversed, logarithmicDepthBuffer: !reversed, vertexTextures: true,
    precision: 'highp', getMaxPrecision: value => value};
  const renderer = {getContext: () => gl, getRenderTarget: () => null, capabilities,
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping,
    state: {buffers: {depth: {getReversed: () => reversed}}}, shadowMap: {enabled: true, type: THREE.PCFSoftShadowMap}, debug: {checkShaderErrors: false}};
  const lights = {directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
    directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0};
  const programs = WebGLPrograms(renderer, {get: value => value}, {get: value => value}, {has: () => false}, capabilities, {}, {numPlanes: 0, numIntersection: 0});
  const parameters = programs.getParameters(object.material, lights, [], scene, object);
  const name = prefix + (reversed ? '-reversed' : '-logarithmic'), prepared = new WebGLProgram(renderer, name, parameters, {}).program;
  const record = {name, reversed, vertex: name + '.vert', fragment: name + '.frag', sha256: {},
    toneMapping: parameters.toneMapping, outputColorSpace: parameters.outputColorSpace};
  for (const shader of prepared.shaders) {
    const stage = shader.kind === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    fs.writeFileSync(path.join(output, record[stage]), shader.source); record.sha256[stage] = hash(shader.source);
  }
  if (parameters.toneMapping !== THREE.NoToneMapping) throw Error('UI unexpectedly inherits world tone mapping.');
  return record;
}
const programs = [prepare(false), prepare(true)];
// Capture the actual map factory's materials, including shader construction and
// include expansion. The fixture supplies attributes only; no map data imports.
const map = createMapBatches(); let mapScene;
map.setBase({land: new Float32Array([0, 0, 10, 0, 0, 10]), parks: new Float32Array(), water: new Float32Array(),
  roads: [new Float32Array(), new Float32Array([0, 0, 10, 10, 4]), new Float32Array()]});
map.setBuildings({buildings: new Float32Array([0, 0, 10, 0, 0, 10]),
  buildingColors: new Float32Array([.2, .3, .4, .25, .2, .3, .4, .25, .2, .3, .4, .25])});
map.render({autoClear: true, render(scene) { mapScene = scene; }},
  {center: {x: 0, z: 0}, scale: 1, width: 390, height: 844, layers: {roads: true, parks: true, water: true, buildings: true}});
for (const object of mapScene.children) {
  const prefix = object.geometry.attributes.featureColor ? 'map-building' : object.geometry.attributes.segment ? 'map-road' : 'map-polygon';
  if (prefix === 'map-building' && !object.material.defines.MAP_FEATURE_COLOR) throw Error('Building color fixture did not enable the actual feature-color shader.');
  programs.push(prepare(false, {object, scene: mapScene, prefix}), prepare(true, {object, scene: mapScene, prefix}));
}
if (programs.length !== 8) throw Error('Expected UI, map polygon, road and feature-color building shader pairs.');
map.dispose();

function nativeFixture(width, height, type) {
  const insets = width < height ? {left: 0, right: 0, top: 44, bottom: 34} : {left: 44, right: 44, top: 0, bottom: 21};
  const host = {width, height, insets, router: createInputRouter(), scrolls: new Map(), platform: {}, focusId: null, invalidate() {}, openSelect() {}};
  surface.begin(width, height); surface.rect(0, 0, width, height, {color: '#101c29'});
  const widgets = createWidgets(host, surface), control = new Proxy({}, {get: () => () => false});
  const model = {hudVisible: true, panel: type === 'settings' ? 'settings' : null, studyView: '', preset: 'golden', timeLabel: 'Time of day', telemetry: {gear: 'D'},
    state: {driveMode: 'free', camera: 'chase', driving: true, speed: 12, direction: 1, progress: .62, route: .4,
      style: .12, roughness: .08, exposure: 1.08, neutral: false, screen: true, legends: false, traffic: true,
      sound: false, quality: 'balanced', sunPlaying: false}};
  if (type === 'glyphs') {
    widgets.text('OKC / baked GPU glyphs', 18, insets.top + 18, {size: 22, color: '#f1c986', maxWidth: width - 36});
    widgets.text('Café · Niño · Straße · Œuvre', 18, insets.top + 80, {size: 18, maxWidth: width - 36});
    widgets.text('← ↑ → ↓  ✓ ★  – —', 18, insets.top + 118, {size: 23, color: '#7fddd1', maxWidth: width - 36});
    widgets.text('▦ ◒ ⦿ ✹ ◡ ◇ ♧ ▤ ◔ ♡ ✧ ≈ ◈ ▱ ⌖ × −', 18, insets.top + 156, {size: 14, maxWidth: width - 36});
    const clip = {x: 24, y: insets.top + 196, w: width - 48, h: 58};
    widgets.rect(clip.x, clip.y, clip.w, clip.h, {color: '#203d48', radius: 10});
    widgets.clip(clip, () => { widgets.text('Clipping preserves the next line', 34, clip.y + 9, {size: 18, maxWidth: clip.w - 20});
      widgets.rect(clip.x - 12, clip.y + 50, clip.w + 24, 30, {color: '#f59b95'}); });
    widgets.line(width - 44, insets.top + 18, width - 20, insets.top + 42, {width: 3, color: '#7fddd1'});
    widgets.circle(width - 32, insets.top + 130, 11, {color: '#edc583', border: '#ffffff', borderWidth: 2});
    widgets.button('fixture-button', 'Explore OKC', {x: 24, y: height - insets.bottom - 66, w: width - 48, h: 48}, () => {}, {variant: 'primary'});
    return {name: `glyphs-${width < height ? 'portrait' : 'landscape'}`, surface: surface.snapshot(), targets: widgets.targets,
      pixelChecks: [{x: 12, y: clip.y + 60, rgb: [16, 28, 41], tolerance: 2}, {x: Math.floor(width / 2), y: clip.y + 62, rgb: [16, 28, 41], tolerance: 2}]};
  }
  drawHud(widgets, model, control); drawSettings(widgets, model, control);
  return {name: `${type}-${width < height ? 'portrait' : 'landscape'}`, surface: surface.snapshot(), targets: widgets.targets, pixelChecks: []};
}

function bootstrapFixture() {
  const fallback = new GPUSurface(bootstrapAssets);
  fallback.begin(390, 180); fallback.rect(0, 0, 390, 180, {color: '#101c29'});
  fallback.text('F', 24, 24, {size: 64, color: '#ffffff'});
  fallback.text('FONT DOWNLOAD FAILED', 102, 26, {size: 16, maxWidth: 270});
  fallback.text('RETRY TO RESTORE THE UI', 102, 66, {size: 14, maxWidth: 270, color: '#edc583'});
  fallback.rect(24, 116, 342, 48, {color: '#edc583', radius: 9});
  fallback.text('RETRY', 195, 129, {size: 18, color: '#152635', align: 'center'});
  const capture = {name: 'bootstrap-font', atlas: 'bootstrap', surface: fallback.snapshot(), targets: [],
    scope: 'Original bootstrap pixel alphabet through the production glyph shader; no downloaded font or browser text rasterization.',
    pixelChecks: [{x: 44, y: 31, rgb: [255, 255, 255], tolerance: 2}, {x: 44, y: 47, rgb: [16, 28, 41], tolerance: 2}]};
  fallback.dispose(); return capture;
}

let captures;
if (snapshotsFile) {
  const value = JSON.parse(fs.readFileSync(snapshotsFile, 'utf8'));
  captures = Array.isArray(value) ? value : value.views || [value];
} else {
  captures = [[390, 844], [844, 390]].flatMap(([width, height]) => ['glyphs', 'hud', 'settings'].map(type => nativeFixture(width, height, type)));
}
captures.push(bootstrapFixture());
const manifest = {method: 'Actual Three r180 prepared UI shaders + one instanced indexed draw of surface.snapshot() buffers and the checked R8 atlases. Native Mesa GLES; not a browser/device performance measurement.',
  threeVersion: version, sourceHashes, programs, attributeSizes: UI_ATTRIBUTE_SIZES,
  atlas: atlases.main, atlases,
  inputSnapshots: snapshotsFile ? {file: path.basename(snapshotsFile), sha256: hash(fs.readFileSync(snapshotsFile))} : 'Production HUD/settings fixture states plus isolated glyph/clipping fixtures', views: []};
for (let index = 0; index < captures.length; index++) {
  const capture = captures[index], snapshot = capture.surface || capture;
  const atlas = capture.atlas || 'main', expectedMetrics = atlasAssets[atlas]?.metrics;
  if (snapshot.version !== 1 || !Number.isInteger(snapshot.count) || snapshot.count < 0 || snapshot.count > 65536) throw Error('Invalid GPU surface snapshot.');
  if (!expectedMetrics || snapshot.atlas?.sha256 !== expectedMetrics.sha256 || snapshot.atlas.width !== expectedMetrics.width || snapshot.atlas.height !== expectedMetrics.height) throw Error('Snapshot glyph atlas differs from the checked source atlas; regenerate the snapshot before rendering.');
  const {width, height} = snapshot.viewport;
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 8192)) throw Error('Invalid snapshot viewport.');
  const name = String(capture.name || `view-${index}-${width}x${height}`).replace(/[^a-z0-9_-]/gi, '-');
  const entry = {name, width, height, count: snapshot.count, atlas, scope: capture.scope || manifest.inputSnapshots, attributes: {}, texts: snapshot.texts || [],
    targets: (capture.targets || []).map(({id, rect, clip, disabled, kind, label}) => ({id, rect, clip, disabled, kind, label})), pixelChecks: capture.pixelChecks || []};
  for (const [attribute, size] of Object.entries(UI_ATTRIBUTE_SIZES)) {
    const array = snapshot.attributes[attribute];
    if (array.length !== snapshot.count * size || !array.every(Number.isFinite)) throw Error(`Invalid snapshot attribute ${attribute}.`);
    const bytes = Buffer.from(new Float32Array(array).buffer), file = `${name}-${attribute}.f32`;
    fs.writeFileSync(path.join(output, file), bytes); entry.attributes[attribute] = {file, sha256: hash(bytes)};
  }
  entry.matrices = {};
  for (const reversed of [false, true]) {
    const camera = new THREE.OrthographicCamera(0, width, 0, -height, -10, 10); camera.position.z = 1;
    camera._reversedDepth = reversed; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    entry.matrices[reversed ? 'reversed' : 'logarithmic'] = {projectionMatrix: camera.projectionMatrix.toArray(), modelViewMatrix: camera.matrixWorldInverse.toArray()};
  }
  manifest.views.push(entry);
}
surface.dispose(); fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({output, programs: programs.length, views: manifest.views.map(({name, width, height, count}) => ({name, width, height, instances: count})), atlasSha256: metrics.sha256}, null, 2));
