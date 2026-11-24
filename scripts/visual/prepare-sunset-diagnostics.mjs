#!/usr/bin/env node
// Export actual r180 WebGLProgram output for native GLES validation. No browser.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {register} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const threeRoot=path.resolve(option('--three-root',path.join(root,'node_modules/three')));
const out=path.resolve(option('--output','/tmp/okc-sunset-diagnostics'));
const pkg=JSON.parse(fs.readFileSync(path.join(threeRoot,'package.json'),'utf8'));
if(pkg.version!=='0.180.0')throw Error('Diagnostics require the pinned three@0.180.0 source package.');
register(new URL('../lib/three-loader.mjs',import.meta.url),{data:{threeURL:pathToFileURL(path.join(threeRoot,'build/three.module.js')).href}});
const THREE=await import('three');
const {WebGLPrograms}=await import(pathToFileURL(path.join(threeRoot,'src/renderers/webgl/WebGLPrograms.js')));
const {WebGLProgram}=await import(pathToFileURL(path.join(threeRoot,'src/renderers/webgl/WebGLProgram.js')));
const {createAtmosphere,createGlassMaterial}=await import('../../src/sky.js');
const {createDevon}=await import('../../src/tower.js');
const {skyGLSL}=await import('../../src/atmosphere/radiance.js');
const {apparentSolarAltitude,solarDiscVisibility,horizonDip}=await import('../../src/atmosphere/solar.js');
const {createFacadeMaterial}=await import('../../src/world/facade-textures.js');
const {REFLECTION_SHOT_PRESETS}=await import('../../src/capture-presets.js');

// Only shader feature flags and texture dimensions are needed for compilation.
// This canvas mock does not provide visual validation of painted texture pixels.
globalThis.document={createElement(name){
  if(name!=='canvas')throw Error('Unexpected DOM dependency '+name);
  const canvas={width:1,height:1};
  const context=new Proxy({canvas,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createLinearGradient:()=>({addColorStop(){}}),measureText:()=>({width:0})},
    {get(target,key){return key in target?target[key]:(()=>{});}});
  canvas.getContext=()=>context;return canvas;
}};
fs.mkdirSync(out,{recursive:true});
const programs=[],sourceHashes={};
for(const relative of ['src/sky.js','src/atmosphere/solar.js','src/atmosphere/radiance.js',
  'src/atmosphere/glass.js','src/atmosphere/sunlight.js','src/world/facade-lighting.js',
  'src/world/facade-textures.js','src/world/skyline-profiles.js','src/capture-presets.js']){
  if(fs.existsSync(path.join(root,relative)))sourceHashes[relative]=createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');
}

