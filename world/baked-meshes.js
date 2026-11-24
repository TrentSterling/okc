import * as THREE from 'three';

// Only decode the offline buffers here; no polygon repair or triangulation runs in the browser.
export function addBakedMeshes({group,unit,bakedWorld,bakedMaterials}) {
  function decodeBuffer(encoded){const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer;}
  for(const chunk of bakedWorld.chunks){
    const data=new THREE.InterleavedBuffer(new Float32Array(decodeBuffer(chunk.v)),8),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
    g.setAttribute('normal',new THREE.InterleavedBufferAttribute(data,3,3));
    g.setAttribute('uv',new THREE.InterleavedBufferAttribute(data,2,6));
    const Index=chunk.indexType===32?Uint32Array:Uint16Array;
    g.setIndex(new THREE.BufferAttribute(new Index(decodeBuffer(chunk.i)),1));g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,bakedMaterials[chunk.material]);mesh.name='Mapped city geometry';mesh.position.fromArray(chunk.origin);
    mesh.castShadow=chunk.cast;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
  for(const chunk of bakedWorld.instances){
    const matrices=new Float32Array(decodeBuffer(chunk.m));
    const mesh=new THREE.InstancedMesh(unit,bakedMaterials[chunk.material],matrices.length/16);
    mesh.name='Baked facade detail instances';mesh.position.fromArray(chunk.origin);
    mesh.instanceMatrix=new THREE.InstancedBufferAttribute(matrices,16);
    mesh.boundingBox=new THREE.Box3(new THREE.Vector3(...chunk.min),new THREE.Vector3(...chunk.max));
    mesh.boundingSphere=mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
}
