import fs from 'node:fs';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
register('../../../scripts/lib/three-loader.mjs',import.meta.url,{data:{threeURL:new URL('../../../public/vendor/three.module.js',import.meta.url).href}});
const THREE=await import('../../../public/vendor/three.module.js');
const {createCityMaterials}=await import('../../../src/world/materials.js');
const results=[];
for(const seed of [42,1907]){
 const canvases=[];let pixels=0,images=0;
 const encode=value=>value&&typeof value==='object'&&value.auditCanvasId!=null?{canvas:value.auditCanvasId}:value;
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');const canvas={width:0,height:0,auditCanvasId:canvases.length},hash=createHash('sha256');
  const record=(name,args)=>hash.update(JSON.stringify([name,...args.map(encode)])+'\n');
  const target={canvas,
   createImageData(w,h){pixels+=w*h;images++;record('createImageData',[w,h]);return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
   putImageData(image,...args){record('putImageData',[image.width,image.height,createHash('sha256').update(image.data).digest('hex'),...args]);},
   measureText(text){record('measureText',[text]);return {width:String(text).length*7};},
  };
  const context=new Proxy(target,{get(target,key){if(key in target)return target[key];return (...args)=>record(key,args);},set(target,key,value){record('set '+key,[value]);target[key]=value;return true;}});
  canvas.getContext=kind=>{assert.equal(kind,'2d');return context;};
  canvases.push({canvas,hash});return canvas;
 }};
 const group=new THREE.Group(),lights=[],start=performance.now();
 createCityMaterials({group,dynamicLights:lights,seed});
 const cpuMilliseconds=Math.round((performance.now()-start)*10)/10;
 results.push({seed,cpuMilliseconds,pixels,images,canvases:canvases.map(({canvas,hash})=>({width:canvas.width,height:canvas.height,sha256:hash.digest('hex')}))});
}
const expected=JSON.parse(fs.readFileSync(new URL('./results.json',import.meta.url))).texture.runs;
const output={scope:'CPU/container texture inputs and drawing operations; no browser/GPU rendering.',runs:results.map(({seed,cpuMilliseconds,pixels,images,canvases})=>({seed,cpuMilliseconds,pixels,images,canvases:canvases.length,aggregateHash:createHash('sha256').update(JSON.stringify(canvases)).digest('hex')}))};
for(const run of output.runs){
 const before=expected.find(item=>item.seed===run.seed);
 assert(before,'Missing recorded texture seed.');
 assert.equal(run.aggregateHash,before.pixelAndDrawingSha256,'Generated ImageData or drawing operations changed.');
 assert.equal(run.pixels,before.imageDataPixels);assert.equal(run.images,before.imageDataBuffers);assert.equal(run.canvases,before.canvases);
}
console.log(JSON.stringify({result:'byte-and-operation-identical',...output},null,2));
