#!/usr/bin/env node
// Preserve production transforms and material programs for a native depth audit.
import fs from 'node:fs';
import path from 'node:path';
import {register} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const data=path.resolve(option('--baseline-dist',option('--data-dir',path.join(root,'dist'))));
let runtime=path.resolve(option('--runtime-dir',data));
const output=path.resolve(option('--output',path.join(root,'qa/paint-depth-baseline')));
const omitPrairieGround=args.includes('--omit-prairie-ground');
const floorSegments=Number(option('--floor-segments',0));
if(!Number.isInteger(floorSegments)||floorSegments<0||floorSegments>256)throw Error('--floor-segments must be an integer from 1 to 256, or omitted.');
if(omitPrairieGround&&floorSegments)throw Error('Choose either floor omission or floor subdivision, not both.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output,{recursive:true});
if(runtime===path.join(root,'src')){
  const overlay=path.join(output,'runtime');fs.cpSync(runtime,overlay,{recursive:true});
  for(const name of ['city-data.js','world-surfaces.js','world-meshes.js'])if(!fs.existsSync(path.join(overlay,name)))fs.symlinkSync(path.join(data,name),path.join(overlay,name));
  if(!fs.existsSync(path.join(overlay,'vendor')))fs.symlinkSync(path.join(root,'public/vendor'),path.join(overlay,'vendor'));
  fs.writeFileSync(path.join(overlay,'package.json'),'{"type":"module"}');runtime=overlay;
}
const threeRoot=path.join(root,'node_modules/three');
const threeVersion=JSON.parse(fs.readFileSync(path.join(threeRoot,'package.json'))).version;
if(threeVersion!=='0.180.0')throw Error('Paint-depth diagnostics require pinned three@0.180.0.');
register(new URL('../lib/three-loader.mjs',import.meta.url),{data:{threeURL:pathToFileURL(path.join(threeRoot,'build/three.module.js')).href}});
// Material factories retain their real texture flags/transforms, but coverage
// IDs do not depend on texture appearance. No native Canvas dependency in CI.
globalThis.document={createElement(){
  const canvas={width:1,height:1},context=new Proxy({canvas,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
    {get:(target,key)=>key in target?target[key]:(()=>{})});canvas.getContext=()=>context;return canvas;
}};
const THREE=await import('three');
const load=name=>import(pathToFileURL(path.join(runtime,name)).href);
const [{createCityMaterials},{createBatching},{addStreets},{addRoadMarkings},{configureDepthOffsets},{createSunlightBinding},
  {WebGLPrograms},{WebGLProgram},{WebGLMaterials}]=await Promise.all([
  load('world/materials.js'),load('world/batching.js'),load('world/streets.js'),load('world/road-markings.js'),load('app/renderer.js'),load('atmosphere/sunlight.js'),
  import(pathToFileURL(path.join(threeRoot,'src/renderers/webgl/WebGLPrograms.js')).href),
  import(pathToFileURL(path.join(threeRoot,'src/renderers/webgl/WebGLProgram.js')).href),
  import(pathToFileURL(path.join(threeRoot,'src/renderers/webgl/WebGLMaterials.js')).href),
]);
const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
const materials=createCityMaterials({group,dynamicLights:[],seed:1907});
// This opaque depth owner was accidentally omitted by the original fixture.
// Retain the actual material, transform, dimensions and unsegmented geometry.
const floor=group.children.find(object=>object.isMesh&&object.material.name==='Prairie ground');
if(!floor)throw Error('The actual Prairie ground depth owner was not created.');
const originalFloor={...floor.geometry.parameters};
if(floorSegments){
  floor.geometry.dispose();
  floor.geometry=new THREE.PlaneGeometry(originalFloor.width,originalFloor.height,floorSegments,floorSegments);
}
floor.updateMatrixWorld(true);
if(omitPrairieGround)group.remove(floor);
const batching=createBatching({group,unit:new THREE.BoxGeometry(),chunkSize:1024,paintGeometry:materials.paintGeometry});
const addPaint=(material,x,y,z,w,d,rot=0)=>{
  if(y<.1||x < -1500||x>1100||z<180||z>420)return;
  batching.addBatch(materials.paintGeometry,material,[x,y,z],[w,1,d],rot);
};
const poolMat=addStreets({group,addBatch(){},addBox(){},addPaint,materials,dynamicLights:[]});
addRoadMarkings({addPaint,materials});batching.flush({...materials,poolMat});
const layoutBytes=fs.readFileSync(path.join(data,'geo/base-city-layout.json'));
const layout=JSON.parse(layoutBytes),packed=gunzipSync(fs.readFileSync(path.join(data,'geo/base-city.bin.gz')));
for(const chunk of layout.chunks){
  if(chunk.material!=='ground.road')continue;
  const bytes=packed.subarray(chunk.vRange[0],chunk.vRange[0]+chunk.vRange[1]),indices=packed.subarray(chunk.iRange[0],chunk.iRange[0]+chunk.iRange[1]);
  const buffer=new THREE.InterleavedBuffer(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),8),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
  geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));
  geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(buffer,2,6));
  const Index=chunk.indexType===32?Uint32Array:Uint16Array;
  geometry.setIndex(new THREE.BufferAttribute(new Index(indices.buffer,indices.byteOffset,indices.byteLength/Index.BYTES_PER_ELEMENT),1));
  const mesh=new THREE.Mesh(geometry,materials.bakedMaterials[chunk.material]);mesh.name=chunk.key;mesh.position.fromArray(chunk.origin);group.add(mesh);
}
createSunlightBinding({uSolarCenterAltitude:{value:.2},uSunDirection:{value:new THREE.Vector3(0,1,0)}})(scene);
scene.updateMatrixWorld(true);
const objects=group.children.filter(object=>object.isMesh),programs=[],textures=new Map(),materialIds=new Map();
const control=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.5,3),materials.white);
control.name='Ground-touching vehicle-size occluder control';control.position.set(-472.1,.89,294);control.updateMatrixWorld(true);objects.push(control);
const manifest={method:'Actual MeshStandard programs, Prairie ground, packed road triangles and Float32 instanced paint transforms. Emissive uniforms identify floor/road/paint coverage; no replacement depth shader. Native GLES, no browser or performance claim.',
  threeVersion,
  prairieGround:{included:!omitPrairieGround,originalGeometry:originalFloor,preparedGeometry:floor.geometry.parameters,modelMatrix:floor.matrixWorld.toArray(),diagnosticOverride:omitPrairieGround?'omitted':floorSegments?'subdivided':null},
  textureScope:'Opaque diagnostic texture samples retain actual map/bump shader variants. Texture appearance and lighting are outside this depth-ID test; alpha-tested/displaced materials are rejected.',
  data,runtime,occluder:{min:[-473.5,.14,292.5],max:[-470.7,1.64,295.5]},paintHeight:.152,sourceHashes:{baseLayout:hash(layoutBytes),'geo/base-city.bin.gz':hash(fs.readFileSync(path.join(data,'geo/base-city.bin.gz')))},programs,materials:[],draws:[],views:[],textures:[]};
