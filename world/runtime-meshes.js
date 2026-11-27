import {loadAsset} from '../loading/asset-client.js';
import {reportLoad} from '../metro/download.js';
const [layout,buffer]=await Promise.all([loadAsset(new URL('../geo/base-city-layout.json',import.meta.url),{label:'Reading the skyline layout'}),loadAsset(new URL('../geo/base-city.bin.gz',import.meta.url),{kind:'buffer',gzip:true,label:'Loading the original skyline'})]);
reportLoad('download','Skyline geometry downloaded',{complete:true});
const slice=range=>buffer.slice(range[0],range[0]+range[1]);
export const BAKED_WORLD={...layout,chunks:layout.chunks.map(({vRange,iRange,...m})=>({...m,v:slice(vRange),i:slice(iRange)})),instances:layout.instances.map(({mRange,...m})=>({...m,m:slice(mRange)}))};
reportLoad('geometry','Mapped city geometry is ready',{complete:true});
