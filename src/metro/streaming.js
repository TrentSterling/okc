import * as THREE from 'three';
import {createMetroMaterials, updateMetroMaterials} from './materials.js';
import {createGeometryCompiler} from './geometry-jobs.js';
import {mountTile, unmountTile, setTileAppearance} from './tile-scene.js';

const radiusFor = quality => quality === 'high' ? 3 : quality === 'low' ? 1 : 2;
const cancelled = () => Object.assign(new Error('Map loading was cancelled.'), {name: 'AbortError'});

export function createMetroStreamer({scene, manifest, drivingWorld, onStatus = () => {}, onTile = () => {}, overrides = {}, compiler = createGeometryCompiler()}) {
  const group = new THREE.Group();
  group.name = 'West OKC geographic streaming';
  scene.add(group);
  const materials = createMetroMaterials(), tiles = new Map(), pending = new Map(), queue = [];
  const entries = Array.isArray(manifest.tiles) ? manifest.tiles : Object.entries(manifest.tiles || {}).map(([id, value]) => ({id, ...value}));
  const available = new Map(entries.map(tile => [tile.id || tile.key, tile]));
  const tileSize = manifest.tileSizeMeters || manifest.tileSize || 512;
  let groundCache = {x: Infinity, z: Infinity, y: .14};
  let active = 0, lastFocus = '', quality = 'balanced', season = 'christmas', weather = 'clear', destroyed = false;
  let focus = {x: 0, z: 0}, layers = null, night = 0, ensureFocus = null;

  function tileDistance(id) {
    const [x, z] = id.split('_').map(Number);
    return Math.max(Math.abs(x - Math.floor(focus.x / tileSize)), Math.abs(z - Math.floor(focus.z / tileSize)));
  }
  function priority(id) {
    const [x, z] = id.split('_').map(Number);
    return (x - Math.floor(focus.x / tileSize)) ** 2 + (z - Math.floor(focus.z / tileSize)) ** 2;
  }
  function source(info, id) {
    // The deployed module is /okc/metro/streaming.js; stay inside /okc/.
    const url = filename => new URL(filename.startsWith('geo/') ? '../' + filename : '../geo/metro/' + filename, import.meta.url).href;
    return {url: url(info.url || info.file || 'tiles/' + id + '.json'), gzipUrl: info.gzipUrl ? url(info.gzipUrl) : undefined};
  }
  const options = detail => ({detail, overrides, ...(manifest.coreBounds ? {core: manifest.coreBounds} : {})});
  function evict(id) {
    const tile = tiles.get(id);
    if (!tile) return;
    unmountTile({parent: group, drivingWorld, id, tile});
    tiles.delete(id);
    groundCache.x = Infinity;
  }
  function mount(id, result, raw, detail) {
    if (destroyed || tileDistance(id) > radiusFor(quality) + 1) return null;
    evict(id);
    const tile = mountTile({parent: group, materials, drivingWorld, id, result, raw, detail});
    tiles.set(id, tile);
    groundCache.x = Infinity;
    setTileAppearance(tile, {layers, season, night});
    onTile(result.buildings, tile.group);
    return tile;
  }
  function complete(job, error, tile) {
    if (pending.get(job.id) === job) pending.delete(job.id);
    if (error) job.reject(error); else job.resolve(tile);
  }
  function load(id, detail = false) {
    if (destroyed) return Promise.reject(cancelled());
    const old = tiles.get(id);
    if (old && (!detail || old.detail)) return Promise.resolve(old);
    if (pending.has(id)) {
      const job = pending.get(id);
      if (!job.controller.signal.aborted) { job.detail ||= detail; return job.promise; }
      pending.delete(id);
    }
    const info = available.get(id);
    if (!info) return Promise.resolve(null);
    const job = {id, detail, info, controller: new AbortController(), raw: old?.raw};
    job.promise = new Promise((resolve, reject) => Object.assign(job, {resolve, reject}));
    pending.set(id, job);
    queue.push(job);
    queue.sort((a, b) => priority(a.id) - priority(b.id));
    pump();
    return job.promise;
  }
  function pump() {
    if (destroyed) return;
    // Two worker jobs can execute while a third is already queued. No unbounded
    // per-frame work or direct detail-upgrade bypass of this budget.
    while (active < 3 && queue.length) {
      const job = queue.shift();
      active++;
      (async () => {
        try {
          let detail = job.detail;
          const control = {signal: job.controller.signal};
          let raw = job.raw, result;
          if (raw) result = await compiler.compile(raw, options(detail), control);
          else ({raw, result} = await compiler.load(source(job.info, job.id), options(detail), control));
          if (job.detail && !detail) {
            detail = true;
            result = await compiler.compile(raw, options(detail), control);
          }
          if (job.controller.signal.aborted) throw cancelled();
          complete(job, null, mount(job.id, result, raw, detail));
        } catch (error) {
          if (error.name !== 'AbortError' && !destroyed) onStatus({...stats(), error: error.message});
          complete(job, error);
        } finally {
          active--;
          pump();
          if (!destroyed) onStatus(stats());
        }
      })();
    }
  }
  function updatePosition(position, force = false) {
    if (ensureFocus && !force) return;
    if (destroyed || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    focus = {x: position.x, z: position.z};
    const cx = Math.floor(focus.x / tileSize), cz = Math.floor(focus.z / tileSize);
    const tag = cx + '_' + cz + '_' + quality;
    if (tag === lastFocus) return;
    lastFocus = tag;
    const radius = radiusFor(quality), wanted = [];
    for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
      const id = (cx + x) + '_' + (cz + z);
      if (available.has(id)) wanted.push({id, distance: x * x + z * z});
    }
    wanted.sort((a, b) => a.distance - b.distance);
    for (let i = queue.length - 1; i >= 0; i--) {
      const job = queue[i];
      if (tileDistance(job.id) <= radius) continue;
      queue.splice(i, 1);
      job.controller.abort();
      complete(job, null, null);
    }
    for (const job of pending.values()) if (tileDistance(job.id) > radius + 1) job.controller.abort();
    queue.sort((a, b) => priority(a.id) - priority(b.id));
    for (const tile of wanted) load(tile.id, tile.distance <= 2 && quality !== 'low').catch(() => {});
    for (const id of tiles.keys()) if (tileDistance(id) > radius + 1) evict(id);
    onStatus(stats());
  }
  async function ensure(position) {
    const ticket = {}; ensureFocus = ticket;
    updatePosition(position, true);
    const cx = Math.floor(position.x / tileSize), cz = Math.floor(position.z / tileSize), needed = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) needed.push(load((cx + x) + '_' + (cz + z), quality !== 'low'));
    // Navigation must not place the car before its collision tiles are ready.
    try { await Promise.all(needed); return true; }
    finally { if (ensureFocus === ticket) ensureFocus = null; }
  }
  function stats() {
    return {loadedTiles: tiles.size, pendingTiles: pending.size, totalTiles: available.size,
      buildings: [...tiles.values()].reduce((count, tile) => count + tile.buildings.length, 0),
      geometryBytes: [...tiles.values()].reduce((count, tile) => count + tile.geometryBytes, 0),
      tileSize, quality, ...compiler.stats()};
  }
  function appearance() { for (const tile of tiles.values()) setTileAppearance(tile, {layers, season, night}); }
  function closestBuilding(x, z) {
    let best = null, distance = Infinity;
    for (const tile of tiles.values()) for (const building of tile.buildings) {
      const candidate = (building.x - x) ** 2 + (building.z - z) ** 2;
      if (candidate < distance) { distance = candidate; best = building; }
    }
    return distance < 250 * 250 ? best : null;
  }
  function groundHeight(x, z) {
    if (Math.hypot(x - groundCache.x, z - groundCache.z) < 3) return groundCache.y;
    let best = 30 * 30, y = .14;
    // A local 3×3 neighborhood is enough even when high quality keeps 49 tiles.
    const cx = Math.floor(x / tileSize), cz = Math.floor(z / tileSize);
    for (let tx = cx - 1; tx <= cx + 1; tx++) for (let tz = cz - 1; tz <= cz + 1; tz++) {
      for (const road of tiles.get(tx + '_' + tz)?.raw.roads || []) {
        const points = road.p || [];
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          const distance = (x - a[0] - dx * t) ** 2 + (z - a[1] - dz * t) ** 2;
          if (distance < best) { best = distance; y = .14 + Math.max(road.bridge ? 1 : 0, road.layer || 0) * 5; }
        }
      }
    }
    groundCache = {x, z, y};
    return y;
  }
  return {group, tiles, materials, stats, ensure, updatePosition, closestBuilding, groundHeight,
    async override(building) {
      overrides[building.id] = {...(overrides[building.id] || {}), ...building};
      for (const [id, tile] of tiles) if (tile.buildings.some(item => item.id === building.id)) {
        const result = await compiler.compile(tile.raw, options(tile.detail));
        if (tiles.get(id) === tile) mount(id, result, tile.raw, tile.detail);
        break;
      }
    },
    setQuality(next) { quality = ['high', 'balanced', 'low'].includes(next) ? next : 'balanced'; lastFocus = ''; updatePosition(focus, true); },
    setLayers(next) { layers = next; appearance(); },
    setSeason(next) { season = next; appearance(); },
    setWeather(next) { weather = next; },
    update(dt, time, currentNight) { night = currentNight; updateMetroMaterials(materials, night, weather); appearance(); },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      for (const job of queue.splice(0)) { job.controller.abort(); complete(job, cancelled()); }
      for (const job of pending.values()) job.controller.abort();
      compiler.dispose();
      for (const id of tiles.keys()) evict(id);
      Object.values(materials).forEach(material => { material.map?.dispose(); material.dispose(); });
      scene.remove(group);
    },
  };
}