for(const name of ['world/materials.js','world/paint-material.js','world/route.js','world/batching.js','world/streets.js','world/road-markings.js','app/renderer.js','atmosphere/sunlight.js'])if(fs.existsSync(path.join(runtime,name)))manifest.sourceHashes[name]=hash(fs.readFileSync(path.join(runtime,name)));
for(const name of ['src/renderers/WebGLRenderer.js','src/renderers/webgl/WebGLState.js','src/renderers/webgl/WebGLPrograms.js'])manifest.sourceHashes['three/'+name]=hash(fs.readFileSync(path.join(threeRoot,name)));
manifest.sourceHashes.diagnosticPreparer=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
function textureRecord(texture){
  if(!texture)return null;if(textures.has(texture.uuid))return textures.get(texture.uuid);
  const file=`texture-${textures.size}.rgba`,bytes=Buffer.from([255,255,255,255]);fs.writeFileSync(path.join(output,file),bytes);
  const record={file,format:'rgba8',sha256:hash(bytes),width:1,height:1,colorSpace:texture.colorSpace,flipY:texture.flipY,wrapS:texture.wrapS,wrapT:texture.wrapT};
  textures.set(texture.uuid,record);manifest.textures.push(record);return record;
}
function serialize(value){
  if(value?.isTexture)return {texture:textureRecord(value).file};
  if(value?.toArray)return value.toArray();
  return value;
}
for(const object of objects){
  const material=object.material;
  if(material.alphaTest||material.alphaMap||material.displacementMap)throw Error('Depth-relevant texture appeared; this diagnostic needs its actual pixels.');
  if(!materialIds.has(material)){
    const id=manifest.materials.length;materialIds.set(material,id);
    manifest.materials.push({id,name:material.name,role:object===control?'occluder':object===floor?'floor':object.isInstancedMesh?'paint':'road',paint:object.isInstancedMesh,side:material.side,transparent:material.transparent,opacity:material.opacity,depthTest:material.depthTest,depthWrite:material.depthWrite,states:{},programs:{}});
  }
  const id=manifest.draws.length,geometry=object.geometry,index=geometry.index,count=index?.count||geometry.attributes.position.count;
  const values=new Float32Array(count*8);
  for(let i=0;i<count;i++){
    const v=index?index.getX(i):i,p=geometry.attributes.position,n=geometry.attributes.normal,u=geometry.attributes.uv;
    values.set([p.getX(v),p.getY(v),p.getZ(v),n.getX(v),n.getY(v),n.getZ(v),u?.getX(v)||0,u?.getY(v)||0],i*8);
  }
  const file=`draw-${id}.f32`,bytes=Buffer.from(values.buffer);fs.writeFileSync(path.join(output,file),bytes);
  const draw={name:object.name,material:materialIds.get(material),file,sha256:hash(bytes),vertices:count,modelMatrix:object.matrixWorld.toArray()};
  if(object.isInstancedMesh){const bytes=Buffer.from(object.instanceMatrix.array.buffer);draw.instances={count:object.count,file:`instances-${id}.f32`,sha256:hash(bytes)};fs.writeFileSync(path.join(output,draw.instances.file),bytes);}
  manifest.draws.push(draw);
}
// A reversed-capable renderer whose real WebGLState has been reset has neither
// shader depth define. Its paint offsets remain inverted by initial setup.
for(const {mode,reversed,logarithmic,offsetReversed} of [
  {mode:'logarithmic',reversed:false,logarithmic:true,offsetReversed:false},
  {mode:'reversed',reversed:true,logarithmic:false,offsetReversed:true},
  {mode:'ordinary-after-reset',reversed:false,logarithmic:false,offsetReversed:true},
]){
  configureDepthOffsets(scene,offsetReversed);
  const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,createProgram:()=>({shaders:[]}),createShader:kind=>({kind}),shaderSource:(shader,source)=>{shader.source=source;},compileShader(){},attachShader:(program,shader)=>program.shaders.push(shader),linkProgram(){},bindAttribLocation(){}};
  const capabilities={reversedDepthBuffer:!logarithmic,logarithmicDepthBuffer:logarithmic,vertexTextures:true,precision:'highp',getMaxPrecision:v=>v};
  const renderer={getContext:()=>gl,getRenderTarget:()=>null,capabilities,outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,
    state:{buffers:{depth:{getReversed:()=>reversed}}},shadowMap:{enabled:false,type:THREE.PCFSoftShadowMap},debug:{checkShaderErrors:false}};
  const lights={directional:[],point:[],spot:[],spotLightMap:[],rectArea:[],hemi:[],directionalShadowMap:[],pointShadowMap:[],spotShadowMap:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};
  const webgl=WebGLPrograms(renderer,{get:v=>v},{get:v=>v},{has:()=>false},capabilities,{}, {numPlanes:0,numIntersection:0});
  const webMaterials=WebGLMaterials(renderer,{get:()=>({})});
  for(const [material,id] of materialIds){
    const object=objects.find(o=>o.material===material),entry=manifest.materials[id],parameters=webgl.getParameters(material,lights,[],scene,object);
    const uniforms=THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
    webMaterials.refreshMaterialUniforms(uniforms,material,1,540,null);
    const shader={uniforms,vertexShader:parameters.vertexShader,fragmentShader:parameters.fragmentShader};material.onBeforeCompile(shader,renderer);
    parameters.vertexShader=shader.vertexShader;parameters.fragmentShader=shader.fragmentShader;
    const name=`${entry.role}-${id}-${mode}`,compiled=new WebGLProgram(renderer,name,parameters,{}).program;
    const program={name,mode,material:id,vertex:name+'.vert',fragment:name+'.frag',sha256:{},uniforms:Object.fromEntries(Object.entries(shader.uniforms).map(([k,v])=>[k,serialize(v.value)])),
      features:{instancing:!!parameters.instancing,logarithmicDepthBuffer:parameters.logarithmicDepthBuffer,reversedDepthBuffer:parameters.reversedDepthBuffer,map:parameters.map,bumpMap:parameters.bumpMap},depthChunk:THREE.ShaderChunk.logdepthbuf_fragment};
    for(const shader of compiled.shaders){const stage=shader.kind===gl.VERTEX_SHADER?'vertex':'fragment';fs.writeFileSync(path.join(output,program[stage]),shader.source);program.sha256[stage]=hash(shader.source);}
    entry.states[mode]={polygonOffset:material.polygonOffset,factor:material.polygonOffsetFactor,units:material.polygonOffsetUnits};entry.programs[mode]=name;programs.push(program);
  }
}
const views=[
  {id:'dewey-driver',eye:[-550,1.6,295.2],target:[-250,.14,291.4],near:.25,fov:56},
  {id:'walker-driver',eye:[-354,1.6,295.2],target:[-150,.14,291.4],near:.25,fov:56},
  {id:'reno-chase',eye:[-720,5,299],target:[-300,.14,291.4],near:.5,fov:48},
  {id:'reno-distant',eye:[-1450,2.1,298],target:[700,.14,273],near:.25,fov:56},
  {id:'reno-grazing',eye:[-550,.35,295.2],target:[-250,.14,291.4],near:.25,fov:56},
  {id:'walker-orbit',eye:[-440,65,365],target:[-325,.14,290],near:.75,fov:44},
  {id:'reno-orbit-far',eye:[-1300,300,700],target:[-300,.14,295],near:.75,fov:44},
  {id:'reno-orbit-high',eye:[-500,800,900],target:[-200,.14,295],near:.75,fov:44},
  // Production free-chase proportions: 10 m behind, 4.4 m above ground,
  // looking 28 m ahead and 1.2 m above ground. These cross the visible stripes.
  {id:'dewey-chase-near',eye:[-489,4.54,295.2],target:[-451,1.34,295.2],near:.5,fov:48},
  {id:'dewey-chase-crossing',eye:[-479,4.54,295.2],target:[-441,1.34,295.2],near:.5,fov:48},
  {id:'walker-chase-near',eye:[-348,4.54,295.2],target:[-310,1.34,295.2],near:.5,fov:48},
  {id:'dewey-chase-reverse',eye:[-447,4.54,286],target:[-485,1.34,286],near:.5,fov:48},
  {id:'dewey-close-orbit',eye:[-485,5,305],target:[-470,.14,290],near:.75,fov:48},
  {id:'dewey-driver-near',eye:[-485,1.6,295.2],target:[-305,4.14,295.2],near:.25,fov:48},
];
for(const view of views){
  const record={...view,far:7500,matrices:{}};
  for(const reversed of [false,true]){
    const camera=new THREE.PerspectiveCamera(view.fov,16/9,view.near,7500);camera.position.fromArray(view.eye);camera.lookAt(...view.target);camera._reversedDepth=reversed;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const mode=reversed?'reversed':'logarithmic';record.matrices[mode]={projectionMatrix:camera.projectionMatrix.toArray(),viewMatrix:camera.matrixWorldInverse.toArray(),draws:objects.map(object=>{
      const matrix=new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld);
      return {modelViewMatrix:matrix.toArray(),normalMatrix:new THREE.Matrix3().getNormalMatrix(matrix).toArray()};
    })};
  }
  manifest.views.push(record);
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,programs:programs.length,draws:manifest.draws.length,vertices:manifest.draws.reduce((n,d)=>n+d.vertices*(d.instances?.count||1),0),paintInstances:manifest.draws.reduce((n,d)=>n+(d.instances?.count||0),0),views:views.length},null,2));
