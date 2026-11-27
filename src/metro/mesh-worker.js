import {compileTile} from './mesh-builder.js';
self.onmessage=({data})=>{try{const result=compileTile(data.tile,data.options);const transfer=result.meshes.flatMap(m=>[m.positions.buffer,m.normals.buffer,m.uvs.buffer]);self.postMessage({request:data.request,result},transfer);}catch(e){self.postMessage({request:data.request,error:e.message});}};
