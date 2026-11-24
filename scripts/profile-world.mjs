#!/usr/bin/env node
// Offline main-view geometry budget using actual Three.js world matrices and
// Frustum.intersectsObject. This is a draw-submission estimate, not GPU timing.
// Usage: node scripts/profile-world.mjs [--baseline COMMIT | --baseline-dir DIST] [--output FILE]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerThree} from './lib/register-three.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const baseline=option('--baseline')||'064b664';
const baselineDirectory=option('--baseline-dir');
registerThree(root);
const THREE=await import(pathToFileURL(path.join(root,'dist/vendor/three.module.js')).href);
const context=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),measureText:()=>({width:1})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>context})};

const views=[
  {id:'reno-eye-height',position:[-650,2.1,300],target:[25,105,-35],fov:43},
  {id:'devon-campus-orbit',position:[-340,155,390],target:[25,104,-55],fov:47}
];
function bytes(objects){
  const arrays=new Set();
  const add=attribute=>{if(attribute?.isInterleavedBufferAttribute)arrays.add(attribute.data.array);else if(attribute?.array)arrays.add(attribute.array);};
  for(const object of objects){
    if(!object.geometry)continue;
    for(const attr of Object.values(object.geometry.attributes))add(attr);
    add(object.geometry.index);
    for(const attributes of Object.values(object.geometry.morphAttributes||{}))for(const attr of attributes)add(attr);
    add(object.instanceMatrix);add(object.instanceColor);
  }
  return [...arrays].reduce((n,array)=>n+array.byteLength,0);
}
function profile(scene,view){
  const camera=new THREE.PerspectiveCamera(view.fov,16/9,.5,7500);
  camera.position.set(...view.position);camera.lookAt(...view.target);camera.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const submitted=[],parts=new Map();
  let calls=0,triangles=0,instanceCount=0;
  function walk(object,category='other'){
    if(!object.visible)return;
    category=object.userData.profileCategory||category;
    if(object.isMesh&&object.layers.test(camera.layers)&&(!object.frustumCulled||frustum.intersectsObject(object))){
      const g=object.geometry,total=g.index?g.index.count:g.attributes.position.count;
      const groups=Array.isArray(object.material)?g.groups:[{start:0,count:total,materialIndex:0}];
      let meshCalls=0,meshTriangles=0;
      for(const group of groups){
        const material=Array.isArray(object.material)?object.material[group.materialIndex]:object.material;
        if(!material?.visible)continue;
        const start=Math.max(0,g.drawRange.start,group.start),end=Math.min(total,g.drawRange.start+g.drawRange.count,group.start+group.count);
        if(end<=start)continue;
        const passes=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;
        meshCalls+=passes;
        meshTriangles+=Math.floor((end-start)/3)*(object.isInstancedMesh?object.count:1)*passes;
      }
      if(meshCalls){
        submitted.push(object);calls+=meshCalls;triangles+=meshTriangles;if(object.isInstancedMesh)instanceCount+=object.count;
        const key=category+' / '+(object.name||object.type);if(!parts.has(key))parts.set(key,{name:key,objects:0,calls:0,triangles:0});
        const p=parts.get(key);p.objects++;p.calls+=meshCalls;p.triangles+=meshTriangles;
      }
    }
    for(const child of object.children)walk(child,category);
  }
  walk(scene);
  return {...view,aspect:16/9,near:.5,far:7500,submittedMeshObjects:submitted.length,estimatedMainPassCalls:calls,submittedTriangles:triangles,submittedInstances:instanceCount,referencedGeometryAndInstanceBytes:bytes(submitted),contributors:[...parts.values()].sort((a,b)=>b.calls-a.calls)};
}
async function build(directory,label){
  const sourceModule=name=>import(pathToFileURL(path.join(directory,name)).href);
  const [worldModule,towerModule,skyModule]=await Promise.all([sourceModule('world.js'),sourceModule('tower.js'),sourceModule('sky.js')]);
  const scene=new THREE.Scene(),glass=skyModule.createGlassMaterial();
  const world=worldModule.createWorld({scene,glassMaterial:glass.material,seed:1907});world.group.userData.profileCategory='city';
  const devon=towerModule.createDevon({glassMaterial:glass.material});devon.group.userData.profileCategory='Devon';scene.add(devon.group);
  const legends=towerModule.createLegends({glassMaterial:glass.material});legends.group.userData.profileCategory='Legends (hidden)';legends.group.position.set(690,0,-280);legends.group.visible=false;scene.add(legends.group);
  const player=worldModule.createCar('sedan',0xc79956);player.userData.profileCategory='player';player.position.copy(world.getRoutePoint(.392,-1.75));const tangent=world.getRouteTangent(.392);player.rotation.y=-Math.atan2(tangent.z,tangent.x);scene.add(player);
  world.update(0,18,0,0);devon.update(18,0,false);legends.update(18,0);scene.updateMatrixWorld(true);
  const all=[];scene.traverse(object=>{if(object.isMesh)all.push(object);});
  const result={label,mappedBuildings:world.mappedBuildingCount,mappedRoads:world.mappedRoadCount,totalMeshObjects:all.length,allocatedGeometryAndInstanceBytes:bytes(all),views:views.map(view=>profile(scene,view))};
  return result;
}
const snapshot=fs.mkdtempSync(path.join(os.tmpdir(),'okc-profile-'));
try{
  let beforeDirectory;
  if(baselineDirectory){
    beforeDirectory=path.resolve(baselineDirectory);
  }else{
    const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'--','dist'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(name=>name.endsWith('.js'));
    if(!paths.includes('dist/world.js'))throw new Error('This commit stores source rather than dist. Build it in a separate checkout and pass --baseline-dir /absolute/path/to/dist.');
    for(const name of paths){
      const destination=path.join(snapshot,name);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.writeFileSync(destination,execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:32*1024*1024}));
    }
    fs.writeFileSync(path.join(snapshot,'package.json'),'{"type":"module"}');
    beforeDirectory=path.join(snapshot,'dist');
  }
  const before=await build(beforeDirectory,baselineDirectory||baseline),after=await build(path.join(root,'dist'),'working tree');
  const comparison=views.map((view,i)=>({view:view.id,calls:{before:before.views[i].estimatedMainPassCalls,after:after.views[i].estimatedMainPassCalls},triangles:{before:before.views[i].submittedTriangles,after:after.views[i].submittedTriangles},referencedBufferBytes:{before:before.views[i].referencedGeometryAndInstanceBytes,after:after.views[i].referencedGeometryAndInstanceBytes}}));
  const report={method:'Actual production Three geometry, fixed 16:9 cameras, material groups, instance counts, transparent double-sided passes and real object-frustum culling. No occlusion culling. Excludes background/sky, cockpit, shadow passes and environment captures. Buffer counts exclude textures, driver allocation and renderer overhead; hidden geometry is included only in allocated totals. This does not measure GPU time or FPS.',baseline:before,current:after,comparison};
  const output=JSON.stringify(report,null,2)+'\n';
  const destination=option('--output');if(destination){fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,output);}
  console.log(JSON.stringify({baseline:before.label,current:after.label,allocatedBufferBytes:{before:before.allocatedGeometryAndInstanceBytes,after:after.allocatedGeometryAndInstanceBytes},mappedBuildings:{before:before.mappedBuildings,after:after.mappedBuildings},comparison},null,2));
}finally{fs.rmSync(snapshot,{recursive:true,force:true});}
