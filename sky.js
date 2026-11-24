import * as THREE from 'three';

// A directional HDR sky study, not a measured weather or solar-ephemeris model.
// Linear radiance is shared by the visible sky and the infinite reflection map.
const skyGLSL = `
uniform float uProgress;
uniform float uSunDisk;
uniform float uStyle;
uniform float uNeutral;
uniform vec3 uSunDirection;
float sq(float x){return x*x;}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise21(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise21(p);p=mat2(1.61,1.23,-1.23,1.61)*p+2.7;a*=.48;}return v;}
vec3 skyRadiance(vec3 d){
 d=normalize(d);
 float h=max(d.y,0.);
 float dusk=smoothstep(.10,.65,uProgress);
 float late=smoothstep(.68,.98,uProgress);
 float golden=smoothstep(.035,.18,uProgress);
 vec3 zen=mix(vec3(.085,.215,.43),vec3(.027,.075,.17),dusk);
 zen=mix(zen,vec3(.003,.006,.017),late);
 vec3 horizon=mix(vec3(.47,.59,.72),vec3(.16,.19,.27),dusk);
 horizon=mix(horizon,vec3(.012,.019,.036),late);
 vec3 c=mix(horizon,zen,pow(h,.44));
 vec2 dh=normalize(d.xz+vec2(.00001));
 vec2 sh=normalize(uSunDirection.xz);
 float facing=max(dot(dh,sh),0.);
 float west=pow(facing,2.);
 float sunHeight=max(uSunDirection.y,.015);
 float warmHeight=mix(sunHeight,.035,dusk);
 float warmWidth=mix(.065,.14,dusk);
 float warm=exp(-sq((h-warmHeight)/warmWidth))*west*golden*(1.-late);
 vec3 amber=mix(vec3(2.7,1.55,.68),vec3(3.25,1.28,.42),dusk);
 c+=amber*warm;
 // Weak, broad afterglow. Its blue component remains lower than its red
 // component; this avoids the old saturated violet wash over the whole city.
 float pink=exp(-sq((h-.13)/.16))*pow(max(dot(dh,sh)*.5+.5,0.),2.);
 c+=vec3(.24,.085,.10)*pink*sin(clamp(uProgress,0.,1.)*3.14159)*(1.-late);
 vec2 cp=d.xz/(h+.19)*vec2(.65,1.35)+vec2(9.3,2.4);
 float f=fbm(cp*1.75);
 float feather=fbm(cp*vec2(.62,4.1)+5.2);
 float cloud=smoothstep(.56,.73,f*.72+feather*.28)*smoothstep(.015,.08,h)*(1.-smoothstep(.76,.98,h));
 float wisps=smoothstep(.70,.82,fbm(cp*vec2(.30,5.0)+18.))*smoothstep(.07,.25,h)*.3;
 cloud=clamp(cloud+wisps,0.,.74);
 float cloudSunlight=exp(-sq((h-.055)/.16));
 vec3 cc=mix(vec3(.72,.76,.80),vec3(.17,.18,.23),dusk);
 cc+=vec3(1.5,.65,.24)*west*golden*(1.-late)*cloudSunlight;
 cc=mix(cc,vec3(.009,.013,.024),late);
 c=mix(c,cc,cloud);
 // A soft broken western cloud bank gives reflection rays a recognizable
 // feature. No band or color is attached to the building's UV coordinates.
 float az=atan(d.z,d.x);
 float shelfHeight=.17+.048*sin(az*2.4+.7);
 float shelf=exp(-sq((h-shelfHeight)/.029));
 float shelfEdge=exp(-sq((h-shelfHeight+.030)/.017));
 float shelfBreak=smoothstep(.25,.8,noise21(d.xz*12.+vec2(4.,h*18.+4.)));
 float western=pow(facing,1.1)*golden*(1.-late);
 c=mix(c,vec3(.075,.10,.17),shelf*shelfBreak*western*.32);
 c+=vec3(.65,.26,.10)*shelfEdge*shelfBreak*western;
 float east=pow(max(-dot(dh,sh),0.),2.);
 c+=vec3(.12,.055,.05)*exp(-sq((h-.045)/.07))*east*dusk*(1.-late);
 float solar=exp((dot(d,uSunDirection)-1.)*52000.);
 c+=solar*vec3(30.,22.,13.)*uSunDisk*(1.-late)*smoothstep(-.003,.005,uSunDirection.y);
 // The radiance at y=0 already includes the directional afterglow. Carry
 // that same radiance below the horizon through a broad haze layer before
 // approaching the unresolved ground hemisphere. Replacing it immediately
 // with the neutral base horizon created a nonphysical peach/gray seam.
 // Actual buildings and roads still come from the separate geometry probe.
 if(d.y<0.) {
  vec3 lowerAmbient=mix(vec3(.12,.135,.14),vec3(.012,.014,.018),late);
  float hazeDepth=.145+.025*noise21(dh*3.1+vec2(7.2,4.6));
  c=mix(lowerAmbient,c,exp(d.y/hazeDepth));
 }
 vec2 starUV=vec2(atan(d.z,d.x)*210.,asin(clamp(d.y,-1.,1.))*210.);
 float star=step(.9988,hash21(floor(starUV)))*pow(max(0.,1.-length(fract(starUV)-.5)*2.),5.);
 c+=star*late*vec3(.45,.53,.65)*smoothstep(.05,.25,h);
 vec3 stylized=floor(c*14.+.5)/14.;
 c=mix(c,stylized,uStyle*.34);
 return mix(c,vec3(.35),uNeutral);
}
`;

