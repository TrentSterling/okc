import {loadAsset} from '../loading/asset-client.js';
export const WORLD_SURFACES=await loadAsset(new URL('../geo/base-surfaces.json.gz',import.meta.url),{gzip:true,label:'Loading streets and collision geometry'});
