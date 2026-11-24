#!/usr/bin/env node
// Geometry regression check; no browser, GPU, canvas, npm install or network.
// Tests the constructed production meshes rather than copying their generator.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {registerThree} from './lib/register-three.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerThree(root);
const threeURL=pathToFileURL(path.join(root,'dist/vendor/three.module.js')).href;
const THREE=await import(threeURL);
const {createDevon,createLegends,DEVON_DIMENSIONS}=await import(pathToFileURL(path.join(root,'dist/tower.js')).href);
const devon=createDevon(),legends=createLegends();
const planes=[],matrix=new THREE.Matrix4(),point=new THREE.Vector3();
let meshCount=0,badValues=0,duplicateInstances=0,removedWallArea=0;
const campusNames=/^(Mapped shaft|Mapped five-story|Mapped six-story|Mapped Devon auditorium)/;
function area(p){let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a*.5;}
function intersection(subject,clip){
  let result=subject.map(p=>p.slice());const direction=Math.sign(area(clip));
  for(let i=0;i<clip.length&&result.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length];
    const signed=p=>direction*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
    const previous=result;result=[];
    for(let j=0;j<previous.length;j++){
      const p=previous[j],q=previous[(j+1)%previous.length],dp=signed(p),dq=signed(q),insideP=dp>=-1e-8,insideQ=dq>=-1e-8;
      if(insideP)result.push(p);
      if(insideP!==insideQ){const t=dp/(dp-dq);result.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
  }
  return result.length<3?0:Math.abs(area(result));
}
for(const {group} of [devon,legends]){
  group.updateMatrixWorld(true);
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;meshCount++;
    const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i))||n&&Math.hypot(n.getX(i),n.getY(i),n.getZ(i))<.99)badValues++;
    removedWallArea+=mesh.userData.sharedWallAreaRemoved||0;
    if(mesh.isInstancedMesh){
      const seen=new Set();
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const key=matrix.elements.map(v=>Math.round(v*1e5)).join(',');if(seen.has(key))duplicateInstances++;seen.add(key);}
      return;
    }
    if(!campusNames.test(mesh.name))return;
    for(let i=0;i<p.count;i+=3){
      const v=[0,1,2].map(j=>point.fromBufferAttribute(p,i+j).applyMatrix4(mesh.matrixWorld).clone());
      const normal=new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]),v[2].clone().sub(v[0]));
      if(normal.length()<1e-7)continue;normal.normalize();if(Math.abs(normal.y)>1e-4)continue;
      const values=normal.toArray(),axis=values.map(Math.abs).indexOf(Math.max(...values.map(Math.abs)));
      if(values[axis]<0)normal.negate();const d=normal.dot(v[0]);
      let plane=planes.find(g=>g.normal.distanceTo(normal)<2e-5&&Math.abs(g.d-d)<.003);
      if(!plane){plane={normal,d,axis,faces:[]};planes.push(plane);}
      plane.faces.push({mesh:mesh.id,name:mesh.name,p:v.map(v=>v.toArray().filter((_,i)=>i!==plane.axis))});
    }
  });
}
let overlapArea=0;const interfaces=new Set();
planes.forEach((plane,index)=>{
  for(let i=0;i<plane.faces.length;i++)for(let j=i+1;j<plane.faces.length;j++){
    const a=plane.faces[i],b=plane.faces[j];
    const shared=intersection(a.p,b.p)/Math.abs(plane.normal.toArray()[plane.axis]);
    if(shared>.001){overlapArea+=shared;interfaces.add(`${index}:${Math.min(a.mesh,b.mesh)}:${Math.max(a.mesh,b.mesh)}`);}
  }
});
assert.equal(badValues,0,'Nonfinite vertices or invalid normals');
assert.equal(duplicateInstances,0,'Identical beam instances');
assert.ok(overlapArea<.001,`Coplanar campus wall overlap: ${overlapArea.toFixed(6)} m²`);
// Regression cases for the aerial hole and mismatched rotunda rings. These
// cast against production meshes and validate their actual triangulation.
function insideRing([x,z],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function boundaryDistance([x,z],ring){
  let distance=Infinity;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  }
  return distance;
}
const bounds=new THREE.Box3().setFromObject(devon.group,true);
assert.ok(bounds.max.y>=257.19&&bounds.max.y<=257.45,`Devon crown height ${bounds.max.y}`);
assert.equal(DEVON_DIMENSIONS.architecturalHeight,257.2);
const roofMesh=devon.group.getObjectByName('Closed mechanical roof at base of projecting crown');
assert.ok(roofMesh,'Mechanical roof is missing');
const roofRing=roofMesh.userData.roofOutline;
const roofPositions=(roofMesh.geometry.index?roofMesh.geometry.toNonIndexed():roofMesh.geometry).attributes.position;
let roofTriangleArea=0;
for(let i=0;i<roofPositions.count;i+=3){
  const a=new THREE.Vector3().fromBufferAttribute(roofPositions,i),b=new THREE.Vector3().fromBufferAttribute(roofPositions,i+1),c=new THREE.Vector3().fromBufferAttribute(roofPositions,i+2);
  roofTriangleArea+=new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).length()*.5;
}
const expectedRoofArea=Math.abs(area(roofRing));
assert.ok(Math.abs(roofTriangleArea-expectedRoofArea)<.02,'Roof triangulation area does not match its enclosing section');
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
let roofRays=0,roofMisses=0;
for(let x=-32;x<=33;x+=.75)for(let z=-29;z<=33;z+=.75){
  if(!insideRing([x,z],roofRing)||boundaryDistance([x,z],roofRing)<.08)continue;
  roofRays++;ray.set(new THREE.Vector3(x,300,z),down);
  const hits=ray.intersectObject(roofMesh,false);
  if(!hits.length||Math.abs(hits[0].point.y-DEVON_DIMENSIONS.mechanicalRoof)>.002)roofMisses++;
}
assert.ok(roofRays>1000,'Insufficient roof coverage samples');assert.equal(roofMisses,0,'Aerial rays found holes in mechanical roof');
const lining=devon.group.getObjectByName('Opaque inner crown lining above mechanical roof');
assert.ok(lining&&!lining.material.transparent&&lining.material.depthWrite,'Crown interior must be opaque');
assert.ok(lining.geometry.attributes.position.count>=18,'Crown interior faces are missing');
const contract=JSON.parse(fs.readFileSync(path.join(root,'dist/geo/custom-landmark-volumes.json'),'utf8'));
const rotunda=contract.volumes.find(v=>v.id==='devon-rotunda');
let balconyVertices=0,escapedBalconyVertices=0,atriumHoleHits=0;
devon.group.traverse(mesh=>{
  if(mesh.name!=='Rotunda inset balcony slab')return;
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    balconyVertices++;
    const q=[p.getX(i),p.getZ(i)];
    if(!insideRing(q,rotunda.polygon.outer)&&boundaryDistance(q,rotunda.polygon.outer)>.002)escapedBalconyVertices++;
  }
  ray.set(new THREE.Vector3(-38.194,40,-23.399),down);
  atriumHoleHits+=ray.intersectObject(mesh,false).length;
});
assert.ok(balconyVertices>100,'Balcony slabs are absent');
assert.equal(escapedBalconyVertices,0,'Balcony vertices protrude through mapped rotunda envelope');
assert.equal(atriumHoleHits,0,'Balcony triangulation filled the central atrium opening');
const rotundaMesh=devon.group.getObjectByName('Mapped six-story glazed entrance rotunda');
const rotundaBounds=new THREE.Box3().setFromObject(rotundaMesh,true);
assert.ok(Math.abs(rotundaBounds.max.y-36.576)<.002,'Rotunda reference height drifted');
const bridge=contract.volumes.find(v=>v.id==='devon-auditorium-skybridge');
const bridgeFloor=devon.group.getObjectByName('Auditorium skybridge raised floor');
assert.ok(bridge.bottom>=5&&Math.abs(new THREE.Box3().setFromObject(bridgeFloor,true).min.y-bridge.bottom)<.002,'Skybridge must preserve ground clearance');
// The custom LED shader must support the renderer's logarithmic depth fallback.
assert.match(devon.screenMaterial.vertexShader,/#include <common>/);
assert.match(devon.screenMaterial.vertexShader,/#include <logdepthbuf_vertex>/);
assert.match(devon.screenMaterial.fragmentShader,/#include <logdepthbuf_fragment>/);
assert.equal(devon.screens.children.length,3);
for(const screen of devon.screens.children){assert.equal(screen.material.depthWrite,false);assert.ok(screen.userData.glassNormalOffset>=.08);}
devon.update(18,1,true);assert.equal(devon.screens.visible,true);devon.update(18,1,false);assert.equal(devon.screens.visible,false);
console.log(JSON.stringify({meshCount,campusOverlapInterfaces:interfaces.size,campusOverlapArea:overlapArea,removedSharedWallArea:removedWallArea,duplicateInstances,badValues,crownScreens:3,screenOffset:.08,architecturalHeight:DEVON_DIMENSIONS.architecturalHeight,roofArea:roofTriangleArea,roofRays,roofMisses,balconyVertices,escapedBalconyVertices,atriumHoleHits,skybridgeClearance:bridge.bottom},null,2));
