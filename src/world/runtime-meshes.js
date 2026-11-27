import {fetchGzip,reportLoad} from '../metro/download.js';
const [layout,buffer]=await Promise.all([fetch(new URL('../geo/base-city-layout.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('City geometry layout unavailable');return r.json();}),fetchGzip(new URL('../geo/base-city.bin.gz',import.meta.url),'Loading the original skyline')]);
reportLoad('geometry','Preparing mapped city geometry');
const slice=range=>buffer.slice(range[0],range[0]+range[1]);
export const BAKED_WORLD={...layout,chunks:layout.chunks.map(({vRange,iRange,...m})=>({...m,v:slice(vRange),i:slice(iRange)})),instances:layout.instances.map(({mRange,...m})=>({...m,m:slice(mRange)}))};
