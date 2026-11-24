#!/usr/bin/env node
// Offline production mesh bake. The browser decodes finished typed buffers;
// it never triangulates the map, cuts a door, or resolves building overlap.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../public/vendor/three.module.js';
import { skylineFacadeProfile } from '../src/world/skyline-profiles.js';
import { bakeStreetDetails } from './bake-street-details.mjs';
import { bakeFacadeBand,bakeSimpleFrame,bakeRoofAssembly,bakeLandmarkFins } from './bake-facade-details.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT=path.resolve(process.env.OKC_BUILD_OUTPUT||path.join(ROOT,'dist'));
const {WORLD_SURFACES}=await import(pathToFileURL(path.join(OUTPUT,'world-surfaces.js')).href);
const {CITY_DATA}=await import(pathToFileURL(path.join(OUTPUT,'city-data.js')).href);
const CELL=Number(process.argv.find(v=>v.startsWith('--cell='))?.split('=')[1]||1024), chunks=new Map(), instanceChunks=new Map();
const groundUvScale=Object.fromEntries(WORLD_SURFACES.layers.map(l=>['ground.'+l.kind,l.uvScale]));
const stats={sourceTriangles:0,triangles:0,vertices:0,chunks:0,instanceChunks:0,boxInstances:0,openings:0,entrances:0,rooftopUnits:0};
const cross=(a,b,c)=>{
  const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  return [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
};
function clip(poly,axis,value,greater){
  const output=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const insideA=greater?a[axis]>=value:a[axis]<=value,insideB=greater?b[axis]>=value:b[axis]<=value;
    if(insideA)output.push(a);
    if(insideA!==insideB){const t=(value-a[axis])/(b[axis]-a[axis]);output.push(a.map((v,k)=>v+(b[k]-v)*t));}
  }
  return output;
}
function triangle(a,b,c,material,cast){
  if(Math.hypot(...cross(a,b,c))<1e-9)return;
  stats.sourceTriangles++;
  const minX=Math.floor(Math.min(a[0],b[0],c[0])/CELL),maxX=Math.floor((Math.max(a[0],b[0],c[0])-1e-8)/CELL);
  const minZ=Math.floor(Math.min(a[2],b[2],c[2])/CELL),maxZ=Math.floor((Math.max(a[2],b[2],c[2])-1e-8)/CELL);
  for(let ix=minX;ix<=Math.max(minX,maxX);ix++)for(let iz=minZ;iz<=Math.max(minZ,maxZ);iz++){
    let poly=[a,b,c];
    for(const [axis,v,greater] of [[0,ix*CELL,true],[0,(ix+1)*CELL,false],[2,iz*CELL,true],[2,(iz+1)*CELL,false]]){
      poly=clip(poly,axis,v,greater);if(poly.length<3)break;
    }
    if(poly.length<3)continue;
    const key=`${ix}:${iz}:${material}:${cast?1:0}`;
    let chunk=chunks.get(key);
    if(!chunk){chunk={key,origin:[(ix+.5)*CELL,0,(iz+.5)*CELL],material,cast,values:[],indices:[],lookup:new Map()};chunks.set(key,chunk);}
    function vertex(v){
      const value=v.slice();value[0]-=chunk.origin[0];value[2]-=chunk.origin[2];
      const floats=value.map(x=>Math.fround(x));
      if(groundUvScale[material]&&Math.abs(floats[4])>.5){
        // Keep repeating UVs close to zero in each chunk. Integer period
        // shifts preserve continuity while avoiding Float32 collapse where
        // a clipped road triangle is only micrometers wide at a cell edge.
        const scale=groundUvScale[material];
        floats[6]=Math.fround((floats[0]+chunk.origin[0])/scale-Math.floor(chunk.origin[0]/scale));
        floats[7]=Math.fround((floats[2]+chunk.origin[2])/scale-Math.floor(chunk.origin[2]/scale));
      }
      const identity=floats.join(',');
      if(chunk.lookup.has(identity))return chunk.lookup.get(identity);
      const index=chunk.values.length/8;chunk.values.push(...floats);chunk.lookup.set(identity,index);return index;
    }
    for(let i=1;i<poly.length-1;i++){
      if(Math.hypot(...cross(poly[0],poly[i],poly[i+1]))<1e-8)continue;
      const ids=[vertex(poly[0]),vertex(poly[i]),vertex(poly[i+1])];
      const values=ids.map(id=>chunk.values.slice(id*8,id*8+3));
      // Float32 conversion can collapse submillimeter GIS slivers.
      if(Math.hypot(...cross(...values))<1e-8)continue;
      chunk.indices.push(...ids);stats.triangles++;
    }
  }
}
function geometry(g,material,cast,uvMode){
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,index=g.index;
  const count=index?index.count:p.count;
  for(let k=0;k<count;k+=3){
    const vertices=[];
    for(let j=0;j<3;j++){
      const i=index?index.getX(k+j):k+j;
      let u=uv?uv.getX(i):0,v=uv?uv.getY(i):0;
      if(uvMode){u=p.getX(i)/uvMode;v=p.getZ(i)/uvMode;}
      vertices.push([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),u,v]);
    }
    triangle(...vertices,material,cast);
  }
  g.dispose();
}
function polygon(p,y,material,cast=false,scale=18){
  const points=ring=>ring.map(q=>new THREE.Vector2(q[0],-q[1]));
  const shape=new THREE.Shape(points(p.outer));
  for(const h of p.holes||[])shape.holes.push(new THREE.Path(points(h)));
  const g=new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,y,0);
  geometry(g,material,cast,scale);
}
function quad(corners,normal,material,uvs,cast=true){
  const points=corners.map((p,i)=>[...p,...normal,...(uvs?.[i]||[p[0]*.2,p[1]*.2])]);
  let ids=[0,1,2,0,2,3];
  const cr=cross(...corners.slice(0,3));
  if(cr[0]*normal[0]+cr[1]*normal[1]+cr[2]*normal[2]<0)ids=[0,2,1,0,3,2];
  for(let i=0;i<6;i+=3)triangle(points[ids[i]],points[ids[i+1]],points[ids[i+2]],material,cast);
}
function wallPoint(w,at,y,out=0){
  const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],len=Math.hypot(dx,dz);
  return [w.a[0]+dx*at/len+dz*out/len,y,w.a[1]+dz*at/len-dx*out/len];
}
function wallBox(w,start,end,bottom,top,front,depth,material){
  const p=wallPoint(w,(start+end)/2,(bottom+top)/2,front-depth/2);
  const theta=-Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);
  instanceBox(p,[end-start,top-bottom,depth],theta,material);
}
function instanceBox(position,scale,angle,material){
  const ix=Math.floor(position[0]/CELL),iz=Math.floor(position[2]/CELL),key=`${ix}:${iz}:${material}`;
  let chunk=instanceChunks.get(key);
  if(!chunk){chunk={key,origin:[(ix+.5)*CELL,0,(iz+.5)*CELL],material,matrices:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};instanceChunks.set(key,chunk);}
  const p=position.map((v,k)=>v-chunk.origin[k]);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),new THREE.Vector3(...scale));
  chunk.matrices.push(...matrix.elements);stats.boxInstances++;
  const extents=[(Math.abs(Math.cos(angle))*scale[0]+Math.abs(Math.sin(angle))*scale[2])/2,scale[1]/2,(Math.abs(Math.sin(angle))*scale[0]+Math.abs(Math.cos(angle))*scale[2])/2];
  for(let k=0;k<3;k++){chunk.min[k]=Math.min(chunk.min[k],p[k]-extents[k]);chunk.max[k]=Math.max(chunk.max[k],p[k]+extents[k]);}
}
function facadeMaterial(s){
  const profile=skylineFacadeProfile(CITY_DATA.buildings[s.sourceIndex]);
  if(profile)return profile.material;
  if(['glass','parking','banded','deco'].includes(s.kind))return 'building.'+s.kind;
  return 'building.'+(['lowrise','retail'].includes(s.kind)?'lowrise.':'masonry.')+(Math.abs(s.id)%4);
}
for(const layer of WORLD_SURFACES.layers)for(const p of layer.polygons)polygon(p,layer.y,'ground.'+layer.kind,false,layer.uvScale);
bakeStreetDetails(WORLD_SURFACES,{quad,triangle},stats);
for(const shell of WORLD_SURFACES.buildingShells){
  const material=facadeMaterial(shell),lowrise=['lowrise','retail'].includes(shell.kind);
  const profile=skylineFacadeProfile(CITY_DATA.buildings[shell.sourceIndex]);
  const uScale=profile?.width||(lowrise?3:14.4),vScale=profile?.height||(lowrise?2.4:49);
  for(const wall of shell.walls){
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    if(length<.002)continue;
    const nx=(wall.b[1]-wall.a[1])/length,nz=-(wall.b[0]-wall.a[0])/length,normal=[nx,0,nz];
    const xs=[...new Set([0,length,...wall.openings.flatMap(o=>[o.start,o.end])])].sort((a,b)=>a-b);
    const ys=[...new Set([wall.base,wall.top,...wall.openings.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b);
    for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){
      const a=xs[x],b=xs[x+1],lo=ys[y],hi=ys[y+1],mx=(a+b)/2,my=(lo+hi)/2;
      if(wall.openings.some(o=>mx>o.start&&mx<o.end&&my>o.bottom&&my<o.top))continue;
      quad([wallPoint(wall,a,lo),wallPoint(wall,b,lo),wallPoint(wall,b,hi),wallPoint(wall,a,hi)],normal,material,
           [[(wall.u+a)/uScale,lo/vScale],[(wall.u+b)/uScale,lo/vScale],[(wall.u+b)/uScale,hi/vScale],[(wall.u+a)/uScale,hi/vScale]]);
    }
    for(const o of wall.openings){
      stats.openings++;if(o.kind==='door')stats.entrances++;
      const {start:a,end:b,bottom:lo,top:hi,depth}=o;
      const tangent=[(wall.b[0]-wall.a[0])/length,0,(wall.b[1]-wall.a[1])/length];
      // Actual wall holes, side/top/bottom reveals and an inset glazing plane.
      // No exterior wall remains behind the opening.
      quad([wallPoint(wall,a,lo),wallPoint(wall,a,hi),wallPoint(wall,a,hi,-depth),wallPoint(wall,a,lo,-depth)],tangent,'detail.concrete');
      quad([wallPoint(wall,b,lo),wallPoint(wall,b,hi),wallPoint(wall,b,hi,-depth),wallPoint(wall,b,lo,-depth)],tangent.map(v=>-v),'detail.concrete');
      quad([wallPoint(wall,a,hi),wallPoint(wall,b,hi),wallPoint(wall,b,hi,-depth),wallPoint(wall,a,hi,-depth)],[0,-1,0],'detail.concrete');
      // The sill/threshold below is the only bottom surface. The old bottom
      // reveal and sill top shared exactly this plane with different UVs.
      quad([wallPoint(wall,a,lo,-depth),wallPoint(wall,b,lo,-depth),wallPoint(wall,b,hi,-depth),wallPoint(wall,a,hi,-depth)],normal,'detail.glass',[[0,0],[1,0],[1,1],[0,1]]);
      if(o.framing==='simple'){
        bakeSimpleFrame(wall,o,{wallPoint,quad});
        wallBox(wall,a-.035,b+.035,lo-.055,lo,.12,depth+.14,'detail.concrete');
        continue;
      }
      const trim=.07;
      wallBox(wall,a,a+trim,lo,hi,.035,.12,'detail.darkSteel');
      wallBox(wall,b-trim,b,lo,hi,.035,.12,'detail.darkSteel');
      wallBox(wall,a+trim,b-trim,hi-trim,hi,.035,.12,'detail.darkSteel');
      wallBox(wall,a+trim,b-trim,lo,lo+trim,.035,.12,'detail.darkSteel');
      if(o.kind==='door'){
        // A handle and transom make the scale legible without a painted icon.
        const handle=b-.22;
        wallBox(wall,handle-.025,handle+.025,1.02,1.45,-depth+.08,.055,'detail.steel');
        wallBox(wall,a+trim,b-trim,hi-.43,hi-.37,-depth+.025,.055,'detail.darkSteel');
        wallBox(wall,a-.035,b+.035,lo-.045,lo,.12,depth+.14,'detail.concrete');
      }else{
        wallBox(wall,(a+b)/2-.025,(a+b)/2+.025,lo+trim,hi-trim,-depth+.025,.055,'detail.darkSteel');
        wallBox(wall,a-.045,b+.045,lo-.075,lo,.12,depth+.14,'detail.concrete');
      }
    }
    // Cornice only follows a genuinely exposed wall. It cannot trace the
    // hidden parent footprint across the face of a neighboring tower.
    if(length>1.0&&wall.top>3&&!shell.roofAssembly){
      wallBox(wall,.11,length-.11,wall.top-.22,wall.top+.06,.11,.20,
              shell.kind==='glass'?'detail.steel':'detail.concrete');
    }
    for(const band of wall.detailBands||[])bakeFacadeBand(wall,band,{wallPoint,quad});
    bakeLandmarkFins(wall,profile,{wallPoint,quad});
  }
  bakeRoofAssembly(shell,{polygon,quad,wallPoint});
  for(const unit of shell.rooftop){
    instanceBox([unit.x,unit.y+unit.h/2,unit.z],[unit.w,unit.h,unit.d],0,'detail.roof');
    instanceBox([unit.x,unit.y+unit.h+.06,unit.z],[unit.w*.86,.12,unit.d*.86],0,'detail.steel');
    stats.rooftopUnits++;
  }
}
const output=[];
for(const chunk of [...chunks.values()].sort((a,b)=>a.key.localeCompare(b.key))){
  if(!chunk.indices.length)continue;
  const vertices=new Float32Array(chunk.values),Index=vertices.length/8>65535?Uint32Array:Uint16Array,index=new Index(chunk.indices);
  stats.vertices+=vertices.length/8;
  output.push({key:chunk.key,origin:chunk.origin,material:chunk.material,cast:chunk.cast,indexType:Index===Uint32Array?32:16,
               v:Buffer.from(vertices.buffer).toString('base64'),i:Buffer.from(index.buffer).toString('base64')});
}
stats.chunks=output.length;
const instances=[...instanceChunks.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(c=>({key:c.key,origin:c.origin,material:c.material,
  min:c.min,max:c.max,m:Buffer.from(new Float32Array(c.matrices).buffer).toString('base64')}));
stats.instanceChunks=instances.length;
assert.equal(stats.openings,WORLD_SURFACES.buildingShells.reduce((n,s)=>n+s.walls.reduce((n,w)=>n+w.openings.length,0),0));
const payload={version:1,chunkSize:CELL,worldSurfacesSha256:createHash('sha256').update(fs.readFileSync(path.join(OUTPUT,'world-surfaces.js'))).digest('hex'),stats,chunks:output,instances};
const text='// Generated offline by scripts/bake-world-geometry.mjs. Do not hand-edit.\nexport const BAKED_WORLD='+JSON.stringify(payload)+';\n';
const target=path.join(OUTPUT,'world-meshes.js');
if(process.argv.includes('--check')){
  const actual=createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  const expected=createHash('sha256').update(text).digest('hex');
  assert.equal(actual,expected,'Baked world meshes are stale; run npm run build');
}
else{
  fs.writeFileSync(target,text);
  fs.writeFileSync(path.join(OUTPUT,'geo/world-mesh-audit.json'),JSON.stringify({...stats,chunkSize:CELL,bytes:Buffer.byteLength(text),worldSurfacesSha256:payload.worldSurfacesSha256},null,2)+'\n');
}
console.log(JSON.stringify({...stats,bytes:Buffer.byteLength(text),chunkSize:CELL},null,2));
