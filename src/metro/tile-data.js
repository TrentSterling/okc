// Shared by tile and routing workers. Browser HTTP caching handles repeat visits.
export async function loadTileData({url, gzipUrl}, signal) {
  if (gzipUrl && typeof DecompressionStream !== 'undefined') {
    try {
      const response = await fetch(gzipUrl, {signal});
      if (!response.ok) throw new Error(`Map download failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Some CDNs serve .gz files with Content-Encoding and the browser has
      // already unpacked them. Sniff the payload rather than decoding twice.
      if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).json();
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      // Keep a plain JSON path for static hosts or browsers with a broken gzip stream.
    }
  }
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Map download failed (${response.status}). Move back to retry.`);
  return response.json();
}