function uniformValue(value){
  if(value===null||typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return value;
  if(value?.isTexture)return {type:value.isCubeTexture?'CubeTexture':'Texture',mapping:value.mapping,
    imageCount:Array.isArray(value.image)?value.image.length:1};
  if(typeof value?.toArray==='function')return value.toArray();
  return {type:value?.constructor?.name??typeof value};
}

function prepare(reversed){
  const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,
    createProgram:()=>({shaders:[]}),createShader:kind=>({kind}),
    shaderSource:(shader,source)=>{shader.source=source;},compileShader(){},
    attachShader:(program,shader)=>{program.shaders.push(shader);},
    linkProgram(){},bindAttribLocation(){}};
  const capabilities={reversedDepthBuffer:reversed,logarithmicDepthBuffer:!reversed,
    vertexTextures:true,precision:'highp',getMaxPrecision:p=>p};
  const renderer={getContext:()=>gl,getRenderTarget:()=>null,capabilities,compile(){},
    outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,
    state:{buffers:{depth:{getReversed:()=>reversed}}},
    shadowMap:{enabled:true,type:THREE.PCFSoftShadowMap},debug:{checkShaderErrors:false}};
  const scene=new THREE.Scene();
  const atmosphere=createAtmosphere(renderer,scene),glass=createGlassMaterial();
  atmosphere.bindGlass(glass);
  // A fixture texture enables inspection of populated local-probe uniforms.
  // It is never rasterized and supplies no city pixels to the ideal diagnostic.
  glass.setLocalReflection(new THREE.CubeTexture(Array.from({length:6},()=>({width:1,height:1}))),{
    position:new THREE.Vector3(0,130,0),boxMin:new THREE.Vector3(-200,0,-200),
    boxMax:new THREE.Vector3(200,300,200),strength:.85});
  // A valid CubeUV environment activates the exact physical reflection path.
  const env=new THREE.Texture({width:768,height:1024});env.mapping=THREE.CubeUVReflectionMapping;
  scene.environment=env;
  const objects=[{name:'sky',object:atmosphere.sky}];
  for(const instanced of [false,true]){
    const object=instanced?new THREE.InstancedMesh(new THREE.BoxGeometry(),glass.material,1):new THREE.Mesh(new THREE.BoxGeometry(),glass.material);
    object.name=instanced?'devon-glass-instanced':'devon-glass';scene.add(object);objects.push({name:object.name,object});
  }
  for(const style of ['glass','bok','limestone']){
    const material=createFacadeMaterial({seed:1907,id:style,style,dynamicLights:[]});
    const object=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(object);objects.push({name:'city-'+style,object});
    const instance=new THREE.InstancedMesh(new THREE.BoxGeometry(),material,1);scene.add(instance);objects.push({name:'city-'+style+'-instanced',object:instance});
  }
  atmosphere.bindSunlight(scene);
  const lights={directional:[{}],point:[],spot:[],spotLightMap:[],rectArea:[],hemi:[{}],
    directionalShadowMap:[{}],pointShadowMap:[],spotShadowMap:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};
  const webgl=WebGLPrograms(renderer,{get:v=>v},{get:v=>v},{has:()=>false},capabilities,{},
    {numPlanes:0,numIntersection:0});
  for(const {name,object} of objects){
    const parameters=webgl.getParameters(object.material,lights,[{}],scene,object);
    const shader={uniforms:{},vertexShader:parameters.vertexShader,fragmentShader:parameters.fragmentShader};
    object.material.onBeforeCompile(shader,renderer);
    parameters.vertexShader=shader.vertexShader;parameters.fragmentShader=shader.fragmentShader;
    const id=name+'-'+(reversed?'reversed':'logarithmic');
    const program=new WebGLProgram(renderer,id,parameters,{}).program;
    const entry={name:id,vertex:id+'.vert',fragment:id+'.frag',sha256:{},
      materialType:object.material.type,
      hookUniforms:Object.fromEntries(Object.entries(shader.uniforms).map(([key,uniform])=>[key,uniformValue(uniform.value)])),
      features:Object.fromEntries(['envMap','envMapMode','envMapCubeUVHeight','numDirLights','numHemiLights',
        'numDirLightShadows','shadowMapEnabled','map','bumpMap','roughnessMap','metalnessMap','emissiveMap',
        'fog','fogExp2','instancing','reversedDepthBuffer','logarithmicDepthBuffer'].map(key=>[key,parameters[key]])),
      hooks:{heightSun:shader.fragmentShader.includes('prismSolarVisibility(vPrismSolarHeight)'),
        heightReflection:shader.fragmentShader.includes('prismAltitudeCorrection(reflectVec,'),
        localReflection:shader.fragmentShader.includes('textureCube(uPrismLocalMap,'),
        cityOccupancy:shader.fragmentShader.includes('totalEmissiveRadiance*=cityOfficeLight()')}};
    if(name!=='sky'){
      if(!parameters.envMap||parameters.envMapMode!==THREE.CubeUVReflectionMapping||
        !parameters.shadowMapEnabled||parameters.numDirLights!==1||parameters.numDirLightShadows!==1||
        !entry.hooks.heightSun)throw Error(id+': required environment, shadow or sunlight path is inactive.');
      if(name.startsWith('devon-')&&(!entry.hooks.heightReflection||!entry.hooks.localReflection))
        throw Error(id+': Devon reflection hook is absent.');
      if(name.startsWith('city-')&&(!entry.hooks.cityOccupancy||
        ['map','bumpMap','roughnessMap','metalnessMap','emissiveMap'].some(key=>!parameters[key])))
        throw Error(id+': city occupancy or a required texture path is inactive.');
    }
    for(const source of program.shaders){
      const kind=source.kind===gl.VERTEX_SHADER?'vertex':'fragment';
      fs.writeFileSync(path.join(out,entry[kind]),source.source);
      entry.sha256[kind]=createHash('sha256').update(source.source).digest('hex');
    }
    programs.push(entry);
  }
  return {glass};
}
const {glass}=prepare(true);prepare(false);

