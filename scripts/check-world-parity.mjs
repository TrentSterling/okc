#!/usr/bin/env node
// Compare an existing built release with a candidate after a behavior-preserving
// refactor. Covers graph/geometry/material state and texture drawing commands;
// this is not a rendered-image or GPU performance comparison.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options={};
const usage='Usage: node scripts/check-world-parity.mjs --baseline-dir <built-dist> [--candidate-dir <built-dist>]';
for(let i=2;i<process.argv.length;i++){
  const name=process.argv[i];
  if(name==='--help'){console.log(usage);process.exit(0);}
  if(!['--baseline-dir','--candidate-dir'].includes(name)||!process.argv[i+1]||process.argv[i+1].startsWith('--')){
    console.error(usage);process.exit(2);
  }
  options[name]=path.resolve(process.argv[++i]);
}
if(!options['--baseline-dir']){console.error(usage);process.exit(2);}
const baseline=options['--baseline-dir'];
const candidate=options['--candidate-dir']||path.join(root,'dist');
// Use the same vendored Three implementation for both graphs; otherwise a
// dependency upgrade could obscure a source-refactor comparison.
register(new URL('./lib/three-loader.mjs',import.meta.url),{
  data:{threeURL:pathToFileURL(path.join(baseline,'vendor/three.module.js')).href}
});
const THREE=await import(pathToFileURL(baseline+'/vendor/three.module.js').href);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let gradientIndex=0;
function canvas(){
  const hash=createHash('sha256');
  const emit=(name,args)=>hash.update(name+':'+JSON.stringify(args)+'\n');
  const gradient=()=>{
    const id=gradientIndex++;
    return {id,addColorStop(...args){emit('gradient'+id,args);}};
  };
  const target={
    createImageData(w,h){emit('imageData',[w,h]);return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(image,...args){emit('imageBytes',[sha(image.data),...args]);},
    createRadialGradient(...args){emit('radialGradient',args);return gradient();},
    createLinearGradient(...args){emit('linearGradient',args);return gradient();},
    measureText(...args){emit('measureText',args);return {width:1};}
  };
  const context=new Proxy(target,{
    get:(o,k)=>k in o?o[k]:(...args)=>emit(k,args),
    set:(o,k,v)=>(emit('set '+k,[v]),o[k]=v,true)
  });
  return {width:1,height:1,getContext:()=>context,digest:()=>hash.copy().digest('hex')};
}
globalThis.document={createElement:()=>canvas()};

function value(v){
  if(v===null||typeof v==='number'||typeof v==='string'||typeof v==='boolean')return v;
  if(v===undefined)return null;
  if(Array.isArray(v))return v.map(value);
  if(ArrayBuffer.isView(v))return {type:v.constructor.name,hash:sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength)),length:v.length};
  if(v.isColor)return v.toArray();
  if(v.isVector2||v.isVector3||v.isVector4||v.isQuaternion||v.isMatrix3||v.isMatrix4)return v.toArray();
  if(v.isTexture){
    const out={};
    for(const k of ['name','mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','offset','repeat','center','rotation','matrixAutoUpdate','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace'])out[k]=value(v[k]);
    out.image=v.image?.digest?{width:v.image.width,height:v.image.height,hash:v.image.digest()}:null;
    return out;
  }
  if(v.isBox3)return [v.min.toArray(),v.max.toArray()];
  if(v.isSphere)return [v.center.toArray(),v.radius];
  if(v.constructor===Object)return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).filter(([,x])=>typeof x!=='function').map(([k,x])=>[k,value(x)]));
  return String(v);
}
function attribute(a){
  if(!a)return null;
  return {itemSize:a.itemSize,normalized:a.normalized,count:a.count,offset:a.offset??null,stride:a.data?.stride??null,array:value(a.isInterleavedBufferAttribute?a.data.array:a.array)};
}
function snapshot(group){
  group.updateMatrixWorld(true);
  const geometryIds=new Map(),materialIds=new Map();
  const geometries=[],materials=[],objects=[];
  function geometry(g){
    if(!g)return null;
    if(geometryIds.has(g))return geometryIds.get(g);
    const id=geometries.length;geometryIds.set(g,id);
    geometries.push({attributes:Object.fromEntries(Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>[k,attribute(a)])),index:attribute(g.index),groups:value(g.groups),drawRange:value(g.drawRange),box:value(g.boundingBox),sphere:value(g.boundingSphere)});
    return id;
  }
  function material(m){
    if(Array.isArray(m))return m.map(material);
    if(!m)return null;
    if(materialIds.has(m))return materialIds.get(m);
    const id=materials.length;materialIds.set(m,id);
    const skip=new Set(['id','uuid','version','_listeners']);
    materials.push(Object.fromEntries(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)).filter(([k,v])=>!skip.has(k)&&typeof v!=='function').map(([k,v])=>[k,value(v)])));
    return id;
  }
  group.traverse(o=>objects.push({name:o.name,type:o.type,children:o.children.length,matrix:o.matrix.toArray(),matrixWorld:o.matrixWorld.toArray(),geometry:geometry(o.geometry),material:material(o.material),instanceMatrix:attribute(o.instanceMatrix),instanceColor:attribute(o.instanceColor),count:o.count??null,castShadow:o.castShadow,receiveShadow:o.receiveShadow,frustumCulled:o.frustumCulled,visible:o.visible,renderOrder:o.renderOrder,userData:value(o.userData),light:o.isLight?{color:o.color.toArray(),intensity:o.intensity,distance:o.distance,decay:o.decay}:null}));
  return {objects,geometries,materials};
}
async function build(dir,seed){
  gradientIndex=0;
  const w=await import(pathToFileURL(dir+'/world.js').href);
  const t=await import(pathToFileURL(dir+'/tower.js').href);
  const scene=new THREE.Scene();
  const world=w.createWorld({scene,seed});
  const devon=t.createDevon();scene.add(devon.group);
  const legends=t.createLegends();scene.add(legends.group);
  const cars=['sedan','suv','truck'].map(style=>w.createCar(style,0xc79956));
  cars.forEach(car=>scene.add(car));
  const meta=Object.fromEntries(Object.entries(world).filter(([k,v])=>k!=='group'&&typeof v!=='function').map(([k,v])=>[k,value(v)]));
  const routes=Array.from({length:121},(_,i)=>[world.getRoutePoint(i/120,Math.sin(i)*1.75).toArray(),world.getRouteTangent(i/120).toArray()]);
  const frames=[snapshot(scene)];
  for(const [dt,time,night,speed,screen] of [[1/60,18,0,1,false],[.2,36,.7,1.4,true],[0,92,1,0,true],[.1,116,.2,.7,false]]){
    world.update(dt,time,night,speed);devon.update(time,night,screen);legends.update(time,night);
    cars.forEach(car=>car.userData.setNight(night));
    frames.push(snapshot(scene));
  }
  return {meta,routes,dimensions:value(t.DEVON_DIMENSIONS),frames};
}
for(const seed of [42,1907]){
  const old=await build(baseline,seed),current=await build(candidate,seed);
  try{assert.deepEqual(current,old);}catch{
    // Preserve detailed diagnostics on disk without flooding a terminal or
    // agent conversation with geometry/material state.
    const diagnostics=fs.mkdtempSync(path.join(os.tmpdir(),'okc-world-parity-'));
    fs.writeFileSync(path.join(diagnostics,'baseline.json'),JSON.stringify(old));
    fs.writeFileSync(path.join(diagnostics,'candidate.json'),JSON.stringify(current));
    throw new Error(`World parity failed for seed ${seed}. Full snapshots: ${diagnostics}`);
  }
  console.log(JSON.stringify({seed,match:true,frames:current.frames.length,objects:current.frames[0].objects.length,geometryCount:current.frames[0].geometries.length,materialCount:current.frames[0].materials.length,routeSamples:current.routes.length,hash:sha(JSON.stringify(current))}));
}
