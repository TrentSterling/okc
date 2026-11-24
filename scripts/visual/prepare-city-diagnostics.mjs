#!/usr/bin/env node
// Export actual production geometry, transforms, UVs and color textures.
// This is input to a bounded native geometry diagnostic, not a browser capture.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registerThree} from '../lib/register-three.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(name,fallback)=>{
  const i=args.indexOf(name);return i<0?fallback:args[i+1];
};
const directory=path.resolve(option('--dist',path.join(root,'dist')));
const output=path.resolve(option('--output','/tmp/okc-city-diagnostics'));
const label=option('--label','current build');
registerThree(root);
const require=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||root,'package.json'));
let createCanvas;
try{({createCanvas}=require('@napi-rs/canvas'));}
catch{throw Error('Native texture export requires @napi-rs/canvas in the selected runtime. No browser fallback is used.');}
globalThis.document={createElement:()=>createCanvas(1,1)};
const THREE=await import('three');
const load=name=>import(pathToFileURL(path.join(directory,name)).href);
const [{createWorld},{createDevon},{createGlassMaterial}]=await Promise.all([
  load('world.js'),load('tower.js'),load('sky.js'),
]);
const scene=new THREE.Scene(),glass=createGlassMaterial();
const world=createWorld({scene,glassMaterial:glass.material,seed:1907});
const devon=createDevon({glassMaterial:glass.material});scene.add(devon.group);
world.update(0,18,0,0);devon.update(18,0,false);scene.updateMatrixWorld(true);

const views=[
  {id:'reno-street',name:'Reno Avenue / eye level',eye:[-555,2.1,299],target:[-210,20,255],fov:54},
  {id:'walker-corner',name:'Reno and Walker / corner',eye:[-354,2.1,300],target:[-293,4.5,268],fov:58},
  {id:'reno-blocks',name:'Reno supporting blocks / elevated',eye:[-430,65,365],target:[-325,0,250],fov:53},
  {id:'curb-detail',name:'Reno and Walker / pavement detail',eye:[-337,1.1,293],target:[-332,0.20,280],fov:52},
];
const frusta=views.map(view=>{
  const camera=new THREE.PerspectiveCamera(view.fov,16/9,.1,6500);
  camera.position.fromArray(view.eye);camera.lookAt(...view.target);camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
});
fs.mkdirSync(output,{recursive:true});
const manifest={label,directory,seed:1907,views,materials:[],draws:[],stride:11,
  scope:'Actual production scene geometry, world/instance transforms, vertex colors, UVs and native Canvas color-map pixels. Fixed diagnostic Lambert shading and logarithmic depth. Excludes Three PBR, shadow maps, atmospheric sky, transparency, UI and gameplay; not a browser screenshot or FPS benchmark.'};
const materials=new Map(),textures=new Map();
function textureInfo(texture){
  if(!texture?.image?.getContext)return null;
  if(textures.has(texture.uuid))return textures.get(texture.uuid);
  const file=`texture-${textures.size}.png`;
  fs.writeFileSync(path.join(output,file),texture.image.toBuffer('image/png'));
  const entry={file,width:texture.image.width,height:texture.image.height,flipY:texture.flipY,
    wrapS:texture.wrapS,wrapT:texture.wrapT,repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),
    colorSpace:texture.colorSpace};
  textures.set(texture.uuid,entry);return entry;
}
function materialId(material){
  if(materials.has(material.uuid))return materials.get(material.uuid);
  const id=manifest.materials.length;
  materials.set(material.uuid,id);
  manifest.materials.push({id,name:material.name||material.type,color:material.color?.toArray()||[1,1,1],
    map:textureInfo(material.map),side:material.side,roughness:material.roughness??1,metalness:material.metalness??0,
    transparent:!!material.transparent,depthWrite:material.depthWrite,opacity:material.opacity??1});
  return id;
}
const p=new THREE.Vector3(),n=new THREE.Vector3(),c=new THREE.Color(),normalMatrix=new THREE.Matrix3();
const instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
const file=fs.openSync(path.join(output,'city.f32'),'w');let vertexCount=0,meshCount=0;
function mesh(object){
  if(!frusta.some(frustum=>!object.frustumCulled||frustum.intersectsObject(object)))return;
  const g=object.geometry,position=g.attributes.position,normal=g.attributes.normal,uv=g.attributes.uv,index=g.index;
  const colors=g.attributes.color,total=index?.count??position.count;
  const groups=Array.isArray(object.material)?g.groups:[{start:0,count:total,materialIndex:0}];
  const instances=object.isInstancedMesh?object.count:1;
  for(const group of groups){
    const material=Array.isArray(object.material)?object.material[group.materialIndex]:object.material;
    // Fully opaque paint participates even though Three draws it in its
    // transparent queue. Fade-controlled frames and translucent glass are
    // omitted: their onBeforeRender/view-dependent blending is outside scope.
    if(!material?.visible||material.opacity<1||(material.transparent&&!material.polygonOffset))continue;
    const start=Math.max(0,g.drawRange.start,group.start);
    const end=Math.min(total,g.drawRange.start+g.drawRange.count,group.start+group.count);
    if(end<=start)continue;
    const id=materialId(material),values=new Float32Array((end-start)*instances*11);
    let at=0;
    for(let j=0;j<instances;j++){
      if(object.isInstancedMesh){object.getMatrixAt(j,instance);matrix.multiplyMatrices(object.matrixWorld,instance);}
      else matrix.copy(object.matrixWorld);
      normalMatrix.getNormalMatrix(matrix);
      const color=object.instanceColor;
      for(let k=start;k<end;k++){
        const v=index?index.getX(k):k;
        p.fromBufferAttribute(position,v).applyMatrix4(matrix);
        if(normal)n.fromBufferAttribute(normal,v).applyMatrix3(normalMatrix).normalize();else n.set(0,1,0);
        c.setRGB(1,1,1);
        if(colors)c.fromBufferAttribute(colors,v);
        if(color)c.multiply(new THREE.Color().fromBufferAttribute(color,j));
        values.set([p.x,p.y,p.z,n.x,n.y,n.z,uv?.getX(v)||0,uv?.getY(v)||0,c.r,c.g,c.b],at);at+=11;
      }
    }
    fs.writeSync(file,Buffer.from(values.buffer));
    manifest.draws.push({name:object.name||object.type,material:id,start:vertexCount,count:values.length/11});
    vertexCount+=values.length/11;
  }
  meshCount++;
}
function walk(object){
  if(!object.visible)return;
  if(object.isMesh)mesh(object);
  for(const child of object.children)walk(child);
}
walk(scene);fs.closeSync(file);
manifest.geometry={vertices:vertexCount,triangles:vertexCount/3,meshes:meshCount,
  sha256:createHash('sha256').update(fs.readFileSync(path.join(output,'city.f32'))).digest('hex')};
manifest.sourceHashes=Object.fromEntries(['world-surfaces.js','world-meshes.js','world/facade-textures.js','world/streets.js']
  .map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,label,...manifest.geometry,materials:materials.size,textures:textures.size,draws:manifest.draws.length},null,2));
