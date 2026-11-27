import * as THREE from 'three';
import {loadGlyphAssets, validateGlyphMetrics, glyphFor, measureText, layoutText} from './glyphs.js';

// Adapted from Trent Sterling's Robot Life GPU surface, revision
// 69b9c4ed0d65193205db8cb07d1fc217716dd783. See docs/GLYPH_LICENSE.txt.
export const UI_SHAPES = Object.freeze({rect: 0, glyph: 1, circle: 2});
export const UI_ATTRIBUTE_SIZES = Object.freeze({aRect: 4, aUV: 4, aColor: 4, aShape: 4, aClip: 4, aRotation: 2});
export const GPU_UI_VERTEX_SHADER = `
attribute vec4 aRect; attribute vec4 aUV; attribute vec4 aColor;
attribute vec4 aShape; attribute vec4 aClip; attribute vec2 aRotation;
varying vec2 vUV; varying vec2 vLocal; varying vec2 vPoint; varying vec2 vSize;
varying vec4 vColor; varying vec4 vShape; varying vec4 vClip;
void main(){
 vec2 local=(position.xy-.5)*(aRect.zw+2.*aShape.w);
 vec2 p=aRect.xy+aRect.zw*.5+vec2(local.x*aRotation.x-local.y*aRotation.y,local.x*aRotation.y+local.y*aRotation.x);
 vPoint=p;vLocal=local;vSize=aRect.zw;vUV=aUV.xy+position.xy*aUV.zw;
 vColor=aColor;vShape=aShape;vClip=aClip;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p.x,-p.y,0.,1.);
}`;
export const GPU_UI_FRAGMENT_SHADER = `
uniform sampler2D glyphs;
varying vec2 vUV;varying vec2 vLocal;varying vec2 vPoint;varying vec2 vSize;
varying vec4 vColor;varying vec4 vShape;varying vec4 vClip;
void main(){
 if(vPoint.x<vClip.x||vPoint.y<vClip.y||vPoint.x>vClip.z||vPoint.y>vClip.w)discard;
 float a;
 if(vShape.x>.5&&vShape.x<1.5){
  float d=texture2D(glyphs,vUV).r-.5;
  float w=max(fwidth(d)*.75,.002);a=smoothstep(-w,w,d);
 }else{
  float d;
  if(vShape.x>1.5){d=(length(vLocal/max(vSize*.5,vec2(.001)))-1.)*min(vSize.x,vSize.y)*.5;}
  else{float r=min(vShape.y,min(vSize.x,vSize.y)*.5);vec2 q=abs(vLocal)-vSize*.5+r;d=length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
  if(vShape.z>0.)d=abs(d+vShape.z*.5)-vShape.z*.5;
  float w=max(fwidth(d)*.65,.001);a=1.-smoothstep(-w,w,d);
 }
 if(a*vColor.a<.002)discard;
 gl_FragColor=vec4(vColor.rgb,a*vColor.a);
 #include <colorspace_fragment>
}`;

const textures = new WeakMap();
function acquireTexture(assets) {
  let entry = textures.get(assets);
  if (!entry) {
    const texture = new THREE.DataTexture(assets.pixels, assets.metrics.width, assets.metrics.height, THREE.RedFormat);
    texture.name = 'PrairiePrism.SDF.R8'; texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.unpackAlignment = 1; texture.needsUpdate = true;
    entry = {texture, users: 0}; textures.set(assets, entry);
  }
  entry.users++;
  return {texture: entry.texture, release() { if (--entry.users === 0) { entry.texture.dispose(); textures.delete(assets); } }};
}

const colors = new Map();
function rgba(value = '#ffffff') {
  if (value === null || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
  if (colors.has(value)) return colors.get(value);
  if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(value)) throw TypeError('GPU UI colors must be hexadecimal strings.');
  let hex = value.slice(1); if (hex.length < 5) hex = [...hex].map(ch => ch + ch).join('');
  const alpha = hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1;
  const color = new THREE.Color('#' + hex.slice(0, 6)); const result = [color.r, color.g, color.b, alpha];
  if (colors.size >= 512) colors.clear(); colors.set(value, result); return result;
}

function geometry(capacity, previous) {
  const result = new THREE.InstancedBufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  result.setIndex([0, 2, 1, 0, 3, 2]);
  for (const [name, size] of Object.entries(UI_ATTRIBUTE_SIZES)) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(THREE.DynamicDrawUsage);
    if (previous) attribute.array.set(previous.getAttribute(name).array);
    result.setAttribute(name, attribute);
  }
  result.instanceCount = 0; return result;
}

