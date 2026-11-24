#!/usr/bin/env node
// Geometry regression check; no browser, GPU, canvas, npm install or network.
// Tests the constructed production meshes rather than copying their generator.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const threeURL=pathToFileURL(path.join(root,'dist/vendor/three.module.js')).href;
const THREE=await import(threeURL);
const code=fs.readFileSync(path.join(root,'dist/tower.js'),'utf8').replace("from 'three'",`from '${threeURL}'`);
const {createDevon,createLegends}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
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
assert.equal(devon.screens.children.length,3);
for(const screen of devon.screens.children){assert.equal(screen.material.depthWrite,false);assert.ok(screen.userData.glassNormalOffset>=.08);}
devon.update(18,1,true);assert.equal(devon.screens.visible,true);devon.update(18,1,false);assert.equal(devon.screens.visible,false);
console.log(JSON.stringify({meshCount,campusOverlapInterfaces:interfaces.size,campusOverlapArea:overlapArea,removedSharedWallArea:removedWallArea,duplicateInstances,badValues,crownScreens:3,screenOffset:.08},null,2));
