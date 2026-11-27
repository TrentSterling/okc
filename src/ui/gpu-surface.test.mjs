import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createGPUSurface, GPUSurface, UI_ATTRIBUTE_SIZES} from './gpu-surface.js';
import {loadGlyphAssets, layoutText, measureText, normalizeText} from './glyphs.js';

const dataURL = new URL('../../public/ui/', import.meta.url);
const metrics = JSON.parse(await readFile(new URL('glyphs.json', dataURL), 'utf8'));
const pixels = new Uint8Array(await readFile(new URL('glyphs.r8', dataURL)));
const packed = await readFile(new URL('glyphs.r8.gz', dataURL));
const assets = {metrics, pixels};

test('licensed binary atlas, gzip, metrics and accented name coverage agree', () => {
  assert.deepEqual(new Uint8Array(gunzipSync(packed)), pixels);
  assert.equal(createHash('sha256').update(pixels).digest('hex'), metrics.sha256);
  assert.equal(pixels.length, metrics.width * metrics.height);
  for (const ch of 'Café Niño Straße Œuvre ←→↑↓✓★–—▦◒⦿✹◡S◇♧▤◔♡✧≈◈▱⌖×−') if (ch !== ' ') assert.ok(metrics.glyphs[ch], ch);
  assert.match(metrics.glyphs['⦿'].source, /original geometric/);
  assert.match(metrics.glyphs['⌖'].source, /original geometric/);
  const accented = metrics.glyphs.é;
  assert.ok(pixels.some((value, index) => value > 128 && index % metrics.width >= accented.x
    && index % metrics.width < accented.x + accented.w && Math.floor(index / metrics.width) >= accented.y
    && Math.floor(index / metrics.width) < accented.y + accented.h));
});

test('compressed and server-decoded font requests retain the deployed application subpath', async () => {
  for (const body of [packed, pixels]) {
    const requests = [];
    const loaded = await loadGlyphAssets({baseURL: new URL('https://example.test/okc/ui/'), fetchImpl: async url => {
      requests.push(url.pathname);
      return new Response(url.pathname.endsWith('.json') ? JSON.stringify(metrics) : body);
    }});
    assert.deepEqual(loaded.pixels, pixels);
    assert.deepEqual(requests.sort(), ['/okc/ui/glyphs.json', '/okc/ui/glyphs.r8.gz']);
  }
});

test('a missing gzip transport safely retries the ordinary binary asset', async () => {
  const requests = [];
  const loaded = await loadGlyphAssets({baseURL: new URL('https://example.test/okc/ui/'), fetchImpl: async url => {
    requests.push(url.pathname);
    if (url.pathname.endsWith('.gz')) return new Response('missing', {status: 404});
    return new Response(url.pathname.endsWith('.json') ? JSON.stringify(metrics) : pixels);
  }});
  assert.deepEqual(loaded.pixels, pixels); assert.ok(requests.includes('/okc/ui/glyphs.r8'));
});

test('text advances, Unicode fallback and wrapping are independent of browser fonts', () => {
  assert.equal(normalizeText('Cafe\u0301\u00a0OKC'), 'Café OKC');
  assert.equal(measureText('🚀', metrics), measureText('?', metrics));
  assert.equal(measureText('AV', metrics, 24), (metrics.glyphs.A.advance + metrics.glyphs.V.advance) / 2);
  const layout = layoutText('A restaurant with a verylongunbrokenname', metrics, {size: 16, maxWidth: 110});
  assert.ok(layout.lines.length > 2); assert.ok(layout.widths.every(width => width <= 110));
  assert.equal(layout.height, layout.lines.length * 20);
  assert.equal(layoutText('a\nb\nc', metrics, {maxLines: 2}).lines.length, 2);
});

test('draw list clips and retains a rotated line crossing the visible viewport', () => {
  const ui = new GPUSurface(assets); ui.begin(200, 100);
  ui.rect(400, 400, 10, 10); ui.text('Hidden', 400, 400);
  assert.equal(ui.stats().instances, 0);
  ui.rect(-5, 5, 30, 30, {color: '#1234', clip: {x: 0, y: 0, width: 10, height: 20}});
  ui.line(5, -200, 5, 300, {width: 2});
  const snapshot = ui.snapshot(); assert.equal(snapshot.count, 2);
  assert.deepEqual(snapshot.attributes.aClip.slice(0, 4), [0, 0, 10, 20]);
  assert.deepEqual(snapshot.attributes.aRotation.slice(2, 4), [0, 1]);
  assert.ok(Math.abs(snapshot.attributes.aColor[3] - 0x44 / 255) < 1e-6);
  ui.dispose();
});