/** One screen-space draw batch. All dimensions and input hit regions use CSS pixels. */
export class GPUSurface {
  constructor(assets, {capacity = 1024, maxCapacity = 65536} = {}) {
    validateGlyphMetrics(assets?.metrics);
    if (!(assets.pixels instanceof Uint8Array) || assets.pixels.length !== assets.metrics.width * assets.metrics.height) throw Error('Invalid GPU glyph pixels.');
    if (!Number.isInteger(capacity) || !Number.isInteger(maxCapacity) || capacity < 1 || maxCapacity < capacity) throw RangeError('Invalid GPU UI capacity.');
    this.assets = assets; this.metrics = assets.metrics; this.capacity = capacity; this.maxCapacity = maxCapacity;
    this.geometry = geometry(capacity); this.atlas = acquireTexture(assets);
    this.material = new THREE.ShaderMaterial({name: 'PrairiePrism.GPU.UI', uniforms: {glyphs: {value: this.atlas.texture}},
      vertexShader: GPU_UI_VERTEX_SHADER, fragmentShader: GPU_UI_FRAGMENT_SHADER, transparent: true,
      depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true});
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.name = 'GPU UI batch'; this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10); this.camera.position.z = 1;
    this.uploads = 0; this.growths = 0; this.disposed = false; this.fallback = null; this.fallbackLoading = null;
    this.begin(1, 1);
  }
  alive() { if (this.disposed) throw Error('GPU UI surface has been disposed.'); }
  begin(width, height) {
    this.alive(); if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw RangeError('GPU UI needs a positive finite viewport.');
    this.width = width; this.height = height; this.count = 0; this.glyphCount = 0; this.texts = []; this.dirty = true;
    this.geometry.instanceCount = 0;
    Object.assign(this.camera, {right: width, bottom: -height}); this.camera.updateProjectionMatrix(); return this;
  }
  clip(value) {
    if (!value) return [0, 0, this.width, this.height];
    const x = value.x ?? value[0], y = value.y ?? value[1], w = value.w ?? value.width ?? value[2], h = value.h ?? value.height ?? value[3];
    if (![x, y, w, h].every(Number.isFinite)) throw TypeError('GPU UI clip must contain finite x, y, w, h.');
    return [Math.max(0, x), Math.max(0, y), Math.min(this.width, x + Math.max(0, w)), Math.min(this.height, y + Math.max(0, h))];
  }
  reserve() {
    if (this.count < this.capacity) return;
    if (this.capacity === this.maxCapacity) throw RangeError(`GPU UI capacity exceeded (${this.maxCapacity}).`);
    const capacity = Math.min(this.maxCapacity, this.capacity * 2), old = this.geometry;
    this.geometry = geometry(capacity, old); this.mesh.geometry = this.geometry; this.capacity = capacity; this.growths++;
    // Replacing attributes on a live geometry leaves their old GL buffers alive;
    // disposing the replaced geometry releases those buffers on every growth.
    old.dispose();
  }
  quad(x, y, w, h, color, shape, uv, clip, rotation = [1, 0]) {
    this.alive(); if (![x, y, w, h].every(Number.isFinite)) throw TypeError('GPU UI coordinates must be finite.');
    if (![...color, ...shape, ...uv, ...clip, ...rotation].every(Number.isFinite)) throw TypeError('GPU UI attributes must be finite.');
    if (w <= 0 || h <= 0 || color[3] <= 0 || clip[2] <= clip[0] || clip[3] <= clip[1]) return;
    const hw = (w * Math.abs(rotation[0]) + h * Math.abs(rotation[1])) / 2 + shape[3];
    const hh = (w * Math.abs(rotation[1]) + h * Math.abs(rotation[0])) / 2 + shape[3];
    if (x + w / 2 + hw < clip[0] || y + h / 2 + hh < clip[1] || x + w / 2 - hw > clip[2] || y + h / 2 - hh > clip[3]) return;
    this.reserve(); const index = this.count++;
    const values = {aRect: [x, y, w, h], aUV: uv, aColor: color, aShape: shape, aClip: clip, aRotation: rotation};
    for (const [name, value] of Object.entries(values)) this.geometry.getAttribute(name).array.set(value, index * UI_ATTRIBUTE_SIZES[name]);
    if (shape[0] === UI_SHAPES.glyph) this.glyphCount++; this.dirty = true;
  }
  rect(x, y, w, h, {color = '#ffffff', radius = 0, border, borderWidth = 1, clip} = {}) {
    const c = this.clip(clip), r = Math.max(0, radius);
    this.quad(x, y, w, h, rgba(color), [0, r, 0, 1], [0, 0, 0, 0], c);
    if (border && borderWidth > 0) this.quad(x, y, w, h, rgba(border), [0, r, Math.min(borderWidth, w / 2, h / 2), 1], [0, 0, 0, 0], c);
    return this;
  }
  circle(x, y, r, {color = '#ffffff', border, borderWidth = 1, clip} = {}) {
    const c = this.clip(clip); this.quad(x - r, y - r, r * 2, r * 2, rgba(color), [2, 0, 0, 1], [0, 0, 0, 0], c);
    if (border && borderWidth > 0) this.quad(x - r, y - r, r * 2, r * 2, rgba(border), [2, 0, Math.min(borderWidth, r), 1], [0, 0, 0, 0], c);
    return this;
  }
  line(x1, y1, x2, y2, {width = 1, color = '#ffffff', clip} = {}) {
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy), w = length + width;
    this.quad((x1 + x2 - w) / 2, (y1 + y2 - width) / 2, w, width, rgba(color), [0, width / 2, 0, 1], [0, 0, 0, 0], this.clip(clip), length ? [dx / length, dy / length] : [1, 0]);
    return this;
  }
  measure(text, size = 16) { return measureText(text, this.metrics, size); }
  text(value, x, y, {size = 16, color = '#ffffff', maxWidth = Infinity, align = 'left', clip, lineHeight = 1.25, maxLines = Infinity} = {}) {
    this.alive(); const layout = layoutText(value, this.metrics, {size, maxWidth, maxLines, lineHeight});
    const c = this.clip(clip), ink = rgba(color), scale = size / this.metrics.size;
    for (let n = 0; n < layout.lines.length; n++) {
      // Center/right treat x as an anchor. maxWidth controls wrapping only.
      let pen = x - (align === 'center' ? layout.widths[n] / 2 : align === 'right' ? layout.widths[n] : 0);
      for (const ch of layout.lines[n]) {
        const g = glyphFor(this.metrics, ch);
        if (ch !== ' ') this.quad(pen + g.left * scale, y + n * size * lineHeight + (this.metrics.ascent + g.top) * scale,
          g.w * scale, g.h * scale, ink, [1, 0, 0, 0], [g.x / this.metrics.width, g.y / this.metrics.height, g.w / this.metrics.width, g.h / this.metrics.height], c);
        pen += g.advance * scale;
      }
    }
    this.texts.push({text: String(value ?? ''), x, y, size, color, maxWidth: Number.isFinite(maxWidth) ? maxWidth : null,
      align, lineHeight, lines: layout.lines, widths: layout.widths, width: layout.width, height: layout.height, clip: c});
    return layout.height;
  }
  commit() {
    if (!this.dirty) return;
    this.geometry.instanceCount = this.count;
    for (const [name, size] of Object.entries(UI_ATTRIBUTE_SIZES)) {
      const attribute = this.geometry.getAttribute(name); attribute.clearUpdateRanges();
      if (this.count) { attribute.addUpdateRange(0, this.count * size); attribute.needsUpdate = true; }
    }
    this.dirty = false; this.uploads++;
  }
  render(renderer) {
    this.alive(); this.commit(); if (!this.count) return;
    const previous = renderer.autoClear;
    try { renderer.autoClear = false; renderer.render(this.scene, this.camera); }
    finally { renderer.autoClear = previous; }
  }
  async renderCanvas2D(context) {
    this.alive();
    if (!this.fallbackLoading) this.fallbackLoading = import('./canvas-surface.js').then(({CanvasSurface}) => {
      if (this.disposed) return null;
      return this.fallback = new CanvasSurface(this.assets);
    });
    const painter = await this.fallbackLoading; if (!painter || this.disposed) return;
    return painter.render(context, this.snapshot());
  }
  stats() { return {instances: this.count, glyphs: this.glyphCount, drawCalls: this.count ? 1 : 0, capacity: this.capacity,
    maxCapacity: this.maxCapacity, bufferBytes: this.capacity * 22 * 4, atlasBytes: this.assets.pixels.length,
    uploads: this.uploads, growths: this.growths, width: this.width, height: this.height, disposed: this.disposed}; }
  snapshot() {
    return {version: 1, viewport: {width: this.width, height: this.height}, count: this.count,
      atlas: {width: this.metrics.width, height: this.metrics.height, spread: this.metrics.spread, sha256: this.metrics.sha256},
      attributes: Object.fromEntries(Object.entries(UI_ATTRIBUTE_SIZES).map(([name, size]) => [name, Array.from(this.geometry.getAttribute(name).array.subarray(0, this.count * size))])),
      texts: this.texts.map(text => ({...text, lines: [...text.lines], widths: [...text.widths], clip: [...text.clip]}))};
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.fallback?.dispose(); this.geometry.dispose(); this.material.dispose(); this.atlas.release();
    this.scene.remove(this.mesh); this.count = this.glyphCount = 0; this.texts = [];
  }
}

export async function createGPUSurface({assets, ...options} = {}) {
  return new GPUSurface(assets || await loadGlyphAssets(), options);
}
