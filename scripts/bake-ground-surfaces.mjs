// Consume the compiler's cell-local constrained triangulation without passing
// painted ground back through Earcut. Other ground layers retain their bake.
export function bakeGroundSurfaces(world, {triangle, polygon}, stats, cellSize) {
  const compiled = world.groundTriangulation;
  if (!compiled || compiled.version !== 1 || compiled.cellSize !== cellSize)
    throw Error('Regenerate ground triangulation for this mesh-cell size before baking');
  const painted = new Set(['road', 'parking']);
  const byKind = new Map();
  for (const chunk of compiled.chunks) {
    if (!painted.has(chunk.kind)) throw Error(`Unexpected constrained ground layer: ${chunk.kind}`);
    if (!byKind.has(chunk.kind)) byKind.set(chunk.kind, []);
    byKind.get(chunk.kind).push(chunk);
  }
  stats.constrainedGroundTriangles = 0;
  stats.constrainedGroundChunks = compiled.chunks.length;
  for (const layer of world.layers) {
    const material = `ground.${layer.kind}`;
    if (!painted.has(layer.kind)) {
      for (const p of layer.polygons) polygon(p, layer.y, material, false, layer.uvScale);
      continue;
    }
    const chunks = byKind.get(layer.kind) || [];
    if (layer.polygons.length && !chunks.length) throw Error(`Missing constrained ${layer.kind} triangles`);
    for (const chunk of chunks) for (const t of chunk.triangles) {
      if (t.length !== 6 || !t.every(Number.isFinite)) throw Error('Invalid constrained ground triangle');
      const vertices = [0, 2, 4].map(i => [t[i], layer.y, t[i + 1], 0, 1, 0,
        t[i] / layer.uvScale, t[i + 1] / layer.uvScale]);
      triangle(...vertices, material, false);
      stats.constrainedGroundTriangles++;
    }
  }
}
