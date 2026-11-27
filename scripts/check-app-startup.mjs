#!/usr/bin/env node
// Built-app integration smoke: real import map, packed assets, scene modules,
// discovery bridge, streamed tiles and driving. Only browser/platform and GPU
// adapters are synthetic. This does not validate shaders, pixels or frame rate.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

if (typeof vm.SourceTextModule !== 'function') {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', ...process.argv.slice(1)], {stdio: 'inherit'});
  process.exit(child.status ?? 1);
}
const {values} = parseArgs({options: {'dist': {type: 'string'}, 'base-url': {type: 'string'}}, strict: true});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(values.dist || path.join(root, 'dist'));
const base = new URL(values['base-url'] || 'https://startup.invalid/okc/');
assert(base.pathname.endsWith('/'), 'The deployment base URL must end in /.');
const html = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
const imports = JSON.parse(html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/)?.[1] || '{}').imports;
assert(imports?.three, 'Built HTML must supply its browser import map.');
const importMap = new Map(Object.entries(imports).map(([key, value]) => [key.startsWith('.') ? new URL(key, base).href : key, new URL(value, base).href]));
const RealThree = await import(pathToFileURL(path.join(directory, new URL(importMap.get('three')).pathname.slice(base.pathname.length))).href);
const errors = [], requests = [], escaped = [], blobs = new Map(), frames = new Map(), timers = new Set();
let clock = 0, frameSerial = 0, lastScene = null, renders = 0;
const noop = () => {};

