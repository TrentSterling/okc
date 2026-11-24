import * as THREE from 'three';

import {skyGLSL} from './atmosphere/radiance.js';
import {apparentSolarAltitude, solarDiscVisibility} from './atmosphere/solar.js';
import {createSunlightBinding} from './atmosphere/sunlight.js';
export {createGlassMaterial} from './atmosphere/glass.js';

export function createAtmosphere(renderer, scene) {
  const uniforms={uProgress:{value:.63},uSunDisk:{value:1},uStyle:{value:0},uNeutral:{value:0},uObserverHeight:{value:2},uSolarCenterAltitude:{value:apparentSolarAltitude(.63)},uSunDirection:{value:new THREE.Vector3(-.94,.02,.34).normalize()}};
  const bindSunlight=createSunlightBinding(uniforms);
  const bindGlass=glass=>glass.bindAtmosphere(uniforms);
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 vDir;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader:`varying vec3 vDir;\n#include <logdepthbuf_pars_fragment>\n${skyGLSL}void main(){gl_FragColor=vec4(skyRadiance(vDir,uObserverHeight),1.);\n#include <logdepthbuf_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,24,14),mat);
  sky.name='Shared height-aware western sky';sky.renderOrder=-1000;sky.frustumCulled=false;sky.scale.setScalar(6000);scene.add(sky);
  // Kept as a public scene handle for existing exclusion lists. The visible
  // solar disk now belongs to the sky shader, including its clipped horizon.
  const sunDisc=new THREE.Object3D();sunDisc.name='Solar disk (rendered in shared sky)';sunDisc.visible=false;
  const captureScene=new THREE.Scene();
  const captureMat=mat.clone();captureMat.uniforms={...uniforms,uSunDisk:{value:0},uObserverHeight:{value:0}};
  captureScene.add(new THREE.Mesh(new THREE.SphereGeometry(8000,24,14),captureMat));
  const pmrem=new THREE.PMREMGenerator(renderer);
  let envTarget=null,lastUpdate=-999,lastProgress=-1,lastStyle=-1,lastNeutral=-1,revision=0;
  const sun=new THREE.DirectionalLight(0xffe4bd,2.4);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-650,right:650,top:650,bottom:-650,near:20,far:4200});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=renderer.capabilities.reversedDepthBuffer?.00008:-.00008;sun.shadow.normalBias=.20;sun.shadow.radius=2;
  sun.target.position.set(0,70,0);scene.add(sun);scene.add(sun.target);
  const fill=new THREE.HemisphereLight(0xaabacb,0x646365,.55);scene.add(fill);
  const fog=new THREE.FogExp2(0x8894a4,.00018);scene.fog=fog;
  // The city is static. Refresh shadows when something moves or the sun
  // changes, rather than redrawing the complete map at the display's rate.
  let shadowQuality='high',shadowDirty=true,lastShadowFrame=-Infinity;
  renderer.shadowMap.autoUpdate=false;
  function setQuality(quality) {
    shadowQuality=quality;
    renderer.shadowMap.enabled=quality!=='low';
    const size=quality==='high'?2048:1024;
    if(sun.shadow.mapSize.x!==size){
      sun.shadow.map?.dispose();sun.shadow.map=null;
      sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;
      sun.shadow.mapSize.set(size,size);
    }
    shadowDirty=true;
  }
  function prepareShadows(focus,now=performance.now(),moving=true,force=false) {
    if(!renderer.shadowMap.enabled||sun.intensity<=.001)return;
    if(focus){
      // A snapped light volume keeps nearby streets covered during free drive
      // without letting tiny camera movements continually shift the shadows.
      const x=Math.round(focus.x/32)*32,z=Math.round(focus.z/32)*32;
      if(sun.target.position.x!==x||sun.target.position.z!==z){
        sun.target.position.set(x,70,z);
        sun.position.copy(uniforms.uSunDirection.value).multiplyScalar(1800).add(sun.target.position);
        shadowDirty=true;
      }
    }
    const interval=1000/(shadowQuality==='high'?30:20);
    if(force||shadowDirty||(moving&&now-lastShadowFrame>=interval)){
      renderer.shadowMap.needsUpdate=true;lastShadowFrame=now;shadowDirty=false;
    }
  }

  function update(progress,style=0,force=false,now=performance.now(),neutral=false){
    if(!force&&now-lastUpdate<160)return false;
    if(!force&&Math.abs(lastProgress-progress)<.001&&lastStyle===style&&lastNeutral===neutral)return false;
    lastUpdate=now;lastProgress=progress;lastStyle=style;lastNeutral=neutral;
    uniforms.uProgress.value=progress;uniforms.uStyle.value=style;uniforms.uNeutral.value=neutral?1:0;
    const altitude=apparentSolarAltitude(progress);
    uniforms.uSolarCenterAltitude.value=altitude;
    const horizontal=Math.hypot(.94,.34);
    uniforms.uSunDirection.value.set(-.94/horizontal*Math.cos(altitude),Math.sin(altitude),.34/horizontal*Math.cos(altitude));
    const night=THREE.MathUtils.smoothstep(progress,.72,.99);
    const dusk=THREE.MathUtils.smoothstep(progress,.1,.65);
    sun.position.copy(uniforms.uSunDirection.value).multiplyScalar(1800).add(sun.target.position);
    // Keep the source alive while any modeled elevation can see it. Each
    // surface receives only its own unoccluded fraction in bindSunlight.
    const airTransmission=Math.exp(-.12/(Math.max(Math.sin(altitude),0)+.10));
    sun.intensity=neutral?0:3.45*airTransmission*solarDiscVisibility(1200,altitude)*(1-night);
    sun.color.setRGB(1,THREE.MathUtils.lerp(.95,.60,dusk),THREE.MathUtils.lerp(.84,.36,dusk));
    // Cooler skylight against restrained warm ground bounce keeps masonry,
    // blue glazing and greenery distinct without crushing the shaded street.
    fill.intensity=neutral?.65:THREE.MathUtils.lerp(THREE.MathUtils.lerp(.62,.64,dusk),.28,night);
    fill.color.set(neutral?0xffffff:0xa5bad5);fill.groundColor.set(neutral?0x777777:0x71665b);
    fog.color.setRGB(THREE.MathUtils.lerp(THREE.MathUtils.lerp(.43,.18,dusk),.012,night),THREE.MathUtils.lerp(THREE.MathUtils.lerp(.50,.20,dusk),.020,night),THREE.MathUtils.lerp(THREE.MathUtils.lerp(.59,.27,dusk),.038,night));
    fog.density=neutral?.00012:THREE.MathUtils.lerp(THREE.MathUtils.lerp(.00020,.00023,dusk),.00016,night);
    if(neutral)fog.color.setRGB(.35,.35,.35);
    const old=envTarget;
    envTarget=pmrem.fromScene(captureScene,0,.1,20000,{size:256});
    scene.environment=envTarget.texture;
    scene.background=null;scene.backgroundBlurriness=0;
    if(old)old.dispose();
    shadowDirty=true;
    revision++;
    return true;
  }

  // Local geometry is captured separately against transparent black. Alpha is
  // coverage, not sky opacity. The facade shader unpremultiplies filtered RGB
  // before blending over the infinite sky. Thus a box never warps that sky.
  // One box is only an approximation to city depth; this is not ray tracing.
  let localTarget=null,localCamera=null,localRevision=-1,localSize=0;
  function captureLocalReflection({glass,exclude=[],position=new THREE.Vector3(0,105,0),boxMin=new THREE.Vector3(-650,0,-700),boxMax=new THREE.Vector3(650,350,500),size=256,strength=.85,force=false}={}) {
    if(!glass?.setLocalReflection) return false;
    if(uniforms.uNeutral.value>.5){glass.clearLocalReflection();localRevision=-1;return false;}
    if(!force&&localTarget&&localRevision===revision&&localSize===size)return false;
    if(!localTarget||localSize!==size){
      if(localTarget)localTarget.dispose();
      localTarget=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
      localTarget.texture.colorSpace=THREE.LinearSRGBColorSpace;
      localTarget.texture.name='Devon local city reflection with coverage';
      localCamera=new THREE.CubeCamera(.5,2800,localTarget);localSize=size;
    }
    localCamera.position.copy(position);
    const background=scene.background;
    const saved={
      target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
      viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),
      clearColor:renderer.getClearColor(new THREE.Color()),clearAlpha:renderer.getClearAlpha(),
      autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,
      toneMapping:renderer.toneMapping,xrEnabled:renderer.xr.enabled,shadowAuto:renderer.shadowMap.autoUpdate
    };
    const hidden=[...new Set([...exclude,sunDisc,sky])].filter(Boolean).map(object=>[object,object.visible]);
    try {
      hidden.forEach(([object])=>{object.visible=false;});
      scene.background=null;renderer.setClearColor(0x000000,0);renderer.autoClear=true;
      renderer.autoClearColor=true;renderer.autoClearDepth=true;renderer.autoClearStencil=true;renderer.setScissorTest(false);
      // Directional shadows are camera-independent. Render their map once,
      // rather than six times for the six cubemap faces.
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      scene.updateMatrixWorld(true);localCamera.update(renderer,scene);
      glass.setLocalReflection(localTarget.texture,{position,boxMin,boxMax,strength});
      localRevision=revision;
    } finally {
      hidden.forEach(([object,visible])=>{object.visible=visible;});
      scene.background=background;
      // CubeCamera normally restores its own target, but this helper is the
      // boundary between a six-view offscreen pass and a user photograph.
      // Explicitly rebind the caller's complete raster state, including when
      // first-use material / shadow setup took place during a cube face.
      renderer.resetState();
      renderer.setClearColor(saved.clearColor,saved.clearAlpha);
      renderer.autoClear=saved.autoClear;renderer.autoClearColor=saved.autoClearColor;renderer.autoClearDepth=saved.autoClearDepth;renderer.autoClearStencil=saved.autoClearStencil;
      renderer.toneMapping=saved.toneMapping;renderer.xr.enabled=saved.xrEnabled;
      renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);
      renderer.setRenderTarget(saved.target,saved.face,saved.mip);
      renderer.shadowMap.autoUpdate=saved.shadowAuto;
      // The local pass excluded the reflective tower. Its restored shadow
      // must be included in the next main-camera draw, even with cached maps.
      renderer.shadowMap.needsUpdate=true;
    }
    return true;
  }
  return {
    update,uniforms,sun,fill,sky,sunDisc,captureLocalReflection,setQuality,prepareShadows,bindSunlight,bindGlass,
    night:p=>THREE.MathUtils.smoothstep(p,.72,.99),
    follow:camera=>{sky.position.copy(camera.position);sky.scale.setScalar(Math.min(6000,camera.far*.85));uniforms.uObserverHeight.value=Math.max(0,camera.position.y);}
  };
}