function solarAltitude(progress) {
  const keys=[[0,.62],[.18,.15],[.45,.04],[.57,0],[.70,-.035],[1,-.16]];
  const p=THREE.MathUtils.clamp(progress,0,1);
  for(let i=1;i<keys.length;i++) if(p<=keys[i][0]) {
    const a=keys[i-1],b=keys[i];
    return THREE.MathUtils.lerp(a[1],b[1],(p-a[0])/(b[0]-a[0]));
  }
  return keys.at(-1)[1];
}

export function createAtmosphere(renderer, scene) {
  const uniforms={uProgress:{value:.63},uSunDisk:{value:1},uStyle:{value:0},uNeutral:{value:0},uSunDirection:{value:new THREE.Vector3(-.94,.02,.34).normalize()}};
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 vDir;\n#include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);\n#include <logdepthbuf_vertex>\n}`,
    fragmentShader:`varying vec3 vDir;\n#include <logdepthbuf_pars_fragment>\n${skyGLSL}void main(){gl_FragColor=vec4(skyRadiance(vDir),1.);\n#include <logdepthbuf_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
  const sky=new THREE.Object3D();
  const sunDisc=new THREE.Mesh(new THREE.CircleGeometry(28,32),new THREE.MeshBasicMaterial({color:new THREE.Color(25,18,10),depthWrite:false,fog:false}));
  sunDisc.renderOrder=-100;sunDisc.frustumCulled=false;scene.add(sunDisc);
  const captureScene=new THREE.Scene();
  const captureMat=mat.clone();captureMat.uniforms={...uniforms,uSunDisk:{value:0}};
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
    const altitude=solarAltitude(progress);
    uniforms.uSunDirection.value.set(-.94,altitude,.34).normalize();
    const night=THREE.MathUtils.smoothstep(progress,.72,.99);
    const dusk=THREE.MathUtils.smoothstep(progress,.1,.65);
    sun.position.copy(uniforms.uSunDirection.value).multiplyScalar(1800).add(sun.target.position);
    sun.intensity=neutral?0:3.45*THREE.MathUtils.smoothstep(altitude,0,.09)*(1-night);
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
    scene.background=envTarget.texture;scene.backgroundBlurriness=0;
    sunDisc.visible=!neutral&&altitude>-.004;
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
    const hidden=[...new Set([...exclude,sunDisc])].filter(Boolean).map(object=>[object,object.visible]);
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
    update,uniforms,sun,fill,sky,sunDisc,captureLocalReflection,setQuality,prepareShadows,
    night:p=>THREE.MathUtils.smoothstep(p,.72,.99),
    follow:camera=>{sky.position.copy(camera.position);sunDisc.position.copy(camera.position).addScaledVector(uniforms.uSunDirection.value,6000);sunDisc.lookAt(camera.position);}
  };
}

const localReflectionGLSL=`
uniform samplerCube uPrismLocalMap;
uniform vec3 uPrismProbePosition;
uniform vec3 uPrismBoxMin;
uniform vec3 uPrismBoxMax;
uniform float uPrismLocalStrength;
varying vec3 vPrismWorldPosition;
float prismOfficeHash(vec2 p){return fract(sin(dot(p,vec2(23.71,91.43)))*43758.5453);}
// Exact box-filtered coverage of a repeated horizontal window opening.
// Unlike fract/step, this converges smoothly as a floor becomes subpixel.
float prismWindowIntegral(float x){return floor(x)*.57+clamp(fract(x)-.23,0.,.57);}
float prismOfficeCoverage(vec2 cell,vec2 pixelWidth){
 vec2 bank=cell/vec2(7.,3.);
 vec2 footprint=clamp(pixelWidth/vec2(7.,3.),vec2(.0001),vec2(1.));
 vec2 lower=bank-footprint*.5;
 vec2 upper=bank+footprint*.5;
 vec2 base=floor(lower);
 float occupied=0.;
 // Shared tenant banks keep adjacent rooms/floors related. Integrate the
 // pixel's overlap with neighboring banks instead of sampling a random bit.
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 id=base+vec2(float(x),float(y));
  vec2 coverage=max(vec2(0.),min(upper,id+1.)-max(lower,id))/footprint;
  float tenant=step(.72,prismOfficeHash(id+vec2(3.1,5.9)));
  float brightness=mix(.72,1.,prismOfficeHash(id+vec2(13.2,1.7)));
  occupied+=coverage.x*coverage.y*tenant*brightness;
 }
 float halfPixel=pixelWidth.y*.5;
 float opening=(prismWindowIntegral(cell.y+halfPixel)-prismWindowIntegral(cell.y-halfPixel))/pixelWidth.y;
 float resolved=1.-smoothstep(.65,1.8,max(pixelWidth.y,pixelWidth.x/7.));
 return occupied*clamp(opening,0.,1.)*resolved;
}
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
 const u={style:{value:0},night:{value:0},reflection:{value:1},localMap:{value:null},probePosition:{value:new THREE.Vector3()},boxMin:{value:new THREE.Vector3()},boxMax:{value:new THREE.Vector3()},localStrength:{value:0}};
 // This effective coated-glass approximation is art-calibrated, not measured
 // Devon coating data. A separate local probe supplies nearby city reflections.
 const material=new THREE.MeshPhysicalMaterial({color:0x8da6b4,metalness:.72,roughness:.055,ior:1.52,clearcoat:.22,clearcoatRoughness:.035,envMapIntensity:1.05});
 material.onBeforeCompile=shader=>{
  shader.uniforms.uPrismStyle=u.style;shader.uniforms.uPrismNight=u.night;shader.uniforms.uPrismReflection=u.reflection;
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
  shader.fragmentShader='uniform float uPrismStyle;uniform float uPrismNight;uniform float uPrismReflection;varying vec2 vFacadeUv;\n'+localReflectionGLSL+shader.fragmentShader;
  const environmentChunk=THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );\nenvMapColor.rgb=prismLocalReflection(envMapColor.rgb,reflectVec,roughness);'
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
    outgoingLight*=uPrismReflection;
    float ndv=clamp(dot(normal,geometryViewDir),0.,1.);
    vec3 illustrated=floor(pow(max(outgoingLight,vec3(0.)),vec3(.85))*7.+.5)/7.;
    illustrated*=mix(.28,1.,smoothstep(.035,.20,ndv));
    outgoingLight=mix(outgoingLight,illustrated,uPrismStyle);
    float litRoom=prismOfficeCoverage(facadeCell,pixelWidth)*(1.-frame);
    outgoingLight+=vec3(.105,.093,.072)*litRoom*uPrismNight;
    #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'prism-facade-twin-v2';
 function setLocalReflection(texture,{position,boxMin,boxMax,strength=.85}) {
   u.localMap.value=texture;u.probePosition.value.copy(position);u.boxMin.value.copy(boxMin);u.boxMax.value.copy(boxMax);u.localStrength.value=THREE.MathUtils.clamp(strength,0,1);
 }
 function clearLocalReflection(){u.localStrength.value=0;}
 return {material,uniforms:u,setLocalReflection,clearLocalReflection};
}