// Only real Devon surfaces using its main glass material are exported. This
// diagnostic excludes the scene, frames, local probe, shadows and PBR response.
const tower=createDevon({glassMaterial:glass.material}).group;tower.updateMatrixWorld(true);
const vertices=[],objects=[];const p=new THREE.Vector3(),n=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
tower.traverse(mesh=>{
  if(!mesh.isMesh||mesh.material!==glass.material)return;
  const geometry=mesh.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,index=geometry.index;
  normalMatrix.getNormalMatrix(mesh.matrixWorld);const start=vertices.length/6;
  for(let j=0,count=index?.count??position.count;j<count;j++){
    const i=index?index.getX(j):j;p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize();vertices.push(...p.toArray(),...n.toArray());
  }
  objects.push({name:mesh.name,vertices:vertices.length/6-start});
});
const geometryBytes=Buffer.from(new Float32Array(vertices).buffer);
fs.writeFileSync(path.join(out,'devon-glass.f32'),geometryBytes);
fs.writeFileSync(path.join(out,'radiance.glsl'),skyGLSL);
fs.writeFileSync(path.join(out,'tonemapping.glsl'),THREE.ShaderChunk.tonemapping_pars_fragment);
fs.writeFileSync(path.join(out,'colorspace.glsl'),THREE.ShaderChunk.colorspace_pars_fragment);
const stages=[.50,.63,.70,.78].map(progress=>{
 const altitude=apparentSolarAltitude(progress),horizontal=Math.hypot(.94,.34);
 return {progress,altitude,sun:[-.94/horizontal*Math.cos(altitude),Math.sin(altitude),.34/horizontal*Math.cos(altitude)]};
});
const horizon=[.61,.63,.64,.66].map(progress=>({progress,altitude:apparentSolarAltitude(progress),
  streetVisibility:solarDiscVisibility(2,apparentSolarAltitude(progress)),
  crownVisibility:solarDiscVisibility(257.2,apparentSolarAltitude(progress))}));
const views=['v05-devon-last-sun','v05-reno-reflection'].map(id=>{
  const preset=REFLECTION_SHOT_PRESETS.find(item=>item.id===id);
  if(!preset)throw Error('Required fixed reflection study is missing: '+id);
  const {orbitFocus:target,orbitYaw:yaw,orbitPitch:pitch,orbitDistance:radius,fov}=preset.view;
  // Same orbit-position formula used by src/app/camera.js.
  return {id,name:id==='v05-devon-last-sun'?'Southwest aerial study':'Reno driver-eye study',
    eye:[target[0]+Math.cos(yaw)*radius,target[1]+Math.sin(pitch)*radius,target[2]+Math.sin(yaw)*radius],
    target,fov,exposure:preset.state.exposure};
});
const result={threeVersion:pkg.version,sourceHashes,programs,geometry:{vertices:vertices.length/6,objects,
  sha256:createHash('sha256').update(geometryBytes).digest('hex')},stages,horizon,views,
  horizonDipDegrees:{street:horizonDip(2)*180/Math.PI,crown:horizonDip(257.2)*180/Math.PI},
  scope:'Actual Three r180 program preparation for native GLES compile/link; separate ideal shared-sky reflection diagnostic, not a browser screenshot, full PBR render or performance benchmark.'};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output:out,programs:programs.length,geometryVertices:vertices.length/6,sourceHashes},null,2));
