// One lazily created road graph, outside the frame/UI thread. After inactivity
// the worker is released; ordinary HTTP caching serves its next load.
export function createRouterClient({url, gzipUrl, idleMs = 120000, timeoutMs = 60000,
  workerFactory = () => new Worker(new URL('./router-worker.js', import.meta.url), {type: 'module'}),
} = {}) {
  const source = {url: String(url), gzipUrl: gzipUrl ? String(gzipUrl) : undefined};
  const requests = new Map();
  let worker = null, serial = 0, idleTimer, unavailable = false, local = null, disposed = false;
  function release() {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    local = null;
  }
  function idle() {
    if (requests.size || disposed) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(release, idleMs);
  }
  function finish(id, error, result) {
    const request = requests.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    requests.delete(id);
    error ? request.reject(error) : request.resolve(result);
    idle();
  }
  async function fallback(method, args) {
    if (!local) local = Promise.all([import('./road-router.js'), import('./tile-data.js')])
      .then(async ([{createRouter}, {loadTileData}]) => createRouter(await loadTileData(source)))
      .catch(error => { local = null; throw error; });
    const router = await local;
    if (disposed) throw new Error('The road router is closed.');
    const result = router[method](...args);
    if (method === 'closestRoad' && result) return {...result, start: router.nodes[result.a], end: router.nodes[result.b]};
    return result;
  }
  function start() {
    if (worker || unavailable) return;
    try {
      worker = workerFactory();
      worker.onmessage = ({data}) => finish(data.request, data.error ? new Error(data.error) : null, data.result);
      worker.onerror = event => {
        event.preventDefault?.();
        worker?.terminate();
        worker = null;
        unavailable = true;
        for (const [id, request] of requests) fallback(request.method, request.args)
          .then(result => finish(id, null, result), error => finish(id, error));
      };
    } catch { worker = null; unavailable = true; }
  }
  function call(method, args) {
    if (disposed) return Promise.reject(new Error('The road router is closed.'));
    if (requests.size >= 16) return Promise.reject(new Error('Route planning is busy. Try again in a moment.'));
    clearTimeout(idleTimer);
    start();
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        release();
        for (const key of [...requests.keys()]) finish(key, new Error('Route planning timed out. Please retry.'));
      }, timeoutMs);
      requests.set(id, {method, args, resolve, reject, timer});
      if (worker) {
        try { worker.postMessage({request: id, source, method, args}); }
        catch (error) { finish(id, error); }
      } else fallback(method, args).then(result => finish(id, null, result), error => finish(id, error));
    });
  }
  return {
    route: (from, to) => call('route', [from, to]),
    closestRoad: position => call('closestRoad', [position]),
    near: (position, count) => call('near', [position, count]),
    dispose() {
      disposed = true;
      release();
      for (const id of [...requests.keys()]) finish(id, new Error('The road router is closed.'));
    },
  };
}
