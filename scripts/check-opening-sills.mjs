#!/usr/bin/env node
// Measure actual baked upward coverage, including transformed box instances.
// A tiny area probe avoids double-counting the shared diagonal of two
// triangles: adjacent triangles sum to one cover, duplicate surfaces to two.
// Use --baseline-dir /absolute/path/to/dist to reproduce the v0.5 failure.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&['--baseline-dir','--dist'].includes(args[0])))throw Error('Usage: check-opening-sills.mjs [--baseline-dir /absolute/dist]');
const directory=args.length?path.resolve(args[1]):path.join(root,'dist');
const [{WORLD_SURFACES:source},{BAKED_WORLD:baked}]=await Promise.all([
  import(pathToFileURL(path.join(directory,'world-surfaces.js')).href),
  import(pathToFileURL(path.join(directory,'world-meshes.js')).href),
]);
const heights=[...new Set(source.buildingShells.flatMap(s=>s.walls.flatMap(w=>w.openings.map(o=>o.bottom))))];
const CELL=8,HALF=.001,HEIGHT_EPS=.0005,grid=new Map(),faces=[];
const decode=(value,Type)=>{const b=Buffer.from(value,'base64');return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
function cells(minX,maxX,minZ,maxZ,callback){
  for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let z=Math.floor(minZ/CELL);z<=Math.floor(maxZ/CELL);z++)callback(x,z);
}
function addFace(points,owner){
  const y=points[0][1];
  if(points.some(p=>Math.abs(p[1]-y)>HEIGHT_EPS))return;
  const matches=heights.filter(height=>Math.abs(height-y)<HEIGHT_EPS);
  if(!matches.length)return;
  const outline=points.map(p=>[p[0],p[2]]);
  if(area(outline)<1e-10)return;
  const id=faces.length;faces.push({outline,owner});
  const xs=outline.map(p=>p[0]),zs=outline.map(p=>p[1]);
  for(const height of matches)cells(Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs),(x,z)=>{
    const key=`${height}:${x}:${z}`;
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(id);
  });
}
for(const chunk of baked.chunks){
  const values=decode(chunk.v,Float32Array),indices=decode(chunk.i,chunk.indexType===32?Uint32Array:Uint16Array);
  for(let i=0;i<indices.length;i+=3){
    const ids=[indices[i],indices[i+1],indices[i+2]];
    if(ids.some(index=>values[index*8+4]<.9999))continue;
    const points=ids.map(index=>[values[index*8]+chunk.origin[0],values[index*8+1]+chunk.origin[1],values[index*8+2]+chunk.origin[2]]);
    addFace(points,`${chunk.key}:triangle:${i/3}`);
  }
}
for(const chunk of baked.instances){
  const values=decode(chunk.m,Float32Array);
  for(let i=0;i<values.length;i+=16){
    const m=values.subarray(i,i+16);
    // Production box instances rotate about Y only. Assert that contract
    // rather than silently misclassify a future tilted object as a sill.
    if(Math.abs(m[1])+Math.abs(m[9])>.00001)continue;
    if(m[5]<=0)continue;
    const points=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>[
      m[0]*x+m[4]*.5+m[8]*z+m[12]+chunk.origin[0],
      m[1]*x+m[5]*.5+m[9]*z+m[13]+chunk.origin[1],
      m[2]*x+m[6]*.5+m[10]*z+m[14]+chunk.origin[2],
    ]);
    addFace(points,`${chunk.key}:box:${i/16}`);
  }
}
function clip(poly,axis,bound,greater){
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ina=greater?a[axis]>=bound:a[axis]<=bound,inb=greater?b[axis]>=bound:b[axis]<=bound;
    if(ina)result.push(a);
    if(ina!==inb){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return result;
}
function coverage(x,z,height){
  const ids=new Set();
  cells(x-HALF,x+HALF,z-HALF,z+HALF,(cx,cz)=>{for(const id of grid.get(`${height}:${cx}:${cz}`)||[])ids.add(id);});
  let covered=0;const owners=[];
  for(const id of ids){
    let polygon=faces[id].outline.map(p=>[p[0]-x,p[1]-z]);
    for(const[axis,bound,greater]of[[0,-HALF,true],[0,HALF,false],[1,-HALF,true],[1,HALF,false]]){
      polygon=clip(polygon,axis,bound,greater);if(polygon.length<3)break;
    }
    if(polygon.length<3)continue;
    const contribution=area(polygon)/(4*HALF*HALF);
    covered+=contribution;
    if(contribution>.0001)owners.push(faces[id].owner);
  }
  return{covered,owners};
}
let openings=0,probes=0,failures=0,min=Infinity,max=0;
const examples=[];
for(const shell of source.buildingShells)for(const wall of shell.walls){
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);
  for(const opening of wall.openings){
    openings++;
    for(const fraction of [.31,.69]){
      const along=opening.start+(opening.end-opening.start)*fraction,out=-opening.depth*.45;
      const x=wall.a[0]+dx*along/length+dz*out/length,z=wall.a[1]+dz*along/length-dx*out/length;
      const result=coverage(x,z,opening.bottom);probes++;
      min=Math.min(min,result.covered);max=Math.max(max,result.covered);
      if(Math.abs(result.covered-1)>.005){
        failures++;
        if(examples.length<8)examples.push({building:shell.id,kind:opening.kind,bottom:opening.bottom,
          fraction,covers:Number(result.covered.toFixed(6)),surfaces:result.owners.slice(0,5)});
      }
    }
  }
}
console.log(JSON.stringify({directory,openings,probes,upwardFacesAtOpeningLevels:faces.length,
  minimumCovers:min,maximumCovers:max,failures,examples,
  scope:'Actual baked triangles and transformed box tops; a 2 mm square probe requires exactly one upward surface at every door/window sill. Adjacent triangle-edge coverage is integrated, not counted twice.'},null,2));
assert.ok(openings>500,'A populated mapped city is required for the sill regression');
assert.equal(failures,0,'A facade opening has a missing or duplicate upward sill/threshold surface');
