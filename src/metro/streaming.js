import * as THREE from 'three';
import {createMetroMaterials, updateMetroMaterials} from './materials.js';
import {createGeometryCompiler} from './geometry-jobs.js';
import {mountTile, unmountTile, setTileAppearance} from './tile-scene.js';
import {createTileCoverage} from './view-coverage.js';

const cancelled = () => Object.assign(new Error('Map loading was cancelled.'), {name: 'AbortError'});

export function createMetroStreamer({scene, manifest, drivingWorld, onStatus = () => {}, onTile = () => {}, overrides = {}, compiler = createGeometryCompiler()}) {
  const group = new THREE.Group(); group.name = 'West OKC geographic streaming'; scene.add(group);
  const materials = createMetroMaterials(), tiles = new Map(), pending = new Map(), queue = [], mounts = [];
  const entries = Array.isArray(manifest.tiles) ? manifest.tiles : Object.entries(manifest.tiles || {}).map(([id, value]) => ({id, ...value}));
  const available = new Map(entries.map(tile => [tile.id || tile.key, tile]));
  const tileSize = manifest.tileSizeMeters || manifest.tileSize || 512;
  const coverage = createTileCoverage({entries, tileSize, coreBounds: manifest.coreBounds});
  let groundCache = {x: Infinity, z: Infinity, y: .14};
  let active = 0, quality = 'balanced', season = 'christmas', weather = 'clear', destroyed = false;
  let focus = {x: 0, z: 0}, viewCamera = null, layers = null, night = 0, ensureFocus = null;
  let selection = {wanted: new Map(), anchors: [], limit: 48, range: 2400}, initialized = false, generation = 0;
  let viewKey = '', lastViewTime = -Infinity, mountFrame = null, materialNight = -1, materialWeather = null, appearanceNight = -1;

  function source(info, id) {
    // The deployed module is /okc/metro/streaming.js; stay inside /okc/.
    const url = filename => new URL(filename.startsWith('geo/') ? '../' + filename : '../geo/metro/' + filename, import.meta.url).href;
    return {url: url(info.url || info.file || 'tiles/' + id + '.json'), gzipUrl: info.gzipUrl ? url(info.gzipUrl) : undefined};
  }
  const options = detail => ({detail, overrides,
    ...(manifest.coreBounds ? {core: manifest.coreBounds} : {}),
    ...(manifest.coreSurfaceBounds ? {surfaceCore: manifest.coreSurfaceBounds} : {})});
  const priority = id => selection.wanted.get(id)?.priority ?? Infinity;
  function evict(id) {
    const tile = tiles.get(id); if (!tile) return;
    unmountTile({parent: group, drivingWorld, id, tile}); tiles.delete(id); groundCache.x = Infinity;
  }
  function nearby(id) {
    const [x, z] = id.split('_').map(Number), px = (x + .5) * tileSize, pz = (z + .5) * tileSize;
    return selection.anchors.some(p => Math.hypot(px - p.x, pz - p.z) < selection.range + tileSize * 2);
  }
  function trim() {
    for (const id of tiles.keys()) if (!selection.wanted.has(id) && !nearby(id)) evict(id);
    const spare = [...tiles].filter(([id]) => !selection.wanted.has(id)).sort((a, b) => a[1].lastWanted - b[1].lastWanted);
    while (tiles.size > selection.limit && spare.length) evict(spare.shift()[0]);
  }
  function mount(id, result, raw, detail, replace = false) {
    if (destroyed || (!selection.wanted.has(id) && !(replace && tiles.has(id)))) return null;
    evict(id);
    const tile = mountTile({parent: group, materials, drivingWorld, id, result, raw, detail});
    tile.lastWanted = generation; tiles.set(id, tile); groundCache.x = Infinity;
    setTileAppearance(tile, {layers, season, night}); onTile(result.buildings, tile.group); trim();
    return tile;
  }
  function drainMounts() {
    mountFrame = null;
    const next = mounts.shift();
    if (next) {
      try {
        if (destroyed || next.job.controller.signal.aborted) throw cancelled();
        next.resolve(mount(next.job.id, next.result, next.raw, next.detail));
      } catch (error) { next.reject(error); }
    }
    if (mounts.length) mountFrame = requestAnimationFrame(drainMounts);
  }
  function mountWhenReady(job, result, raw, detail) {
    // Worker completions can arrive together. Upload at most one tile per
    // display frame; active job limits also bound the waiting buffer memory.
    if (typeof requestAnimationFrame !== 'function') return Promise.resolve(mount(job.id, result, raw, detail));
    return new Promise((resolve, reject) => {
      mounts.push({job, result, raw, detail, resolve, reject});
      if (mountFrame === null) mountFrame = requestAnimationFrame(drainMounts);
    });
  }
  function complete(job, error, tile) {
    if (pending.get(job.id) === job) pending.delete(job.id);
    error ? job.reject(error) : job.resolve(tile);
  }
  function load(id, detail = false) {
    if (destroyed) return Promise.reject(cancelled());
    const old = tiles.get(id);
    if (old && (!detail || old.detail)) { old.lastWanted = generation; return Promise.resolve(old); }
    if (pending.has(id)) {
      const job = pending.get(id);
      if (!job.controller.signal.aborted) {
        job.detail ||= detail;
        // Detail can change after compilation while the upload waits for its
        // display frame. Finish that bounded upload, then upgrade if still wanted.
        return detail ? job.promise.then(tile => tile && !tile.detail && selection.wanted.has(id) ? load(id, true) : tile) : job.promise;
      }
      pending.delete(id);
    }
    const info = available.get(id); if (!info) return Promise.resolve(null);
    const job = {id, detail, info, controller: new AbortController(), raw: old?.raw};
    job.promise = new Promise((resolve, reject) => Object.assign(job, {resolve, reject}));
    pending.set(id, job); queue.push(job); queue.sort((a, b) => priority(a.id) - priority(b.id)); pump();
    return job.promise;
  }
  function pump() {
    if (destroyed) return;
    while (active < 3 && queue.length) {
      const job = queue.shift(); active++;
      (async () => {
        try {
          let detail = job.detail, raw = job.raw, result;
          const control = {signal: job.controller.signal};
          if (raw) result = await compiler.compile(raw, options(detail), control);
          else ({raw, result} = await compiler.load(source(job.info, job.id), options(detail), control));
          if (job.detail && !detail) { detail = true; result = await compiler.compile(raw, options(detail), control); }
          if (job.controller.signal.aborted) throw cancelled();
          complete(job, null, await mountWhenReady(job, result, raw, detail));
        } catch (error) {
          if (error.name !== 'AbortError' && !destroyed) onStatus({...stats(), error: error.message});
          complete(job, error);
        } finally { active--; pump(); if (!destroyed) onStatus(stats()); }
      })();
    }
  }
  function requestCoverage(position, camera, collisionOnly = false) {
    if (destroyed || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    focus = {x: position.x, z: position.z}; viewCamera = camera; initialized = true; generation++;
    selection = coverage.select(focus, camera, quality, {collisionOnly});
    for (let i = queue.length - 1; i >= 0; i--) {
      const job = queue[i]; if (selection.wanted.has(job.id)) continue;
      queue.splice(i, 1); job.controller.abort(); complete(job, null, null);
    }
    for (const job of pending.values()) if (!selection.wanted.has(job.id)) job.controller.abort();
    queue.sort((a, b) => priority(a.id) - priority(b.id));
    for (const [id, wanted] of selection.wanted) load(id, wanted.detail).catch(() => {});
    trim(); onStatus(stats());
  }
  function updatePosition(position, force = false) {
    if (ensureFocus && !force) return;
    const key = Math.floor(position.x / tileSize) + '_' + Math.floor(position.z / tileSize) + '_' + quality;
    if (!force && key === viewKey) return;
    viewKey = key; requestCoverage(position, null);
  }
  function updateView(position, camera, now = performance.now(), force = false) {
    if (ensureFocus && !force) return;
    if (!force && now - lastViewTime < 120) return;
    lastViewTime = now;
    const p = camera.position, q = camera.quaternion;
    const poseKey = [position.x / 20, position.z / 20, p.x / 20, p.y / 20, p.z / 20, q.x * 120, q.y * 120, q.z * 120, q.w * 120].map(Math.round).join('_');
    // Projection changes also reveal geography with a stationary camera: wheel
    // zoom, FOV, aspect ratio, orthographic bounds and view offsets all matter.
    const key = poseKey + '_' + camera.projectionMatrix.elements.join('_') + '_' + quality;
    if (!force && key === viewKey) return;
    viewKey = key; requestCoverage(position, camera);
  }
  async function ensure(position) {
    const ticket = {}; ensureFocus = ticket; viewKey = '';
    requestCoverage(position, null, true);
    const needed = [...selection.wanted].map(([id, item]) => load(id, item.detail));
    // The original downtown already has baked collision. Only missing metro
    // neighborhoods block a teleport; distant view tiles remain background work.
    try { await Promise.all(needed); return true; }
    finally { if (ensureFocus === ticket) ensureFocus = null; }
  }
  function stats() {
    return {loadedTiles: tiles.size, pendingTiles: pending.size, totalTiles: available.size, wantedTiles: selection.wanted.size,
      buildings: [...tiles.values()].reduce((count, tile) => count + tile.buildings.length, 0),
      geometryBytes: [...tiles.values()].reduce((count, tile) => count + tile.geometryBytes, 0),
      tileSize, quality, residentLimit: selection.limit, queuedMounts: mounts.length, ...compiler.stats()};
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
    const core = manifest.coreBounds;
    if (core && x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ) return .14;
    if (Math.hypot(x - groundCache.x, z - groundCache.z) < 3) return groundCache.y;
    let best = 30 * 30, y = .14;
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
    groundCache = {x, z, y}; return y;
  }
  return {group, tiles, materials, stats, ensure, updatePosition, updateView, closestBuilding, groundHeight,
    async override(building) {
      overrides[building.id] = {...(overrides[building.id] || {}), ...building};
      for (const [id, tile] of tiles) if (tile.buildings.some(item => item.id === building.id)) {
        const result = await compiler.compile(tile.raw, options(tile.detail));
        if (tiles.get(id) === tile) mount(id, result, tile.raw, tile.detail, true);
        break;
      }
    },
    setQuality(next) {
      next = ['high', 'balanced', 'low'].includes(next) ? next : 'balanced'; if (next === quality) return;
      quality = next; viewKey = ''; if (initialized && !ensureFocus) requestCoverage(focus, viewCamera);
    },
    setLayers(next) {
      const changed = ['buildings', 'roads', 'water', 'parks'].some(key => layers?.[key] !== next?.[key]);
      layers = next; if (changed) appearance();
    },
    setSeason(next) { if (season !== next) { season = next; appearance(); } },
    setWeather(next) { weather = next; },
    update(dt, time, currentNight) {
      night = currentNight;
      if (Math.abs(night - materialNight) > .002 || weather !== materialWeather) {
        updateMetroMaterials(materials, night, weather); materialNight = night; materialWeather = weather;
      }
      if (Math.abs(night - appearanceNight) > .005) { appearance(); appearanceNight = night; }
    },
    dispose() {
      if (destroyed) return; destroyed = true;
      if (mountFrame !== null) cancelAnimationFrame(mountFrame); mountFrame = null;
      for (const entry of mounts.splice(0)) entry.reject(cancelled());
      for (const job of queue.splice(0)) { job.controller.abort(); complete(job, cancelled()); }
      for (const job of pending.values()) job.controller.abort();
      compiler.dispose(); for (const id of tiles.keys()) evict(id);
      Object.values(materials).forEach(material => { material.map?.dispose(); material.dispose(); }); scene.remove(group);
    },
  };
}
