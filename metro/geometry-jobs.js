// Bounded tile work. Fetch, decompression, JSON parsing and mesh construction all
// run in workers; the scene owns only the returned buffers and resident data.
const abortError = () => Object.assign(new Error('Map loading was cancelled.'), {name: 'AbortError'});
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

export function createGeometryCompiler({
  workerFactory = () => new Worker(new URL('./mesh-worker.js', import.meta.url), {type: 'module'}),
  hardwareConcurrency = globalThis.navigator?.hardwareConcurrency || 4,
  timeoutMs = 45000,
  fallback = async (kind, payload) => {
    await yieldToUI();
    const [{compileTile}, {loadTileData}] = await Promise.all([import('./mesh-builder.js'), import('./tile-data.js')]);
    const raw = kind === 'load' ? await loadTileData(payload.source, payload.signal) : payload.tile;
    if (payload.signal?.aborted) throw abortError();
    const result = compileTile(raw, payload.options);
    return kind === 'load' ? {raw, result} : result;
  },
} = {}) {
  const size = Math.max(1, Math.min(2, Math.floor(hardwareConcurrency) - 1));
  const slots = Array.from({length: size}, () => ({worker: null, job: null, unavailable: false}));
  const queue = [];
  let serial = 0, disposed = false;

  function finish(slot, job, error, result) {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.abort);
    if (slot?.job === job) slot.job = null;
    error ? job.reject(error) : job.resolve(result);
    pump();
  }
  function runFallback(slot, job) {
    Promise.resolve().then(() => {
      if (job.signal?.aborted || disposed) throw abortError();
      return fallback(job.kind, {...job.payload, signal: job.signal});
    }).then(result => finish(slot, job, null, result), error => finish(slot, job, error));
  }
  function makeWorker(slot) {
    if (slot.worker || slot.unavailable) return;
    try {
      slot.worker = workerFactory();
      slot.worker.onmessage = ({data}) => {
        const job = slot.job;
        if (!job || data.request !== job.request) return;
        finish(slot, job, data.error ? new Error(data.error) : null, data.result);
      };
      slot.worker.onerror = event => {
        event.preventDefault?.();
        slot.worker?.terminate();
        slot.worker = null;
        slot.unavailable = true;
        // A failed worker boot is recoverable; malformed geographic data is
        // returned as a normal error and is never repeatedly recompiled.
        if (slot.job) runFallback(slot, slot.job);
      };
    } catch {
      slot.worker = null;
      slot.unavailable = true;
    }
  }
  function pump() {
    if (disposed) return;
    for (const slot of slots) {
      if (slot.job || !queue.length) continue;
      const job = queue.shift();
      if (job.settled) continue;
      slot.job = job;
      job.timer = setTimeout(() => {
        slot.worker?.terminate();
        slot.worker = null;
        finish(slot, job, new Error('Nearby map loading timed out. Move back to retry.'));
      }, timeoutMs);
      makeWorker(slot);
      if (!slot.worker) { runFallback(slot, job); continue; }
      try { slot.worker.postMessage({request: job.request, kind: job.kind, ...job.payload}); }
      catch {
        slot.worker.terminate();
        slot.worker = null;
        slot.unavailable = true;
        runFallback(slot, job);
      }
    }
  }
  function submit(kind, payload, {signal} = {}) {
    if (disposed || signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const job = {request: ++serial, kind, payload, signal, resolve, reject, settled: false};
      job.abort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        const slot = slots.find(s => s.job === job);
        if (slot?.worker) { slot.worker.terminate(); slot.worker = null; }
        finish(slot, job, abortError());
      };
      signal?.addEventListener('abort', job.abort, {once: true});
      queue.push(job);
      pump();
    });
  }
  return {
    compile: (tile, options, control) => submit('compile', {tile, options}, control),
    load: (source, options, control) => submit('load', {source, options}, control),
    stats: () => ({workers: slots.filter(s => s.worker).length, active: slots.filter(s => s.job).length, queued: queue.length}),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of queue.splice(0)) finish(null, job, abortError());
      for (const slot of slots) {
        slot.worker?.terminate();
        slot.worker = null;
        if (slot.job) finish(slot, slot.job, abortError());
      }
    },
  };
}