class Events {
  listeners = new Map();
  addEventListener(type, fn, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    options.signal?.addEventListener('abort', () => this.removeEventListener(type, fn), {once: true});
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ||= this; event.currentTarget = this;
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    if (event.bubbles && !event.cancelBubble) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  emit(type, extra = {}) { return this.dispatchEvent({type, bubbles: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...extra}); }
}
function canvasContext(canvas) {
  const context = {canvas, createImageData: (w, h) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4)}),
    getImageData: (x, y, w, h) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4)}),
    measureText: text => ({width: String(text).length * 7}),
    createLinearGradient: () => ({addColorStop: noop}), createRadialGradient: () => ({addColorStop: noop}),
    createPattern: () => ({setTransform: noop})};
  for (const name of ['putImageData', 'drawImage', 'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'rect', 'roundRect', 'arc', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke',
    'fillText', 'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
    'resetTransform', 'setLineDash', 'clip']) context[name] = noop;
  return context;
}
const decode = text => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
class Element extends Events {
  constructor(tag = 'div', attrs = {}) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {};
    this.style = {setProperty: noop}; this.value = ''; this.textContent = ''; this.hidden = false; this.checked = false;
    this.disabled = false; this.scrollTop = 0; this.width = 300; this.height = 150; this.clientWidth = 1280; this.clientHeight = 720;
    this.classes = new Set();
    this.classList = {add: (...names) => names.forEach(n => this.classes.add(n)), remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: n => this.classes.has(n), toggle: (n, on = !this.classes.has(n)) => { on ? this.classes.add(n) : this.classes.delete(n); return on; }};
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = value;
    if (name === 'value') this.value = String(value);
    if (['hidden', 'checked', 'disabled'].includes(name)) this[name] = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); }
  set innerHTML(value) { this.children = []; parseHTML(String(value), this); }
  get innerHTML() { return ''; }
  insertAdjacentHTML(where, value) { assert.equal(where, 'beforeend'); parseHTML(String(value), this); }
  matches(selector) {
    return selector.split(',').some(item => {
      item = item.trim();
      const attr = item.match(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/);
      if (attr && (!this.hasAttribute(attr[1]) || (attr[2] !== undefined && this.getAttribute(attr[1]) !== attr[2]))) return false;
      item = item.replace(/\[[^\]]*\]/g, '');
      const id = item.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      for (const [, name] of item.matchAll(/\.([\w-]+)/g)) if (!this.classes.has(name)) return false;
      const tag = item.match(/^[a-z][\w-]*/i); return !tag || this.tagName === tag[0].toUpperCase();
    });
  }
  querySelectorAll(selector) { const out = []; const visit = el => { for (const child of el.children) { if (child.matches(selector)) out.push(child); visit(child); } }; visit(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  focus() { document.activeElement = this; }
  setPointerCapture() {} releasePointerCapture() {} setSelectionRange() {} scrollIntoView() {}
  getBoundingClientRect() { return {x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720}; }
  getContext(kind) { if (kind === 'webgl2') return {getExtension: () => null}; if (kind === '2d') return this.context2D ||= canvasContext(this); return null; }
  toDataURL() { return 'data:image/png;base64,c21va2U='; }
  click() { this.emit('click'); }
}
function parseHTML(source, parent) {
  source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [parent], voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const token of source.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const [, close, tag, attributes] = token;
    if (close) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag.toUpperCase()) { stack.length = i; break; } continue; }
    const attrs = {};
    for (const a of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const el = new Element(tag, attrs); stack.at(-1).append(el);
    if (!voids.has(el.tagName) && !attributes.trimEnd().endsWith('/')) stack.push(el);
  }
}
const document = new Element('document'); parseHTML(html, document);
document.body = document.querySelector('body'); document.documentElement = document.querySelector('html'); document.activeElement = document.body; document.hidden = false;
document.getElementById = id => document.querySelector('#' + id);
document.createElement = tag => new Element(tag); document.createElementNS = (_, tag) => new Element(tag);
document.documentElement.requestFullscreen = async () => {}; document.exitFullscreen = async () => {};
const window = new Events(); document.parentNode = window;
const storage = new Map();
const localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key)};
class SmokeURL extends URL { static createObjectURL(blob) { const id = 'blob:startup-' + blobs.size; blobs.set(id, blob); return id; } static revokeObjectURL() {} }
class Renderer {
  constructor({canvas}) { this.domElement = canvas; this.capabilities = {reversedDepthBuffer: false}; this.shadowMap = {}; this.debug = {}; this.xr = {enabled: false}; this.info = {render: {calls: 0, triangles: 0}}; this.coordinateSystem = RealThree.WebGLCoordinateSystem; this.clearColor = new RealThree.Color(); this.viewport = new RealThree.Vector4(0, 0, 1280, 720); this.scissor = this.viewport.clone(); this.target = null; this.autoClear = true; }
  setClearColor(c, a = 1) { this.clearColor.set(c); this.clearAlpha = a; } getClearColor(out) { return out.copy(this.clearColor); } getClearAlpha() { return this.clearAlpha ?? 1; }
  setPixelRatio(v) { this.pixelRatio = v; } getPixelRatio() { return this.pixelRatio; }
  setSize(w, h) { this.width = w; this.height = h; } getSize(out) { return out.set(this.width, this.height); }
  setViewport(...v) { typeof v[0] === 'object' ? this.viewport.copy(v[0]) : this.viewport.set(...v); } getViewport(out) { return out.copy(this.viewport); }
  setScissor(...v) { typeof v[0] === 'object' ? this.scissor.copy(v[0]) : this.scissor.set(...v); } getScissor(out) { return out.copy(this.scissor); }
  setScissorTest(v) { this.scissorTest = v; } getScissorTest() { return !!this.scissorTest; }
  setRenderTarget(target, face = 0, mip = 0) { this.target = target; this.face = face; this.mip = mip; }
  getRenderTarget() { return this.target; } getActiveCubeFace() { return this.face || 0; } getActiveMipmapLevel() { return this.mip || 0; }
  resetState() {} clear() {} compile() {} dispose() {}
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); lastScene = scene; renders++; }
}
class PMREMGenerator { constructor() {} fromScene() { return {texture: new RealThree.Texture(), dispose: noop}; } dispose() {} }
function localPath(url) {
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) { escaped.push(url.href); throw Error(`Asset URL escaped deployment base ${base.href}: ${url.href}`); }
  const name = decodeURIComponent(url.pathname.slice(base.pathname.length));
  const candidate = path.resolve(directory, name);
  assert(candidate.startsWith(directory + path.sep), 'Asset path escaped build directory.');
  return candidate;
}
async function localFetch(value, options = {}) {
  const url = new URL(String(value), base); const record = {url: url.href}; requests.push(record);
  if (options.signal?.aborted) throw options.signal.reason;
  const file = localPath(url);
  try { const bytes = await fs.readFile(file); record.bytes = bytes.length; record.status = 200; return new Response(bytes, {headers: {'content-length': String(bytes.length)}}); }
  catch (error) { if (error.code !== 'ENOENT') throw error; record.status = 404; return new Response('Not found', {status: 404}); }
}
const platformTimers = (fn, delay = 0, ...args) => { const timer = setTimeout(() => { timers.delete(timer); fn(...args); }, delay); timer.unref(); timers.add(timer); return timer; };
const context = vm.createContext({console: {...console, error: (...args) => errors.push(args.map(a => a?.stack || String(a)).join(' '))},
  document, window, localStorage, location: {href: base.href, search: '', reload: noop}, navigator: {hardwareConcurrency: 4},
  performance: {now: () => clock}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  requestAnimationFrame: fn => { const id = ++frameSerial; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
  setTimeout: platformTimers, clearTimeout: timer => { clearTimeout(timer); timers.delete(timer); },
  ResizeObserver: class { observe() {} disconnect() {} },
  dispatchEvent: event => window.dispatchEvent(event), addEventListener: (...args) => window.addEventListener(...args),
  CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  URL: SmokeURL, URLSearchParams, Blob, Response, Request, Headers, AbortController, DOMException,
  DecompressionStream, TextDecoder, TextEncoder, fetch: localFetch, atob, btoa, structuredClone,
  ArrayBuffer, DataView, Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
});
const modules = new Map(), evaluating = new Map();
const threeURL = importMap.get('three');
const synthetic = new vm.SyntheticModule(Object.keys(RealThree), function () {
  for (const [name, value] of Object.entries(RealThree)) this.setExport(name, name === 'WebGLRenderer' ? Renderer : name === 'PMREMGenerator' ? PMREMGenerator : value);
}, {context, identifier: threeURL});
modules.set(threeURL, Promise.resolve(synthetic));
function resolve(specifier, referrer = base.href) { const key = specifier.startsWith('.') || specifier.startsWith('/') ? new URL(specifier, referrer).href : specifier; return importMap.get(key) || new URL(specifier, referrer).href; }
async function moduleFor(url) {
  if (!modules.has(url)) modules.set(url, (async () => {
    const source = await fs.readFile(localPath(new URL(url)), 'utf8');
    return new vm.SourceTextModule(source, {context, identifier: url, initializeImportMeta(meta) { meta.url = url; },
      importModuleDynamically: async specifier => evaluate(await moduleFor(resolve(specifier, url)))});
  })());
  return modules.get(url);
}
const linker = (specifier, referrer) => moduleFor(resolve(specifier, referrer.identifier));
async function evaluate(module) {
  if (module.status === 'unlinked') await module.link(linker);
  if (!evaluating.has(module.identifier)) evaluating.set(module.identifier, module.evaluate());
  await evaluating.get(module.identifier); return module;
}
async function pump() { clock += 1000 / 60; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(clock); await new Promise(resolve => setImmediate(resolve)); }
async function settle(promise, label) {
  let done = false, value, failure; promise.then(v => { done = true; value = v; }, e => { done = true; failure = e; });
  const deadline = Date.now() + 60_000;
  while (!done) { assert(Date.now() < deadline, `${label} timed out`); await pump(); await new Promise(resolve => setTimeout(resolve, 2)); }
  if (failure) throw failure; return value;
}
async function snapshot() {
  document.getElementById('exportBtn').click();
  const blob = [...blobs.values()].at(-1); assert(blob, 'Setup export must provide an inspectable state snapshot.');
  return JSON.parse(await blob.text());
}
try {
  // Prelink shared graphs once, then let the actual boot module evaluate them.
  for (const entry of ['app.js', 'boot.js', 'metro/mesh-builder.js', 'metro/tile-data.js']) {
    const module = await moduleFor(new URL(entry, base).href); if (module.status === 'unlinked') await module.link(linker);
  }
  await settle(evaluate(await moduleFor(new URL('boot.js', base).href)), 'Built application startup');
  const app = await moduleFor(new URL('app.js', base).href);
  assert.equal(await settle(app.namespace.sceneReady, '3D scene ready'), true, `3D startup failed:\n${errors.join('\n')}`);
  assert.equal(escaped.length, 0, `Escaped deployment paths: ${escaped.join(', ')}`);
  assert.equal(document.body.classList.contains('map-only'), false, 'Supported 3D startup must not fall back to atlas.');
  assert.equal(document.getElementById('loading').hidden, true, 'Loading overlay must finish.');
  const downloaded = requests.filter(r => r.status === 200).map(r => new URL(r.url).pathname);
  for (const suffix of ['geo/base-city.bin.gz', 'geo/base-city-layout.json', 'geo/base-surfaces.json.gz', 'geo/metro/manifest.json.gz', 'geo/metro/overview.json.gz', 'geo/metro/pois.json.gz']) assert(downloaded.some(name => name.endsWith(suffix)), `Actual packed asset not consumed: ${suffix}`);
  assert(downloaded.some(name => /\/geo\/metro\/tiles\/.*\.json\.gz$/.test(name)), 'Real metro tile loading must be reached through discovery bridge.');
  assert(lastScene?.getObjectByName('West OKC geographic streaming')?.children.length > 0, 'Streamed geometry must be mounted.');
  const initial = await snapshot(); assert.equal(initial.state.driveMode, 'scenic');
  const button = document.querySelector('[data-drive-mode="free"]'); assert(button, 'Free-drive control missing'); button.click();
  await pump(); const before = await snapshot();
  assert.equal(before.state.driveMode, 'free', 'Free drive must enter from its real control.');
  document.getElementById('scene').focus(); window.emit('keydown', {code: 'KeyW', repeat: false});
  for (let i = 0; i < 60; i++) await pump();
  window.emit('keyup', {code: 'KeyW', repeat: false});
  const after = await snapshot();
  assert(['x', 'z', 'heading', 'speed'].every(key => Number.isFinite(after.driving[key])), 'Free-drive state must remain finite.');
  const distance = Math.hypot(after.driving.x - before.driving.x, after.driving.z - before.driving.z);
  assert(distance > .05, 'Throttle must advance the actual collision-aware free-drive state.');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({passed: true, baseURL: base.href, applicationModules: modules.size,
    packedAssetsRead: downloaded.filter(name => !name.includes('/tiles/')).length, metroTileRequests: downloaded.filter(name => name.includes('/tiles/')).length,
    sceneReady: true, freeDrive: true, distanceUnderThrottleMeters: +distance.toFixed(3), rendererCalls: renders,
    scope: 'Actual built boot/app/import map, packed geometry, scene construction, discovery bridge, tile decoding/compiler/mount and free driving. Browser DOM/canvas, RAF and GPU renderer/PMREM adapters; worker fallback path. No shader, browser layout, image or FPS verification.'}, null, 2));
} catch (error) {
  console.error(JSON.stringify({passed: false, message: error.message, errors, escapedURLs: [...new Set(escaped)], failedRequests: requests.filter(r => r.status !== 200)}, null, 2));
  process.exitCode = 1;
} finally {
  window.emit('pagehide', {persisted: false});
  for (const timer of timers) clearTimeout(timer);
  frames.clear();
}
