import assert from 'node:assert/strict';
import {register} from 'node:module';
import {typedData,unpackWorld,vertexBounds} from './packed-data.js';
import * as THREE from '../../public/vendor/three.module.js';

register('../../scripts/lib/three-loader.mjs',import.meta.url,{data:{threeURL:new URL('../../public/vendor/three.module.js',import.meta.url).href}});
const {addBakedMeshes}=await import('./baked-meshes.js');
const vertices=new Float32Array([-4.7,2,8,0,1,0,0,0, 5,3.25,-2,0,1,0,1,0, 1,9,2,0,1,0,1,1]);
const indices=new Uint16Array([0,1,2]),matrices=new Float32Array(new THREE.Matrix4().makeTranslation(3,4,5).elements);
// Nonzero byte offsets exercise shared-buffer boundaries and index alignment.
const buffer=new ArrayBuffer(256),vRange=[8,vertices.byteLength],iRange=[108,indices.byteLength],mRange=[116,matrices.byteLength];
new Float32Array(buffer,...[vRange[0],vertices.length]).set(vertices);
new Uint16Array(buffer,...[iRange[0],indices.length]).set(indices);
new Float32Array(buffer,...[mRange[0],matrices.length]).set(matrices);
const oracle=new THREE.BufferGeometry(),data=new THREE.InterleavedBuffer(vertices,8);
oracle.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));oracle.computeBoundingBox();oracle.computeBoundingSphere();
const bounds=vertexBounds(vertices);
assert.deepEqual(bounds,{min:oracle.boundingBox.min.toArray(),max:oracle.boundingBox.max.toArray(),center:oracle.boundingSphere.center.toArray(),radius:oracle.boundingSphere.radius});
const chunk={key:'test',origin:[0,0,0],material:'test',cast:true,indexType:16};
const instance={key:'instances',origin:[0,0,0],material:'test',min:[2.5,3.5,4.5],max:[3.5,4.5,5.5]};
const packed=unpackWorld({chunks:[{...chunk,bounds,vRange,iRange}],instances:[{...instance,mRange}]},buffer);
assert.equal(packed.chunks[0].v.buffer,buffer);assert.equal(packed.chunks[0].i.buffer,buffer);assert.equal(packed.instances[0].m.buffer,buffer);
assert.equal(packed.chunks[0].v.byteOffset,vRange[0]);assert.equal(packed.chunks[0].i.byteOffset,iRange[0]);
assert.deepEqual([...packed.chunks[0].v],[...vertices]);assert.deepEqual([...packed.chunks[0].i],[...indices]);
assert.equal(typedData(packed.chunks[0].v,Float32Array),packed.chunks[0].v,'Typed vertex arrays should be reused.');
const base64=value=>Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64');
const canonical={chunks:[{...chunk,v:base64(vertices),i:base64(indices)}],instances:[{...instance,m:base64(matrices)}]};
assert.deepEqual([...typedData(canonical.chunks[0].v,Float32Array)],[...vertices],'Historical base64 data remains supported.');
assert.throws(()=>unpackWorld({chunks:[{...chunk,vRange:[1,8],iRange}],instances:[]},buffer),/Invalid packed/);
assert.throws(()=>unpackWorld({chunks:[],instances:[{...instance,mRange:[252,64]}]},buffer),/Invalid packed/);
const unit=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),a=new THREE.Group(),b=new THREE.Group();
addBakedMeshes({group:a,unit,bakedWorld:canonical,bakedMaterials:{test:material}});
addBakedMeshes({group:b,unit,bakedWorld:packed,bakedMaterials:{test:material}});
for(let i=0;i<a.children.length;i++){
 const left=a.children[i],right=b.children[i];
 assert.equal(right.count,left.count);assert.deepEqual(right.position.toArray(),left.position.toArray());
 if(left.isInstancedMesh){assert.deepEqual([...right.instanceMatrix.array],[...left.instanceMatrix.array]);assert.deepEqual(right.boundingSphere,left.boundingSphere);}
 else{assert.deepEqual([...right.geometry.attributes.position.data.array],[...left.geometry.attributes.position.data.array]);assert.deepEqual([...right.geometry.index.array],[...left.geometry.index.array]);assert.deepEqual(right.geometry.boundingBox,left.geometry.boundingBox);assert.deepEqual(right.geometry.boundingSphere,left.geometry.boundingSphere);}
}
assert.equal(b.children[0].geometry.attributes.position.data.array.buffer,buffer,'Mounted geometry must retain its shared packed storage.');
assert.equal(b.children[1].instanceMatrix.array.buffer,buffer,'Instance matrices must not allocate an identity-filled replacement.');
for(const object of [...a.children,...b.children])if(!object.isInstancedMesh)object.geometry.dispose();unit.dispose();material.dispose();oracle.dispose();
console.log('Packed city checks passed: shared storage, exact bounds, aligned ranges, legacy buffers and mounted geometry/instances.');
