// Graphics-unavailable fallback only. Rasterizes the same baked SDF coverage;
// it never asks a browser font engine to measure or paint a character.
const srgb = value => Math.round(255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055));
const smoothstep = (lo, hi, value) => { const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

function roundedPath(context, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + r, y); context.lineTo(x + w - r, y); context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r); context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h); context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}

export class CanvasSurface {
  constructor(assets, {cacheLimit = 512} = {}) {
    this.assets = assets; this.cacheLimit = cacheLimit; this.cache = new Map(); this.generation = 0; this.disposed = false;
  }
  glyph(command, sx, sy) {
    const {metrics, pixels} = this.assets, uv = command.uv;
    const x = Math.round(uv[0] * metrics.width), y = Math.round(uv[1] * metrics.height);
    const w = Math.round(uv[2] * metrics.width), h = Math.round(uv[3] * metrics.height);
    const range = Math.max(.5, .75 * 127 / metrics.spread * (w / (command.rect[2] * sx) + h / (command.rect[3] * sy)) / 2);
    const rgb = command.color.slice(0, 3).map(srgb), alpha = command.color[3];
    const key = [x, y, w, h, ...rgb, alpha, Math.round(range * 100) / 100].join('/');
    command.bitmapKey = key;
    let entry = this.cache.get(key);
    if (entry) { this.cache.delete(key); this.cache.set(key, entry); return entry.promise; }
    if (!globalThis.ImageData || !globalThis.createImageBitmap) throw Error('Baked glyph fallback needs ImageData and createImageBitmap.');
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const offset = (j * w + i) * 4;
      data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2];
      data[offset + 3] = Math.round(255 * alpha * smoothstep(127.5 - range, 127.5 + range, pixels[(y + j) * metrics.width + x + i]));
    }
    entry = {bitmap: null, promise: null}; this.cache.set(key, entry);
    entry.promise = globalThis.createImageBitmap(new ImageData(data, w, h)).then(bitmap => {
      if (this.disposed) { bitmap.close?.(); return null; }
      entry.bitmap = bitmap; return bitmap;
    }).catch(error => { this.cache.delete(key); throw error; });
    return entry.promise;
  }
  async render(context, snapshot) {
    if (this.disposed) return;
    const generation = ++this.generation, {attributes: a, viewport, count} = snapshot;
    const sx = context.canvas.width / viewport.width, sy = context.canvas.height / viewport.height;
    const commands = [], ready = [];
    for (let i = 0; i < count; i++) {
      const offset = i * 4, command = {rect: a.aRect.slice(offset, offset + 4), uv: a.aUV.slice(offset, offset + 4),
        color: a.aColor.slice(offset, offset + 4), shape: a.aShape.slice(offset, offset + 4),
        clip: a.aClip.slice(offset, offset + 4), rotation: a.aRotation.slice(i * 2, i * 2 + 2)};
      commands.push(command);
      if (command.shape[0] === 1) ready.push(this.glyph(command, sx, sy));
    }
    await Promise.all(ready);
    if (this.disposed || generation !== this.generation) return;
    context.save(); context.setTransform(sx, 0, 0, sy, 0, 0); context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    try {
      for (const command of commands) {
        const [x, y, w, h] = command.rect, [kind, radius, stroke] = command.shape, c = command.clip;
        context.save();
        try {
          context.beginPath(); context.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]); context.clip();
          context.translate(x + w / 2, y + h / 2); context.rotate(Math.atan2(command.rotation[1], command.rotation[0]));
          if (kind === 1) {
            const bitmap = this.cache.get(command.bitmapKey)?.bitmap;
            if (bitmap) context.drawImage(bitmap, -w / 2, -h / 2, w, h);
          } else {
            const rgb = command.color.slice(0, 3).map(srgb), ink = `rgba(${rgb.join(',')},${command.color[3]})`;
            context.fillStyle = context.strokeStyle = ink; context.lineWidth = stroke;
            if (kind === 2) { context.beginPath(); context.ellipse(0, 0, Math.max(0, (w - stroke) / 2), Math.max(0, (h - stroke) / 2), 0, 0, Math.PI * 2); }
            else roundedPath(context, (-w + stroke) / 2, (-h + stroke) / 2, w - stroke, h - stroke, radius - stroke / 2);
            if (stroke) context.stroke(); else context.fill();
          }
        } finally { context.restore(); }
      }
    } finally { context.restore(); }
    // Evict only after drawing; in-flight commands never reference closed bitmaps.
    while (this.cache.size > this.cacheLimit) {
      const key = this.cache.keys().next().value, entry = this.cache.get(key);
      this.cache.delete(key); entry.bitmap?.close?.();
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.generation++;
    for (const entry of this.cache.values()) entry.bitmap?.close?.(); this.cache.clear();
  }
}
