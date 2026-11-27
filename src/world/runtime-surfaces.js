import {fetchGzip} from '../metro/download.js';
export const WORLD_SURFACES=JSON.parse(new TextDecoder().decode(await fetchGzip(new URL('../geo/base-surfaces.json.gz',import.meta.url),'Loading streets and collision geometry')));
