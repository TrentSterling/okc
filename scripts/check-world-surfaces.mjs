#!/usr/bin/env node
// Offline geometry gate for the constructed production world; no browser/GPU.
// If copied to scripts/, the project root is inferred. Otherwise pass it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleURL=name=>pathToFileURL(path.join(root,'dist',name)).href;
const THREE=await import(moduleURL('vendor/three.module.js'));
const {WORLD_SURFACES}=await import(moduleURL('world-surfaces.js'));
const {CITY_DATA}=await import(moduleURL('city-data.js'));
// Texture drawing does not affect geometry. Supply only the 2D operations the
// generator calls, while retaining real Three materials, geometry and meshes.
const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:1})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};
let code=fs.readFileSync(path.join(root,'dist/world.js'),'utf8');
for(const [from,to] of [["'three'",'vendor/three.module.js'],["'./city-data.js'",'city-data.js'],["'./world-surfaces.js'",'world-surfaces.js']])code=code.replace('from '+from,'from '+JSON.stringify(moduleURL(to)));
const {createWorld}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const world=createWorld({scene:new THREE.Scene(),glassMaterial:new THREE.MeshPhysicalMaterial()});
// Regression gate: depthWrite:false paint left in the opaque queue can be
// erased by a later road draw. Inspect constructed batches, not source strings.
// Three renders the transparent queue after the complete opaque queue.
const paintBatches=world.group.children.filter(mesh=>mesh.isInstancedMesh&&mesh.name==='City paint decals');
assert.equal(paintBatches.length,2,'Both white and yellow paint batches must exist');
for(const mesh of paintBatches){
 const m=mesh.material;
 assert.ok(mesh.count>0,`Empty ${m.name} batch`);
 assert.equal(m.transparent,true,`${m.name} must render in the pass after opaque roads`);
 assert.equal(m.opacity,1,`${m.name} must remain fully visible`);
 assert.equal(m.depthTest,true,`${m.name} must remain occluded by cars and buildings`);
 assert.equal(m.depthWrite,false,`${m.name} must not create an opaque depth layer`);
 assert.equal(m.blending,THREE.NormalBlending,`${m.name} must use normal surface blending`);
 assert.ok(!m.transmission,`${m.name} must not enter the transmission pass`);
 assert.ok(m.polygonOffset&&m.polygonOffsetFactor<0&&m.polygonOffsetUnits<0,`${m.name} must keep its small surface bias`);
 assert.equal(mesh.castShadow,false,`${m.name} must not cast decal shadows`);
}
const paintPass={batches:paintBatches.length,instances:paintBatches.reduce((sum,m)=>sum+m.count,0),queue:'transparent',opacity:1,depthTest:true,depthWrite:false};

function ringArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return Math.abs(s)*.5;}
function prepareRing(r){return{r,minX:Math.min(...r.map(p=>p[0])),maxX:Math.max(...r.map(p=>p[0])),minZ:Math.min(...r.map(p=>p[1])),maxZ:Math.max(...r.map(p=>p[1]))};}
function classify(x,z,ring,tolerance){
 if(x<ring.minX-tolerance||x>ring.maxX+tolerance||z<ring.minZ-tolerance||z>ring.maxZ+tolerance)return -1;
 const r=ring.r;let inside=false;
 for(let i=0,j=r.length-1;i<r.length;j=i++){
  const a=r[j],b=r[i],dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
  const t=length2?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length2)):0;
  if((x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2<=tolerance*tolerance)return 0;
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside?1:-1;
}
function covered(x,z,polygons,tolerance=.0003){
 for(const p of polygons){if(classify(x,z,p.outer,tolerance)<0)continue;let inHole=false;for(const h of p.holes)if(classify(x,z,h,tolerance)>0){inHole=true;break;}if(!inHole)return true;}
 return false;
}
const heights=new Map();
for(const l of WORLD_SURFACES.layers){
 if(!heights.has(l.y))heights.set(l.y,{y:l.y,kinds:[],polygons:[],area:0,expected:0,triangles:0,holesFilled:0,downwardVisible:0});
 const group=heights.get(l.y);group.kinds.push(l.kind);
 for(const p of l.polygons){group.expected+=ringArea(p.outer)-p.holes.reduce((s,h)=>s+ringArea(h),0);group.polygons.push({outer:prepareRing(p.outer),holes:p.holes.map(prepareRing)});}
}
const ground=[...heights.values()];let invalidVertices=0,zeroAreaTriangles=0,roadUvCollapsed=0,roadUvTriangles=0;
for(const mesh of world.group.children){
 if(!mesh.isMesh||mesh.isInstancedMesh||mesh.name!=='Mapped city geometry')continue;
 const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=mesh.geometry.attributes.uv;
 for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+n.getX(i)+n.getY(i)+n.getZ(i)))invalidVertices++;
 for(let i=0;i<p.count;i+=3){
  const layer=ground.find(l=>[0,1,2].every(k=>Math.abs(p.getY(i+k)-l.y)<1e-6));if(!layer)continue;
  const x=p.getX(i),z=p.getZ(i),cross=(p.getZ(i+1)-z)*(p.getX(i+2)-x)-(p.getX(i+1)-x)*(p.getZ(i+2)-z);
  layer.area+=Math.abs(cross)*.5;layer.triangles++;
  if(Math.abs(cross)<=1e-9)zeroAreaTriangles++;
  if(layer.kinds.includes('road')){
   roadUvTriangles++;
   const ux=uv.getX(i+1)-uv.getX(i),uy=uv.getY(i+1)-uv.getY(i),vx=uv.getX(i+2)-uv.getX(i),vy=uv.getY(i+2)-uv.getY(i);
   if(Math.abs(cross)>2e-7&&Math.abs(ux*vy-uy*vx)<1e-12)roadUvCollapsed++;
  }
  // Submillimeter Float32 slivers may change winding; reject visible faces.
  const longestEdge=Math.max(Math.hypot(p.getX(i+1)-x,p.getZ(i+1)-z),Math.hypot(p.getX(i+2)-x,p.getZ(i+2)-z),Math.hypot(p.getX(i+2)-p.getX(i+1),p.getZ(i+2)-p.getZ(i+1)));
  if(cross<0&&Math.abs(cross)/longestEdge>.0005)layer.downwardVisible++;
  if(!covered((x+p.getX(i+1)+p.getX(i+2))/3,(z+p.getZ(i+1)+p.getZ(i+2))/3,layer.polygons))layer.holesFilled++;
 }
}
const road=ground.find(l=>l.kinds.includes('road'));let routeSamples=0,routeMisses=0;
for(let i=0;i<CITY_DATA.route.length-1;i++)for(const t of [0,.25,.5,.75,1])for(const offset of [-8,-7,-3.5,0,3.5,7,8]){
 const s=(i+t)/(CITY_DATA.route.length-1),p=world.getRoutePoint(s,offset-world.laneBase);
 if(Math.abs(p.y-road.y)>1e-6||!covered(p.x,p.z,road.polygons,.001))routeMisses++;routeSamples++;
}
const results={paintPass,invalidVertices,zeroAreaTriangles,roadUvTriangles,roadUvCollapsed,routeSamples,routeMisses,layers:ground.map(({polygons,...g})=>({...g,areaDifference:g.area-g.expected}))};
console.log(JSON.stringify(results,null,2));
assert.equal(invalidVertices,0,'Production geometry contains invalid vertices or normals');
assert.equal(zeroAreaTriangles,0,'Production ground geometry contains zero-area triangles');
assert.ok(roadUvTriangles>0,'No road triangle UVs were checked');
assert.equal(roadUvCollapsed,0,'Road texture coordinates collapse across nonzero-area triangles');
assert.equal(routeMisses,0,'A route lane sample leaves the compiled road');
for(const layer of ground){assert.ok(layer.triangles>0,`Missing ${layer.kinds} surface`);assert.equal(layer.holesFilled,0,`Production ${layer.kinds} triangulation fills an excluded region`);assert.equal(layer.downwardVisible,0,`Visible ${layer.kinds} triangles face down`);assert.ok(Math.abs(layer.area-layer.expected)<=Math.max(.025,layer.expected*2e-6),`Production ${layer.kinds} area differs from its polygon area`);}
