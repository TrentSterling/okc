#!/usr/bin/env node
// Small actual-buffer probe. No app, canvas, browser or GPU is started here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const output=path.resolve(option('--output','/tmp/okc-metro-surface-probe'));
const revision=option('--baseline','6ae1e0e');
const data=path.resolve(option('--data-dir',path.join(root,'dist'))),atlas=JSON.parse(fs.readFileSync(path.join(data,'geo/metro/manifest.json')));
const core=atlas.coreBounds,owner={minX:core.minX-50,maxX:core.maxX+50,minZ:core.minZ-50,maxZ:core.maxZ+50};
const hash=value=>createHash('sha256').update(value).digest('hex');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'okc-surface-compiler-'));
fs.mkdirSync(output,{recursive:true});
async function compiler(label,baseline){
  const base=path.join(scratch,label);fs.mkdirSync(path.join(base,'metro'),{recursive:true});
  fs.writeFileSync(path.join(base,'package.json'),'{"type":"module"}');
  fs.symlinkSync(path.join(root,'public/vendor'),path.join(base,'vendor'),'dir');
  for(const name of ['mesh-builder.js','roof-shapes.js','surface-ownership.js','mesh-bounds.js']){
    const source=baseline&&name==='mesh-builder.js'?execFileSync('git',['show',`${revision}:src/metro/${name}`],{cwd:root}):fs.readFileSync(path.join(root,'src/metro',name));
    fs.writeFileSync(path.join(base,'metro',name),source);
  }
  return (await import(pathToFileURL(path.join(base,'metro/mesh-builder.js')).href)).compileTile;
}
const before=await compiler('before',true),after=await compiler('after',false);
const layoutBytes=fs.readFileSync(path.join(data,'geo/base-city-layout.json')),layout=JSON.parse(layoutBytes);
const packed=gunzipSync(fs.readFileSync(path.join(data,'geo/base-city.bin.gz')));
const baseDraws=[];
for(const chunk of layout.chunks){
  if(!chunk.material.startsWith('ground.'))continue;
  const bytes=packed.subarray(chunk.vRange[0],chunk.vRange[0]+chunk.vRange[1]);
  const floats=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
  const indexBytes=packed.subarray(chunk.iRange[0],chunk.iRange[0]+chunk.iRange[1]);
  const Index=chunk.indexType===32?Uint32Array:Uint16Array;
  const indices=new Index(indexBytes.buffer,indexBytes.byteOffset,indexBytes.length/Index.BYTES_PER_ELEMENT);
  const positions=new Float32Array(indices.length*3);
  for(let i=0;i<indices.length;i++)for(let j=0;j<3;j++)positions[i*3+j]=floats[indices[i]*8+j]+chunk.origin[j];
  baseDraws.push({owner:'downtown',kind:chunk.material.slice(7),positions});
}
const allTiles=atlas.tiles.filter(t=>t.ix*512<=owner.maxX&&(t.ix+1)*512>=owner.minX&&t.iz*512<=owner.maxZ&&(t.iz+1)*512>=owner.minZ);
const manifest={scope:'Actual packed downtown ground buffers and production metro compileTile buffers; diagnostic owner colors, no PBR, shadows, UI or browser. Original deployed compiler is the negative control.',baselineRevision:revision,core,coreSurfaceBounds:owner,
  sourceHashes:{atlas:hash(fs.readFileSync(path.join(data,'geo/metro/manifest.json'))),baseLayout:hash(layoutBytes),baselineCompiler:hash(execFileSync('git',['show',`${revision}:src/metro/mesh-builder.js`],{cwd:root})),compiler:hash(fs.readFileSync(path.join(root,'src/metro/mesh-builder.js'))),ownership:hash(fs.readFileSync(path.join(root,'src/metro/surface-ownership.js'))),meshBounds:hash(fs.readFileSync(path.join(root,'src/metro/mesh-bounds.js')))},
  tiles:[],variants:{},views:[
    {id:'west-reno-eye',eye:[-1608,2.1,293.5],target:[-1725,.14,293.5],fov:55},
    {id:'west-reno-overhead',eye:[-1625,70,365],target:[-1625,.14,291.7],fov:55},
    {id:'northwest-seam',eye:[-1610,3,-560],target:[-1690,.14,-560],fov:55},
  ]};
const tiles=allTiles.map(meta=>{const bytes=fs.readFileSync(path.join(data,'geo/metro',meta.url));manifest.tiles.push({id:meta.id,sha256:hash(bytes)});return JSON.parse(bytes);});
const visibleKinds=new Set(['asphalt','concrete','grass','forest','parking','water','yellow','paint']);
for(const [label,compile] of [['before',before],['after',after]]){
  const file=fs.openSync(path.join(output,label+'.f32'),'w'),draws=[];let start=0;
  const write=draw=>{const bytes=Buffer.from(draw.positions.buffer,draw.positions.byteOffset,draw.positions.byteLength);fs.writeSync(file,bytes);draws.push({owner:draw.owner,kind:draw.kind,start,count:draw.positions.length/3,tile:draw.tile});start+=draw.positions.length/3;};
  baseDraws.forEach(write);
  for(const tile of tiles){const result=compile(tile,{core,detail:true});for(const m of result.meshes)if(visibleKinds.has(m.kind))write({owner:'metro',kind:m.kind,tile:tile.id,positions:m.positions});}
  fs.closeSync(file);manifest.variants[label]={file:label+'.f32',vertices:start,draws,sha256:hash(fs.readFileSync(path.join(output,label+'.f32')))};
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.rmSync(scratch,{recursive:true,force:true});
console.log(JSON.stringify({output,sampledTiles:tiles.length,variants:Object.fromEntries(Object.entries(manifest.variants).map(([k,v])=>[k,{vertices:v.vertices,draws:v.draws.length,sha256:v.sha256}]))},null,2));
