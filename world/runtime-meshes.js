import {loadAsset} from '../loading/asset-client.js';
import {reportLoad} from '../metro/download.js';
import {unpackWorld} from './packed-data.js';
const [layout,buffer]=await Promise.all([loadAsset(new URL('../geo/base-city-layout.json',import.meta.url),{label:'Reading the skyline layout'}),loadAsset(new URL('../geo/base-city.bin.gz',import.meta.url),{kind:'buffer',gzip:true,label:'Loading the original skyline'})]);
reportLoad('download','Skyline geometry downloaded',{complete:true});
export const BAKED_WORLD=unpackWorld(layout,buffer);
reportLoad('geometry','Mapped city geometry is ready',{complete:true});
