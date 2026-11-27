// Licensed, offline-baked DejaVu Sans SDF. No browser fonts or text rasterizer.
// Robot Life source: 69b9c4ed0d65193205db8cb07d1fc217716dd783.
const DEFAULT_BASE = new URL('glyphs.json', import.meta.url);
let sharedAssets;
const defaultFetch = (url, options) => globalThis.fetch(url, options);
const abortError = error => error?.name === 'AbortError';

export function validateGlyphMetrics(metrics) {
  if (metrics?.format !== 'sdf-r8-v1' || !Number.isInteger(metrics.width) || !Number.isInteger(metrics.height)
      || metrics.width < 1 || metrics.height < 1 || metrics.width * metrics.height > 4_194_304
      || !(metrics.size > 0) || !(metrics.spread > 0) || !Number.isFinite(metrics.ascent)
      || !metrics.glyphs?.['?'] || !metrics.glyphs?.[' ']) throw Error('Invalid GPU glyph metrics.');
  for (const glyph of Object.values(metrics.glyphs)) {
    if (!['x', 'y', 'w', 'h', 'left', 'top', 'advance'].every(key => Number.isFinite(glyph[key]))
        || glyph.x < 0 || glyph.y < 0 || glyph.w <= 0 || glyph.h <= 0 || glyph.advance < 0
        || glyph.x + glyph.w > metrics.width || glyph.y + glyph.h > metrics.height) throw Error('Invalid GPU glyph bounds.');
  }
  return metrics;
}

async function request(url, fetchImpl, signal) {
  const response = await fetchImpl(url, {signal});
  if (!response.ok) {
    try { await response.body?.cancel?.(); } catch {}
    throw Error(`GPU font download failed (${response.status}): ${url.pathname || url}`);
  }
  return response;
}

export async function loadGlyphMetrics({baseURL = DEFAULT_BASE, fetchImpl = defaultFetch, signal} = {}) {
  const response = await request(new URL('glyphs.json', baseURL), fetchImpl, signal);
  return validateGlyphMetrics(await response.json());
}

async function pixels({baseURL = DEFAULT_BASE, fetchImpl = defaultFetch, signal} = {}) {
  if (globalThis.DecompressionStream) {
    try {
      const response = await request(new URL('glyphs.r8.gz', baseURL), fetchImpl, signal);
      const buffer = new Uint8Array(await response.arrayBuffer());
      // Some servers already expand .gz through Content-Encoding.
      if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) return buffer;
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) { if (signal?.aborted || abortError(error)) throw error; }
  }
  return new Uint8Array(await (await request(new URL('glyphs.r8', baseURL), fetchImpl, signal)).arrayBuffer());
}

async function load(options) {
  const [metrics, data] = await Promise.all([loadGlyphMetrics(options), pixels(options)]);
  if (data.length !== metrics.width * metrics.height) throw Error('GPU glyph atlas length does not match its metrics.');
  return {metrics, pixels: data};
}

/** Custom fetch/baseURL/abort options are isolated; the normal immutable atlas is shared. */
export function loadGlyphAssets(options = {}) {
  if (Object.keys(options).length) return load(options);
  if (!sharedAssets) sharedAssets = load(options).catch(error => { sharedAssets = null; throw error; });
  return sharedAssets;
}

export const normalizeText = value => String(value ?? '').normalize('NFC').replace(/\r/g, '').replace(/[\u00a0\u202f\t]/g, ' ');
export const glyphFor = (metrics, character) => metrics.glyphs[character] || metrics.glyphs['?'];

export function measureText(value, metrics, size = 16) {
  let widest = 0, current = 0;
  for (const ch of normalizeText(value)) {
    if (ch === '\n') { widest = Math.max(widest, current); current = 0; }
    else current += glyphFor(metrics, ch).advance;
  }
  return Math.max(widest, current) * size / metrics.size;
}

/** Word wrapping with finite-width breaking for long place names or URLs. */
export function layoutText(value, metrics, {size = 16, maxWidth = Infinity, maxLines = Infinity, lineHeight = 1.25} = {}) {
  if (!Number.isFinite(size) || !Number.isFinite(lineHeight) || lineHeight <= 0) throw RangeError('GPU text size and line height must be finite.');
  if (!(size > 0) || !(maxWidth > 0) || !(maxLines > 0)) return {lines: [], widths: [], width: 0, height: 0};
  if (maxLines === 1) {
    const normalized = normalizeText(value), first = normalized.split('\n')[0];
    let line = first;
    if (normalized.includes('\n') || measureText(first, metrics, size) > maxWidth) {
      const marker = metrics.glyphs['…'] ? '…' : '...', markerWidth = measureText(marker, metrics, size);
      let prefix = '', width = 0;
      for (const ch of first) {
        const advance = glyphFor(metrics, ch).advance * size / metrics.size;
        if (width + advance + markerWidth > maxWidth) break;
        prefix += ch; width += advance;
      }
      line = markerWidth <= maxWidth ? prefix.trimEnd() + marker : '';
    }
    const width = measureText(line, metrics, size);
    return {lines: [line], widths: [width], width, height: size * lineHeight};
  }
  const lines = [], scale = size / metrics.size, space = glyphFor(metrics, ' ').advance * scale;
  const push = line => { if (lines.length < maxLines) lines.push(line); };
  for (const paragraph of normalizeText(value).split('\n')) {
    if (lines.length >= maxLines) break;
    if (!Number.isFinite(maxWidth)) { push(paragraph); continue; }
    let line = '', width = 0;
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const wordWidth = measureText(word, metrics, size);
      if (line && width + space + wordWidth > maxWidth) { push(line); line = ''; width = 0; }
      if (lines.length >= maxLines) break;
      if (wordWidth > maxWidth) {
        for (const ch of word) {
          const advance = glyphFor(metrics, ch).advance * scale;
          if (line && width + advance > maxWidth) { push(line); line = ''; width = 0; }
          if (lines.length >= maxLines) break;
          line += ch; width += advance;
        }
      } else { if (line) { line += ' '; width += space; } line += word; width += wordWidth; }
    }
    if (lines.length < maxLines) push(line);
  }
  const widths = lines.map(line => measureText(line, metrics, size));
  return {lines, widths, width: widths.length ? Math.max(...widths) : 0, height: lines.length * size * lineHeight};
}
