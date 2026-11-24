import * as THREE from 'three';
import { mergeGeometry } from './geometry.js';

const tmp = new THREE.Object3D();

export function createBatching({group, unit, chunkSize, paintGeometry}) {
  const batches=new Map(), merged=new Map();
  function addBatch(geometry,material,position,scale=[1,1,1],rotation=0,color) {
    const cell=geometry===paintGeometry?'paint':Math.floor(position[0]/chunkSize)+':'+Math.floor(position[2]/chunkSize);
    const key=geometry.uuid+material.uuid+cell;let b=batches.get(key);if(!b){b={geometry,material,items:[]};batches.set(key,b);}
    b.items.push({position,scale,rotation,color});
  }
  function addBox(material,x,y,z,w,h,d,rot=0,color){addBatch(unit,material,[x,y,z],[w,h,d],rot,color);}
  function mergePart(geometry,material,cast=true){geometry.computeBoundingBox();const c=geometry.boundingBox.getCenter(new THREE.Vector3());const key=material.uuid+':'+cast+':'+Math.floor(c.x/chunkSize)+':'+Math.floor(c.z/chunkSize);let b=merged.get(key);if(!b){b={material,parts:[],cast};merged.set(key,b);}b.parts.push(geometry);}
  function compactStaticGroup(target){
    const bins=new Map(),originals=new Set();
    for(const child of [...target.children]){
      if(!child.isMesh||child.isInstancedMesh||Array.isArray(child.material))continue;
      child.updateMatrix();const key=child.material.uuid+':'+child.castShadow;
      let bin=bins.get(key);if(!bin){bin={material:child.material,cast:child.castShadow,parts:[]};bins.set(key,bin);}
      bin.parts.push(child.geometry.clone().applyMatrix4(child.matrix));originals.add(child.geometry);target.remove(child);
    }
    for(const bin of bins.values()){
      const mesh=new THREE.Mesh(mergeGeometry(bin.parts),bin.material);mesh.name=target.name+' / merged static material';
      mesh.castShadow=bin.cast;mesh.receiveShadow=true;target.add(mesh);
      for(const geometry of bin.parts)geometry.dispose();
    }
    for(const geometry of originals)geometry.dispose();
  }

  function flush({white,roadPaint,yellow,poolMat}) {
    for(const b of merged.values()){if(!b.parts.length)continue;const mesh=new THREE.Mesh(mergeGeometry(b.parts),b.material);mesh.name='Mapped city geometry';mesh.castShadow=b.cast;mesh.receiveShadow=true;group.add(mesh);}
    for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.items.length);mesh.name=b.geometry===paintGeometry?'City paint decals':'City detail batch';for(let i=0;i<b.items.length;i++){const item=b.items[i];tmp.position.fromArray(item.position);tmp.scale.fromArray(item.scale);tmp.rotation.set(0,item.rotation,0);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix);if(item.color!==undefined)mesh.setColorAt(i,new THREE.Color(item.color));}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=b.material!==white&&b.material!==roadPaint&&b.material!==yellow&&b.material!==poolMat;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
  }
  return {addBatch,addBox,mergePart,compactStaticGroup,flush};
}
