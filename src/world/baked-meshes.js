import * as THREE from 'three';
import {typedData} from './packed-data.js';

// Only decode the offline buffers here; no polygon repair or triangulation runs in the browser.
export function addBakedMeshes({group,unit,bakedWorld,bakedMaterials}) {
  for(const chunk of bakedWorld.chunks){
    const data=new THREE.InterleavedBuffer(typedData(chunk.v,Float32Array),8),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
    g.setAttribute('normal',new THREE.InterleavedBufferAttribute(data,3,3));
    g.setAttribute('uv',new THREE.InterleavedBufferAttribute(data,2,6));
    const Index=chunk.indexType===32?Uint32Array:Uint16Array;
    g.setIndex(new THREE.BufferAttribute(typedData(chunk.i,Index),1));
    if(chunk.bounds){
      g.boundingBox=new THREE.Box3(new THREE.Vector3(...chunk.bounds.min),new THREE.Vector3(...chunk.bounds.max));
      g.boundingSphere=new THREE.Sphere(new THREE.Vector3(...chunk.bounds.center),chunk.bounds.radius);
    }else{g.computeBoundingBox();g.computeBoundingSphere();}
    const mesh=new THREE.Mesh(g,bakedMaterials[chunk.material]);mesh.name='Mapped city geometry';mesh.position.fromArray(chunk.origin);
    mesh.castShadow=chunk.cast;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
  for(const chunk of bakedWorld.instances){
    const matrices=typedData(chunk.m,Float32Array);
    // Its final matrices already exist. Do not allocate and fill an identity
    // matrix for each instance only to replace that array immediately below.
    const mesh=new THREE.InstancedMesh(unit,bakedMaterials[chunk.material],0);
    mesh.count=matrices.length/16;
    mesh.name='Baked facade detail instances';mesh.position.fromArray(chunk.origin);
    mesh.instanceMatrix=new THREE.InstancedBufferAttribute(matrices,16);
    mesh.boundingBox=new THREE.Box3(new THREE.Vector3(...chunk.min),new THREE.Vector3(...chunk.max));
    mesh.boundingSphere=mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
}
