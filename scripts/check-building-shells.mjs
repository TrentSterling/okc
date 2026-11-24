#!/usr/bin/env node
// Check the finished production buffers, including actual facade holes.
// This is geometry validation, not a GPU image or performance claim.
import assert from 'node:assert/strict';
import {BAKED_WORLD as baked} from '../dist/world-meshes.js';
import {WORLD_SURFACES as source} from '../dist/world-surfaces.js';
const CELL=64,volumeGrid=new Map(),faceGrid=new Map();
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0))*.5;
function inside(x,z,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const inPolygon=(x,z,p)=>inside(x,z,p.outer)&&!p.holes.some(r=>inside(x,z,r));
const cross=(a,b,c)=>{const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
function visitCells(minX,maxX,minZ,maxZ,fn){for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let z=Math.floor(minZ/CELL);z<=Math.floor(maxZ/CELL);z++)fn(`${x}:${z}`);}
function addVolume(p,top,bottom=0){
 const xs=p.outer.map(p=>p[0]),zs=p.outer.map(p=>p[1]),v={p,top,bottom};
 visitCells(Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs),key=>{if(!volumeGrid.has(key))volumeGrid.set(key,[]);volumeGrid.get(key).push(v);});
}
for(const s of source.buildingShells){
 const well=s.roofAssembly;
 // A recessed deck removes the upper .42 m of its own building solid.
 // Keeping the old full prism here would incorrectly call a real roof well
 // hidden. Coping remains solid to the original mapped outer height.
 for(const p of s.footprint)addVolume(p,well?well.deckY:s.height);
 if(well)for(const p of well.coping)addVolume(p,s.height,well.deckY);
}
for(const s of source.customLandmarkFootprints)for(const p of s.polygons)addVolume(p,s.height,s.bottom||0);
const stats={chunks:baked.chunks.length,triangles:0,vertices:0,facadeTriangles:0,roofArea:0,expectedRoofArea:0,copingTriangles:0,recessedDecks:0,hiddenFacadeTriangles:0,hiddenRoofTriangles:0,openings:0,blockedOpeningCenters:0,entrances:0,boxInstances:0};
const roofAreas=new Map(),expectedAreas=new Map();
for(const s of source.buildingShells){
 for(const p of s.roofs)stats.expectedRoofArea+=area(p.outer)-p.holes.reduce((n,h)=>n+area(h),0);
 const well=s.roofAssembly;
 const groups=well?[[well.deck,well.deckY],[well.coping,s.height]]:[[s.roofs,s.height]];
 if(well){stats.recessedDecks++;assert.equal(Number((s.height-well.deckY).toFixed(4)),.42);}
 for(const [polygons,height]of groups)for(const p of polygons){
  const a=area(p.outer)-p.holes.reduce((n,h)=>n+area(h),0);
  expectedAreas.set(height,(expectedAreas.get(height)||0)+a);
 }
}
const decode=(str,Type)=>{const b=Buffer.from(str,'base64');return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
for(const chunk of baked.chunks){
 const values=decode(chunk.v,Float32Array),indices=decode(chunk.i,chunk.indexType===32?Uint32Array:Uint16Array);
 assert.equal(values.length%8,0);assert.equal(indices.length%3,0);stats.vertices+=values.length/8;
 for(let i=0;i<values.length;i+=8){
  for(let k=0;k<8;k++)assert.ok(Number.isFinite(values[i+k]),'Nonfinite baked vertex');
  assert.ok(Math.abs(values[i])<=baked.chunkSize/2+.001&&Math.abs(values[i+2])<=baked.chunkSize/2+.001,'Chunk spans beyond its spatial cell');
  assert.ok(Math.abs(Math.hypot(values[i+3],values[i+4],values[i+5])-1)<.0001,'Nonunit baked normal');
 }
 for(let i=0;i<indices.length;i+=3){
  const ids=[indices[i],indices[i+1],indices[i+2]];assert.ok(ids.every(i=>i*8+7<values.length));
  const p=ids.map(i=>[values[i*8]+chunk.origin[0],values[i*8+1],values[i*8+2]+chunk.origin[2]]);
  const normal=[values[ids[0]*8+3],values[ids[0]*8+4],values[ids[0]*8+5]],cr=cross(...p),twice=Math.hypot(...cr);
  assert.ok(twice>1e-9,'Collapsed baked triangle');stats.triangles++;
  const center=[0,1,2].map(k=>(p[0][k]+p[1][k]+p[2][k])/3);
  const material=chunk.material,isFacade=material.startsWith('building.'),isRoof=material==='detail.roof'||material==='detail.coping';
  if(isFacade){
   stats.facadeTriangles++;
   const face={p,normal};
   visitCells(Math.min(...p.map(p=>p[0]))-.01,Math.max(...p.map(p=>p[0]))+.01,Math.min(...p.map(p=>p[2]))-.01,Math.max(...p.map(p=>p[2]))+.01,key=>{if(!faceGrid.has(key))faceGrid.set(key,[]);faceGrid.get(key).push(face);});
  }
  if(isRoof){
   assert.ok(normal[1]>.999,'Roof decks and coping must face upward');
   if(material==='detail.coping')stats.copingTriangles++;
   const a=Math.abs(cr[1])/2;stats.roofArea+=a;const y=Number(center[1].toFixed(4));roofAreas.set(y,(roofAreas.get(y)||0)+a);
  }
  if(isFacade||isRoof){
   const outside=center.map((v,k)=>v+normal[k]*.004),key=`${Math.floor(outside[0]/CELL)}:${Math.floor(outside[2]/CELL)}`;
   const hidden=(volumeGrid.get(key)||[]).some(v=>outside[1]>v.bottom+.001&&outside[1]<v.top-.001&&inPolygon(outside[0],outside[2],v.p));
   if(hidden){if(isFacade)stats.hiddenFacadeTriangles++;else stats.hiddenRoofTriangles++;}
  }
 }
}
function onTriangle(point,face){
 const a=face.p[0],b=face.p[1],c=face.p[2],n=face.normal;
 if(Math.abs((point[0]-a[0])*n[0]+(point[1]-a[1])*n[1]+(point[2]-a[2])*n[2])>.001)return false;
 const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),w=point.map((v,i)=>v-a[i]);
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),wu=dot(w,u),wv=dot(w,v),den=uu*vv-uv*uv;
 if(den<=1e-12)return false;
 const s=(wu*vv-wv*uv)/den,t=(wv*uu-wu*uv)/den;
 return s>=-1e-7&&t>=-1e-7&&s+t<=1+1e-7;
}
for(const shell of source.buildingShells)for(const w of shell.walls)for(const o of w.openings){
 const len=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),at=(o.start+o.end)/2;
 const point=[w.a[0]+(w.b[0]-w.a[0])*at/len,(o.bottom+o.top)/2,w.a[1]+(w.b[1]-w.a[1])*at/len];
 const key=`${Math.floor(point[0]/CELL)}:${Math.floor(point[2]/CELL)}`;
 if((faceGrid.get(key)||[]).some(f=>onTriangle(point,f)))stats.blockedOpeningCenters++;
 stats.openings++;if(o.kind==='door'){stats.entrances++;assert.ok(o.end-o.start>=1.1&&o.end-o.start<=1.6);assert.ok(o.top-o.bottom>=2.1&&o.top-o.bottom<2.6);}
 assert.ok(o.depth>=.2,'Opening must have a physical recess');
}
for(const chunk of baked.instances){const m=decode(chunk.m,Float32Array);assert.equal(m.length%16,0);assert.ok([...m].every(Number.isFinite));stats.boxInstances+=m.length/16;}
assert.equal(stats.triangles,baked.stats.triangles);
assert.equal(stats.vertices,baked.stats.vertices);
assert.equal(stats.boxInstances,baked.stats.boxInstances);
assert.equal(stats.openings,baked.stats.openings);
assert.equal(stats.entrances,baked.stats.entrances);
assert.equal(stats.hiddenFacadeTriangles,0,'An exterior facade triangle points into another building');
assert.equal(stats.hiddenRoofTriangles,0,'A visible roof triangle is inside a higher volume');
assert.equal(stats.blockedOpeningCenters,0,'A door/window is still covered by a closed facade');
assert.ok(Math.abs(stats.roofArea-stats.expectedRoofArea)<=Math.max(.05,stats.expectedRoofArea*2e-6),'Baked roof coverage differs from the height-envelope polygons');
assert.equal(roofAreas.size,expectedAreas.size,'Missing or extra roof deck elevation');
for(const[y,expected]of expectedAreas)assert.ok(Math.abs((roofAreas.get(y)||0)-expected)<=Math.max(.05,expected*2e-6),`Roof coverage at ${y} m differs from the physical deck/coping partition`);
assert.ok(stats.entrances>500,'Mapped city must retain its street-facing entrances');
assert.ok(source.drivingSolids.length>500&&source.drivingBounds.minX<0&&source.drivingBounds.maxX>0);
console.log(JSON.stringify({...stats,roofAreaDifference:stats.roofArea-stats.expectedRoofArea,scope:'Finished baked buffers, ownership, real facade holes, chunks, collision data; no GPU rendering claim.'},null,2));
