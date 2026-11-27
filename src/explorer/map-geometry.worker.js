import {packMapGeometry} from './map-geometry.js';
import {ShapeUtils} from '../vendor/three.module.js';
self.onmessage=({data})=>{try{const packed=packMapGeometry(data.input,ShapeUtils.triangulateShape);self.postMessage({id:data.id,packed},[...packed.roads,packed.parks,packed.water,packed.buildings].map(v=>v.buffer));}catch(error){self.postMessage({id:data.id,error:error.message});}};