test('center and right text align to their x anchor independently of wrap width', () => {
  const ui = new GPUSurface(assets); const size = 16, glyph = metrics.glyphs.A, width = ui.measure('A', size);
  for (const [align, offset] of [['left', 0], ['center', width / 2], ['right', width]]) {
    for (const maxWidth of [100, 200]) {
      ui.begin(300, 200); ui.text('A', 150, 20, {size, align, maxWidth});
      const x = ui.snapshot().attributes.aRect[0];
      assert.ok(Math.abs(x - (150 - offset + glyph.left * size / metrics.size)) < 1e-5);
    }
  }
  ui.dispose();
});

test('bounded batch growth preserves commands and disposes the previous GPU buffers', () => {
  const ui = new GPUSurface(assets, {capacity: 1, maxCapacity: 4}); ui.begin(100, 100);
  ui.rect(1, 2, 3, 4, {color: '#f00'});
  const first = ui.snapshot(), old = ui.geometry; let disposed = 0;
  old.addEventListener('dispose', () => disposed++);
  ui.rect(10, 20, 30, 40); ui.rect(2, 3, 4, 5); ui.rect(3, 4, 5, 6);
  assert.equal(disposed, 1); assert.equal(ui.capacity, 4); assert.equal(ui.growths, 2);
  for (const [name, size] of Object.entries(UI_ATTRIBUTE_SIZES)) assert.deepEqual(ui.snapshot().attributes[name].slice(0, size), first.attributes[name]);
  assert.throws(() => ui.rect(0, 0, 1, 1), /capacity exceeded/); assert.equal(ui.count, 4);
  ui.begin(100, 100); assert.equal(ui.count, 0); assert.equal(ui.capacity, 4); ui.dispose();
});

test('UI rendering preserves world settings, batches once, and only uploads dirty commands', () => {
  const ui = new GPUSurface(assets); ui.begin(300, 200); ui.rect(0, 0, 300, 200); ui.text('OKC', 10, 10);
  let calls = 0; const renderer = {autoClear: true, toneMappingExposure: 1.4, render(scene) {
    assert.equal(this.autoClear, false); assert.equal(scene.children.length, 1); calls++;
  }};
  ui.render(renderer); ui.render(renderer);
  assert.equal(calls, 2); assert.equal(ui.uploads, 1); assert.equal(ui.material.toneMapped, false);
  assert.equal(renderer.autoClear, true); assert.equal(renderer.toneMappingExposure, 1.4);
  assert.equal(ui.geometry.instanceCount, ui.count);
  renderer.render = () => { throw Error('synthetic render failure'); };
  assert.throws(() => ui.render(renderer), /synthetic/); assert.equal(renderer.autoClear, true);
  ui.dispose();
});

test('shared atlas is released only after its last surface, and disposal is idempotent', async () => {
  const a = await createGPUSurface({assets}), b = await createGPUSurface({assets});
  assert.equal(a.atlas.texture, b.atlas.texture); let released = 0;
  a.atlas.texture.addEventListener('dispose', () => released++);
  a.dispose(); a.dispose(); assert.equal(released, 0); b.dispose(); assert.equal(released, 1);
  assert.throws(() => a.begin(10, 10), /disposed/);
});

test('graphics-unavailable fallback paints baked glyph masks without browser text APIs', async () => {
  const before = {ImageData: globalThis.ImageData, createImageBitmap: globalThis.createImageBitmap};
  const bitmaps = [], calls = [];
  globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, {data, width, height}); } };
  globalThis.createImageBitmap = async data => {
    assert.ok(data.data.some((value, i) => i % 4 === 3 && value > 0));
    const bitmap = {data, closed: false, close() { this.closed = true; }}; bitmaps.push(bitmap); return bitmap;
  };
  const context = new Proxy({canvas: {width: 600, height: 400}}, {get(target, name) {
    if (name in target) return target[name];
    if (name === 'fillText' || name === 'measureText') return () => { throw Error('Browser font API forbidden'); };
    return (...args) => calls.push({name, args});
  }});
  const ui = new GPUSurface(assets); ui.begin(300, 200); ui.rect(0, 0, 300, 200, {color: '#123c'}); ui.text('AAé', 20, 20);
  try {
    await ui.renderCanvas2D(context);
    assert.equal(calls.filter(call => call.name === 'drawImage').length, 3);
    assert.equal(bitmaps.length, 2); assert.ok(calls.some(call => call.name === 'setTransform' && call.args[0] === 2));
    ui.dispose(); assert.ok(bitmaps.every(bitmap => bitmap.closed));
  } finally { ui.dispose(); Object.assign(globalThis, before); }
});
