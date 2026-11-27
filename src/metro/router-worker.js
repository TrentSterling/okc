import {createRouter} from './road-router.js';
import {loadTileData} from './tile-data.js';

let routerPromise;
self.onmessage = async ({data}) => {
  try {
    if (!['route', 'near', 'closestRoad'].includes(data.method)) throw new Error('Unknown road query.');
    if (!routerPromise) routerPromise = loadTileData(data.source).then(createRouter).catch(error => { routerPromise = null; throw error; });
    const router = await routerPromise;
    let result = router[data.method](...data.args);
    if (data.method === 'closestRoad' && result) result = {...result, start: router.nodes[result.a], end: router.nodes[result.b]};
    self.postMessage({request: data.request, result});
  } catch (error) { self.postMessage({request: data.request, error: error.message}); }
};
