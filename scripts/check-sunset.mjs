#!/usr/bin/env node
// Independent spherical-Earth visibility and actual material integration.
// This gate does not claim a browser render, measured weather, or GPU timing.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerThree} from './lib/register-three.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerThree(root);
const built=file=>pathToFileURL(path.join(root,'dist',file)).href;
const authored=file=>pathToFileURL(path.join(root,process.argv.includes('--source')?'src':'dist',file)).href;
const THREE=await import(built('vendor/three.module.js'));
const {horizonDip,solarDiscVisibility,apparentSolarAltitude,reflectedDirection}=await import(authored('atmosphere/solar.js'));
const {createSunlightBinding}=await import(authored('atmosphere/sunlight.js'));
const {createGlassMaterial}=await import(authored('sky.js'));

// Numerically shoot rays at a sphere from many points of a small solar disk.
// This oracle uses neither the production dip formula nor its circle-area formula.
function numericalDiscVisibility(height,altitude) {
  const earth=6371000,radius=.2666*Math.PI/180;
  let clear=0,total=0;
  for(let y=-100;y<=100;y++)for(let x=-100;x<=100;x++){
    if(x*x+y*y>10000)continue;
    const elevation=altitude+radius*y/100;
    const b=(earth+height)*Math.sin(elevation),c=height*(2*earth+height);
    const intersects=b<0&&b*b-c>=0;
    clear+=Number(!intersects);total++;
  }
  return clear/total;
}

let rayCases=0,maxRayDifference=0;
for(const height of [2,50,150,257.2,581])for(const degrees of [-1.1,-.76,-.59,-.415,-.245,0,.3]){
  const altitude=degrees*Math.PI/180;
  const analytic=solarDiscVisibility(height,altitude),numeric=numericalDiscVisibility(height,altitude);
  const difference=Math.abs(analytic-numeric);maxRayDifference=Math.max(maxRayDifference,difference);rayCases++;
  assert.ok(difference<.008,`${height}m ${degrees}° differs from ray/sphere oracle: ${difference}`);
}
assert.ok(Math.abs(horizonDip(257.2)*180/Math.PI-.514827817)<1e-8);
assert.equal(horizonDip(-2),0);
const sunset=apparentSolarAltitude(.63);
assert.equal(solarDiscVisibility(2,sunset),0,'Street must already have lost direct sun');
assert.ok(solarDiscVisibility(257.2,sunset)>.65,'Devon roof must still see the setting disk');
assert.equal(solarDiscVisibility(257.2,apparentSolarAltitude(.70)),0,'Roof cannot hold onto sun through late twilight');
for(const progress of [0,.18,.50,.62,.63,.64,.65,.70,.81,.97]) {
  let previous=-1;
  for(const height of [0,2,10,50,150,257.2,581]){
    const visibility=solarDiscVisibility(height,apparentSolarAltitude(progress));
    assert.ok(visibility>=previous&&visibility>=0&&visibility<=1);previous=visibility;
  }
}

// With a frozen sky, different facade heights and camera distances sample
// different elevations. Mirror directions also match Three's vector oracle.
const normal=[-1,0,0],camera=[-900,2,0];
const angles=[];
for(const height of [20,70,150,257.2]){
  const point=[0,height,0],direction=reflectedDirection(camera,point,normal);
  const expected=new THREE.Vector3(...point).sub(new THREE.Vector3(...camera)).normalize().reflect(new THREE.Vector3(...normal));
  assert.ok(new THREE.Vector3(...direction).distanceTo(expected)<1e-12);
  angles.push(Math.asin(direction[1])*180/Math.PI);
}
assert.ok(angles.every((angle,i)=>!i||angle>angles[i-1]));
assert.ok(angles[3]>15&&angles[3]<16);
assert.ok(reflectedDirection([-300,2,0],[0,70,0],normal)[1]>reflectedDirection(camera,[0,70,0],normal)[1]);

const shared={uSolarCenterAltitude:{value:sunset},uSunDirection:{value:new THREE.Vector3(-.94,Math.sin(sunset),.34).normalize()},uProgress:{value:.63},uNeutral:{value:0},uStyle:{value:0},uObserverHeight:{value:2}};
const glass=createGlassMaterial();glass.bindAtmosphere(shared);
const masonry=new THREE.MeshStandardMaterial();let priorHook=0;
masonry.onBeforeCompile=()=>{priorHook++;};
const scene=new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.BoxGeometry(),glass.material));
scene.add(new THREE.InstancedMesh(new THREE.BoxGeometry(),masonry,2));
scene.add(new THREE.Mesh(new THREE.BoxGeometry(),masonry));
scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
const bind=createSunlightBinding(shared);
assert.equal(bind(scene),2,'Bind each unique lit material exactly once');
assert.equal(bind(scene),0,'Repeated binding must not stack shader hooks');
for(const material of [glass.material,masonry]){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  const cacheKey=material.customProgramCacheKey();
  material.onBeforeCompile(shader,{});
  assert.equal(material.customProgramCacheKey(),cacheKey);
  assert.equal(shader.uniforms.uSolarCenterAltitude,shared.uSolarCenterAltitude);
  assert.equal(shader.uniforms.uSunDirection,shared.uSunDirection);
  assert.ok(shader.vertexShader.includes('prismSolarPosition=instanceMatrix*prismSolarPosition'));
  assert.ok(shader.vertexShader.includes('vPrismSolarHeight=(modelMatrix*prismSolarPosition).y'));
  assert.ok(shader.fragmentShader.includes('prismSolarVisibility(vPrismSolarHeight)'));
  if(material===glass.material){
    assert.equal(shader.uniforms.uProgress,shared.uProgress);
    assert.ok(shader.fragmentShader.includes('prismAltitudeCorrection(reflectVec,vPrismWorldPosition.y,roughness)'));
    assert.ok(shader.fragmentShader.includes('prismLocalReflection(envMapColor.rgb,reflectVec,roughness)'));
    assert.ok(!shader.fragmentShader.includes('outgoingLight+='),'No additive facade glow');
    assert.ok(!shader.fragmentShader.includes('uPrismNight'),'No synthetic office lights');
    assert.equal(material.emissive.getHex(),0);assert.equal(material.emissiveIntensity,0);
    assert.equal(material.envMapIntensity,1);assert.equal(material.iridescence,0);
  }
}
assert.equal(priorHook,1,'Existing hooks must survive sunlight binding');
console.log(JSON.stringify({passed:true,rayCases,maxRayDifference,horizonDipDegrees:horizonDip(257.2)*180/Math.PI,afterglowSunVisibility:{street:solarDiscVisibility(2,sunset),roof:solarDiscVisibility(257.2,sunset)},reflectionElevationsDegrees:angles,materialHooks:'shared uniforms, instancing, chained callbacks and zero facade emission'},null,2));
