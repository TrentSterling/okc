import * as THREE from 'three';
import {skyGLSL} from './radiance.js';

const localReflectionGLSL=`
uniform samplerCube uPrismLocalMap;
uniform vec3 uPrismProbePosition;
uniform vec3 uPrismBoxMin;
uniform vec3 uPrismBoxMax;
uniform float uPrismLocalStrength;
varying vec3 vPrismWorldPosition;
vec3 prismLocalReflection(vec3 skyColor,vec3 direction,float roughness){
 if(uPrismLocalStrength<.001)return skyColor;
 vec3 inside=step(uPrismBoxMin+vec3(.001),vPrismWorldPosition)*step(vPrismWorldPosition,uPrismBoxMax-vec3(.001));
 if(inside.x*inside.y*inside.z<.5)return skyColor;
 vec3 signs=mix(vec3(-1.),vec3(1.),step(vec3(0.),direction));
 vec3 safeDirection=signs*max(abs(direction),vec3(.0001));
 vec3 farPlanes=max((uPrismBoxMin-vPrismWorldPosition)/safeDirection,(uPrismBoxMax-vPrismWorldPosition)/safeDirection);
 float distanceToBox=min(farPlanes.x,min(farPlanes.y,farPlanes.z));
 vec3 projectedDirection=vPrismWorldPosition+direction*distanceToBox-uPrismProbePosition;
 vec4 local=textureCube(uPrismLocalMap,normalize(projectedDirection),clamp(roughness*6.,0.,5.));
 float coverage=clamp(local.a,0.,1.);
 vec3 coveredColor=local.rgb/max(coverage,.001);
 return mix(skyColor,coveredColor,coverage*uPrismLocalStrength);
}
`;

export function createGlassMaterial(){
 const sky={uProgress:{value:.63},uSunDisk:{value:0},uStyle:{value:0},uNeutral:{value:0},uObserverHeight:{value:0},uSolarCenterAltitude:{value:-.006},uSunDirection:{value:new THREE.Vector3(-.94,-.006,.34).normalize()}};
 const u={style:{value:0},night:{value:0},reflection:{value:1},localMap:{value:null},probePosition:{value:new THREE.Vector3()},boxMin:{value:new THREE.Vector3()},boxMax:{value:new THREE.Vector3()},localStrength:{value:0}};
 // This effective coated-glass approximation is art-calibrated, not measured
 // Devon coating data. A separate local probe supplies nearby city reflections.
 const material=new THREE.MeshPhysicalMaterial({color:0xc0c3c6,metalness:.82,roughness:.055,ior:1.52,clearcoat:.22,clearcoatRoughness:.035,envMapIntensity:1,emissive:0x000000,emissiveIntensity:0});
 material.name='Neutral coated Devon glass, reflected light only';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,sky);
  shader.uniforms.uPrismStyle=u.style;
  shader.uniforms.uPrismLocalMap=u.localMap;shader.uniforms.uPrismProbePosition=u.probePosition;shader.uniforms.uPrismBoxMin=u.boxMin;shader.uniforms.uPrismBoxMax=u.boxMax;shader.uniforms.uPrismLocalStrength=u.localStrength;
  shader.vertexShader='varying vec2 vFacadeUv;\nvarying vec3 vPrismWorldPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvFacadeUv=uv;');
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    vec4 prismWorldPosition=vec4(transformed,1.0);
    #ifdef USE_BATCHING
      prismWorldPosition=batchingMatrix*prismWorldPosition;
    #endif
    #ifdef USE_INSTANCING
      prismWorldPosition=instanceMatrix*prismWorldPosition;
    #endif
    vPrismWorldPosition=(modelMatrix*prismWorldPosition).xyz;
  `);
  shader.fragmentShader='uniform float uPrismStyle;varying vec2 vFacadeUv;\n'+skyGLSL+localReflectionGLSL+shader.fragmentShader;
  const environmentChunk=THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\nenvMapColor.rgb=max(vec3(0.),envMapColor.rgb+prismAltitudeCorrection(reflectVec,vPrismWorldPosition.y,roughness));\nenvMapColor.rgb=prismLocalReflection(envMapColor.rgb,reflectVec,roughness);'
  );
  shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',environmentChunk);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 facadeCell=vFacadeUv/vec2(1.524,4.2);
    vec2 gridDist=abs(fract(facadeCell-.5)-.5);
    vec2 pixelWidth=max(fwidth(facadeCell),vec2(.0001));
    vec2 mullionHalfWidth=vec2(.020,.012);
    vec2 coverage=clamp((min(gridDist+pixelWidth*.5,mullionHalfWidth)-max(gridDist-pixelWidth*.5,-mullionHalfWidth))/pixelWidth,0.,1.);
    coverage=mix(coverage,mullionHalfWidth*2.,smoothstep(vec2(.45),vec2(1.),pixelWidth));
    float frame=max(coverage.x,coverage.y);
    float floorBand=1.-smoothstep(.035,.080,abs(fract(facadeCell.y)-.13));
    float glassNoise=fract(sin(dot(floor(facadeCell),vec2(12.9898,78.233)))*43758.5453);
    float paneDetail=1.-smoothstep(.45,1.2,max(pixelWidth.x,pixelWidth.y));
    diffuseColor.rgb*=1.+(glassNoise-.5)*.025*paneDetail;
    diffuseColor.rgb*=1.-floorBand*.10;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.46,.48),frame*.72);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.28,frame*.7);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
    float ndv=clamp(dot(normal,geometryViewDir),0.,1.);
    vec3 illustrated=floor(pow(max(outgoingLight,vec3(0.)),vec3(.85))*7.+.5)/7.;
    illustrated*=mix(.28,1.,smoothstep(.035,.20,ndv));
    outgoingLight=mix(outgoingLight,illustrated,uPrismStyle);
    #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'prism-height-reflection-v3';
 function bindAtmosphere(uniforms) {
   for(const key of Object.keys(sky))if(uniforms[key])sky[key]=uniforms[key];
   // The solar disk's shadowed specular is provided by the directional sun,
   // not added again as an unshadowed environment contribution.
   sky.uSunDisk={value:0};
   material.needsUpdate=true;
 }
 function setLocalReflection(texture,{position,boxMin,boxMax,strength=.85}) {
   u.localMap.value=texture;u.probePosition.value.copy(position);u.boxMin.value.copy(boxMin);u.boxMax.value.copy(boxMax);u.localStrength.value=THREE.MathUtils.clamp(strength,0,1);
 }
 function clearLocalReflection(){u.localStrength.value=0;}
 return {material,uniforms:u,setLocalReflection,clearLocalReflection,bindAtmosphere};
}
