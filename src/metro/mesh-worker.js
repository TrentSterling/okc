import {compileTile} from './mesh-builder.js';
import {loadTileData} from './tile-data.js';

self.onmessage = async ({data}) => {
  try {
    const raw = data.kind === 'load' ? await loadTileData(data.source) : data.tile;
    const compiled = compileTile(raw, data.options);
    const transfer = compiled.meshes.flatMap(mesh => [mesh.positions.buffer, mesh.normals.buffer, mesh.uvs.buffer]);
    const result = data.kind === 'load' ? {raw, result: compiled} : compiled;
    self.postMessage({request: data.request, result}, transfer);
  } catch (error) { self.postMessage({request: data.request, error: error.message}); }
};
