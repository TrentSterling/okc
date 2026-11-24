import * as THREE from 'three';
import {createWorld,createCar} from './world.js';
import {createDevon,createLegends} from './tower.js';
import {createAtmosphere,createGlassMaterial} from './sky.js';
import {SHOT_BY_ID} from './capture-presets.js';
import {createDrivingWorld,createDrivingState,advanceDriving,isDrivingPoseClear,nearestRoadPose,snapshotDriving,cameraBoomFraction} from './driving.js';

const $=id=>document.getElementById(id);
const clamp=THREE.MathUtils.clamp;
const defaults={progress:.63,style:0,roughness:.055,exposure:1.08,route:.392,direction:1,lane:-1.75,speed:0,driving:false,driveMode:'scenic',cruise:true,sunPlaying:false,camera:'chase',screen:false,legends:false,traffic:true,sound:false,quality:'high',neutral:false};
let state={...defaults};
let renderer,scene,camera,world,devon,legends,atmosphere,glass,player;
let simTime=0,lastTime=performance.now(),lastEnvironment=0,frameCount=0,fpsTime=performance.now(),toastTimer;
let actualLane=-1.75,lookYaw=0,lookPitch=0,orbitYaw=2.25,orbitPitch=.19,orbitDistance=650,firstCamera=true;
let orbitFocus=null,viewFov=null;
let drag=null,hudVisible=true,prevNight=-1,audioContext=null,audioGain=null,engineOsc=null,noiseGain=null;
const keys=new Set();
const touchInputs=new Map();
let drivingWorld,freeCar,lastCollisionToast=-10000;
const vUp=new THREE.Vector3(0,1,0),desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),carPosition=new THREE.Vector3();
let cockpit,steeringWheel;
let capturing=false,captureRestore=null;
let localReflectionOptions=null,lastLocalReflection=-10000;

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function fail(error){console.error(error);$('loading').hidden=true;$('errorPanel').hidden=false;$('errorPanel').querySelector('p').textContent='The scene could not start. '+(error?.message||'Check that WebGL2 is available and reload.');}

async function init(){
 const canvas=$('scene');
 const contextOptions={antialias:true,alpha:false,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false};
 const context=canvas.getContext('webgl2',contextOptions);
 if(!context)throw new Error('WebGL2 is unavailable. Enable hardware acceleration in your browser, then reload.');
 const reversedDepth=!!context.getExtension('EXT_clip_control');
 renderer=new THREE.WebGLRenderer({canvas,context,...contextOptions,reversedDepthBuffer:reversedDepth,logarithmicDepthBuffer:!reversedDepth});
 canvas.dataset.depthMode=reversedDepth?'reversed':'logarithmic';
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=state.exposure;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.debug.onShaderError=(gl,program,vs,fs)=>{console.error(gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));throw new Error('This graphics driver could not compile a scene shader. Enable hardware acceleration or try another WebGL2-capable browser.');};
 renderer.setClearColor(0x192235);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.5,7500);scene.add(camera);
 $('loadingStatus').textContent='Building the skyline…';
 glass=createGlassMaterial();
 atmosphere=createAtmosphere(renderer,scene);
 world=createWorld({scene,glassMaterial:glass.material,seed:1907});
 drivingWorld=createDrivingWorld(world.drivingSolids,world.drivingBounds);
 devon=createDevon({glassMaterial:glass.material});scene.add(devon.group);
 legends=createLegends({glassMaterial:glass.material});legends.group.position.set(690,0,-280);legends.group.visible=false;scene.add(legends.group);
 player=createCar('sedan',0xc79956);scene.add(player);
 makeCockpit();
 // Reverse depth reverses the sign of a decal's depth bias too. Keep only
 // intentional paint/screen overlays biased; building shells are separated
 // geometrically by the offline compiler.
 if(reversedDepth){const seen=new Set();scene.traverse(object=>{
   for(const material of (Array.isArray(object.material)?object.material:[object.material])){
     if(!material||seen.has(material))continue;seen.add(material);
     if(material.polygonOffset){material.polygonOffsetFactor*=-1;material.polygonOffsetUnits*=-1;}
   }
 });}
 localReflectionOptions={glass,exclude:[devon.group,legends.group,player,cockpit],position:new THREE.Vector3(0,105,0),boxMin:new THREE.Vector3(-650,0,-700),boxMax:new THREE.Vector3(650,350,500),size:256,strength:.85};
 bindControls();resize();
 $('loadingStatus').textContent='Catching the western sky…';
 const viewId=typeof location==='undefined'?null:new URLSearchParams(location.search).get('view');
 if(viewId&&SHOT_BY_ID.has(viewId))applyCapturePreset(SHOT_BY_ID.get(viewId));
 else {atmosphere.update(state.progress,state.style,true);updateCamera(.016);syncUI();}
 refreshLocalReflection(true);
 renderer.render(scene,camera);
 $('loading').hidden=true;
 // Do not include asset construction and first-use shader compilation in FPS.
 fpsTime=lastTime=performance.now();frameCount=0;
 requestAnimationFrame(frame);
 setTimeout(()=>toast('Take the scenic cruise, or choose Drive yourself.'),650);
}

function makeCockpit(){
 cockpit=new THREE.Group();camera.add(cockpit);cockpit.visible=false;
 const dashMat=new THREE.MeshStandardMaterial({color:0x111419,roughness:.9});
 const dash=new THREE.Mesh(new THREE.BoxGeometry(2.6,.24,.75),dashMat);dash.position.set(0,-.60,-.8);dash.rotation.x=.06;cockpit.add(dash);
 const hood=new THREE.Mesh(new THREE.BoxGeometry(2.0,.065,1.25),new THREE.MeshStandardMaterial({color:0x9b7648,metalness:.5,roughness:.3}));hood.position.set(0,-.58,-1.52);cockpit.add(hood);
 steeringWheel=new THREE.Group();steeringWheel.position.set(-.40,-.48,-.63);steeringWheel.rotation.x=-.3;
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.20,.021,7,40),dashMat);steeringWheel.add(rim);
 for(let i=0;i<3;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(.16,.023,.024),new THREE.MeshStandardMaterial({color:0x333842,metalness:.5,roughness:.3}));sp.rotation.z=i*Math.PI*2/3;sp.position.set(Math.cos(sp.rotation.z)*.08,Math.sin(sp.rotation.z)*.08,0);steeringWheel.add(sp);}
 const center=new THREE.Mesh(new THREE.CylinderGeometry(.047,.047,.035,16),dashMat);center.rotation.x=Math.PI/2;steeringWheel.add(center);cockpit.add(steeringWheel);
 const gaugeCanvas=document.createElement('canvas');gaugeCanvas.width=512;gaugeCanvas.height=128;const g=gaugeCanvas.getContext('2d');g.fillStyle='#0c1015';g.fillRect(0,0,512,128);g.strokeStyle='#eab36e';g.lineWidth=4;
 for(let x=40;x<480;x+=20){g.beginPath();g.moveTo(x,92);g.lineTo(x,72-(x%40===0?16:0));g.stroke();}
 g.fillStyle='#dfc19c';g.font='22px sans-serif';g.fillText('P R A I R I E',175,35);
 const gauges=new THREE.Mesh(new THREE.PlaneGeometry(.63,.16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(gaugeCanvas),toneMapped:false}));gauges.position.set(-.36,-.49,-.97);cockpit.add(gauges);
 for(let s of [-1,1]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.035,1.7,.035),dashMat);pillar.position.set(s*.95,.02,-1.05);pillar.rotation.z=-s*.20;cockpit.add(pillar);}
}

function setCamera(mode){$('studyView').value='';state.camera=mode;lookYaw=0;lookPitch=0;orbitFocus=null;viewFov=null;firstCamera=true;syncUI();}
function refreshLocalReflection(immediate=false,now=performance.now()){
 if(state.quality==='low'){glass.clearLocalReflection();return;}
 if(!localReflectionOptions||(!immediate&&now-lastLocalReflection<750))return;
 localReflectionOptions.size=state.quality==='high'?256:128;
 localReflectionOptions.force=immediate;
 if(atmosphere.captureLocalReflection(localReflectionOptions))lastLocalReflection=now;
}
function updateCamera(dt){
 const free=state.driveMode==='free'&&freeCar;
 const laneOffset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;
 if(free)carPosition.set(freeCar.x,.14,freeCar.z);
 else carPosition.copy(world.getRoutePoint(state.route,laneOffset));
 const tangent=free?new THREE.Vector3(Math.cos(freeCar.heading),0,Math.sin(freeCar.heading)):world.getRouteTangent(state.route).multiplyScalar(state.direction);
 player.position.copy(carPosition);player.rotation.y=-Math.atan2(tangent.z,tangent.x);player.visible=state.camera!=='driver';
 cockpit.visible=state.camera==='driver';
 const perpendicular=new THREE.Vector3(-tangent.z,0,tangent.x);
 if(state.camera==='orbit'){
   const focus=free?carPosition.clone().add(new THREE.Vector3(0,1,0)):orbitFocus?new THREE.Vector3(...orbitFocus):new THREE.Vector3(state.legends?190:0,state.legends?200:118,state.legends?-65:0);
   const r=free?clamp(orbitDistance*.09,16,90):orbitDistance*(state.legends?1.35:1);
   desiredPosition.set(focus.x+Math.cos(orbitYaw)*r,focus.y+Math.sin(orbitPitch)*r,focus.z+Math.sin(orbitYaw)*r);
   desiredPosition.y=Math.max(1.7,desiredPosition.y);
   desiredTarget.copy(focus);
 }else{
   if(state.camera==='driver'){
     desiredPosition.copy(carPosition).addScaledVector(tangent,.50).add(new THREE.Vector3(0,1.46,0));
     desiredTarget.copy(desiredPosition).addScaledVector(tangent,180).add(new THREE.Vector3(0,4,0));
   }else{
     desiredPosition.copy(carPosition).addScaledVector(tangent,free?-10:-15).addScaledVector(perpendicular,free?0:2).add(new THREE.Vector3(0,free?4.4:3.2,0));
     desiredTarget.copy(carPosition).addScaledVector(tangent,free?28:110).add(new THREE.Vector3(0,free?1.2:15,0));
     // The scenic chase camera gently keeps the landmark in the composition.
     if(!free){const near=1-THREE.MathUtils.smoothstep(Math.abs(carPosition.x),400,1900);desiredTarget.lerp(new THREE.Vector3(0,78,0),.32+near*.18);}
   }
   const dir=desiredTarget.clone().sub(desiredPosition).normalize();
   dir.applyAxisAngle(vUp,lookYaw);
   const right=new THREE.Vector3().crossVectors(dir,vUp).normalize();dir.applyAxisAngle(right,lookPitch);
   desiredTarget.copy(desiredPosition).addScaledVector(dir,300);
 }
 if(free&&state.camera==='chase'){
   const anchor=carPosition.clone().add(new THREE.Vector3(0,1.6,0));
   desiredPosition.lerpVectors(anchor,desiredPosition,cameraBoomFraction(drivingWorld,anchor,desiredPosition));
 }
 camera.position.lerp(desiredPosition,firstCamera||free&&state.camera==='driver'?1:1-Math.exp(-dt*(free?11:7)));
 if(free&&state.camera==='chase'){
   const anchor=carPosition.clone().add(new THREE.Vector3(0,1.6,0));
   camera.position.lerpVectors(anchor,camera.position,cameraBoomFraction(drivingWorld,anchor,camera.position));
 }
 camera.lookAt(desiredTarget);
 if(steeringWheel)steeringWheel.rotation.z=free?-freeCar.steering*.8:(state.lane-actualLane)*-.12;
 camera.near=state.camera==='driver'?.25:state.camera==='orbit'?.75:.5;camera.far=7500;camera.fov=viewFov||(state.camera==='driver'?56:state.camera==='orbit'?44:48);camera.updateProjectionMatrix();firstCamera=false;
 atmosphere.follow(camera);
}

function frame(now){
 if(capturing){lastTime=now;requestAnimationFrame(frame);return;}
 const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;simTime+=dt;
 if(state.driveMode==='free'){
   const held=action=>[...touchInputs.values()].includes(action);
   const throttle=Number(keys.has('KeyW')||keys.has('ArrowUp')||held('throttle'))-Number(keys.has('KeyS')||keys.has('ArrowDown')||held('brake'));
   const steer=Number(keys.has('KeyD')||keys.has('ArrowRight')||held('right'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')||held('left'));
   if(throttle&&!state.driving){state.driving=true;syncUI();}
   if(state.driving)advanceDriving(freeCar,{throttle,steer,handbrake:keys.has('Space')||held('handbrake')},dt,drivingWorld);
   state.speed=freeCar.travelSpeed;
   $('gearValue').textContent=freeCar.speed<-.15?'R':'D';
   if(freeCar.collided&&now-lastCollisionToast>6000){lastCollisionToast=now;toast('Solid wall or map edge. Reverse out, or press R to return to a road.');}
 }else{
 if(keys.has('KeyW')){const changed=!state.driving||state.cruise;state.driving=true;state.cruise=false;state.speed=Math.min(40,state.speed+dt*5.8);if(changed)syncUI();}
 if(keys.has('KeyS')){const wasDriving=state.driving,wasCruise=state.cruise;state.cruise=false;state.speed=Math.max(0,state.speed-dt*9);if(state.speed===0)state.driving=false;if(wasCruise||wasDriving!==state.driving)syncUI();}
 if(state.driving&&state.cruise)state.speed=THREE.MathUtils.damp(state.speed,11.5,1.2,dt);
 if(!state.driving)state.speed=THREE.MathUtils.damp(state.speed,0,5,dt);
 if(state.speed>.03){
   state.route+=state.direction*state.speed*dt/world.routeLength;
   if(state.route>.97||state.route<.03){state.route=clamp(state.route,.03,.97);state.driving=false;state.speed=0;toast('End of this stretch. Turn around for the other view.');syncUI();}
 }
 actualLane=THREE.MathUtils.damp(actualLane,state.lane,2.8,dt);
 }
 if(state.sunPlaying){state.progress=Math.min(1,state.progress+dt/150);if(state.progress===1){state.sunPlaying=false;syncUI();} $('timeSlider').value=state.progress;updateTimeLabel();}
 if(now-lastEnvironment>180){if(atmosphere.update(state.progress,state.style,false,now,state.neutral))lastEnvironment=now;}
 const night=state.neutral?0:atmosphere.night(state.progress);glass.uniforms.style.value=state.style;glass.uniforms.night.value=state.neutral?0:night;
 player.userData.setNight?.(night);
 devon.update(simTime,night,state.screen&&!state.neutral);legends.update(simTime,night);
 world.update(dt,simTime,night,state.traffic?1:0);
 refreshLocalReflection(false,now);
 updateCamera(dt);
 atmosphere.prepareShadows(carPosition,now,state.traffic||state.speed>.01);
 updateAudio();
 renderer.render(scene,camera);
 $('speedValue').textContent=Math.round(state.speed*2.23694);
 if(!$('settingsPanel').hidden){$('routeSlider').value=state.route;$('routeValue').textContent=Math.round(state.route*100)+'%';}
 frameCount++;if(now-fpsTime>900){
   const fps=Math.round(frameCount*1000/(now-fpsTime)),info=renderer.info.render;
   $('fps').textContent=fps+' FPS';
   $('fps').title=info.calls+' draw calls · '+Math.round(info.triangles/1000)+'k triangles · '+renderer.domElement.dataset.depthMode+' depth';
   $('fps').dataset.drawCalls=info.calls;$('fps').dataset.triangles=info.triangles;
   frameCount=0;fpsTime=now;
 }
 requestAnimationFrame(frame);
}

function updateTimeLabel(){
 const p=state.progress;$('timeLabel').textContent=state.neutral?'Neutral light':p<.08?'Daylight':p<.3?'Golden hour':p<.7?'Afterglow':p<.88?'Blue hour':'Nightfall';
 const times={daylight:0,golden:.18,prism:.63,blue:.81,night:.97};
 for(const el of document.querySelectorAll('[data-preset]')){const active=!state.neutral&&Math.abs(p-times[el.dataset.preset])<.002;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
}
function syncUI(){
 const free=state.driveMode==='free';
 document.body.classList.toggle('free-driving',free);
 for(const el of document.querySelectorAll('[data-drive-mode]')){const active=el.dataset.driveMode===state.driveMode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
 for(const el of document.querySelectorAll('[data-camera]')){const active=el.dataset.camera===state.camera;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
 $('driveBtn').textContent=free?(state.driving?'Pause car':'Resume car'):(state.driving?'Pause cruise':'Start cruise');$('driveBtn').setAttribute('aria-pressed',String(state.driving));
 $('directionBtn').hidden=free;$('recoverBtn').hidden=!free;$('gearValue').hidden=!free;$('touchControls').hidden=!free;$('driveHint').hidden=!free;
 $('directionBtn').textContent=state.direction===1?'Eastbound':'Westbound';$('modeLabel').textContent=free?(state.driving?'You are driving':'Car paused'):state.driving?(state.cruise?'Scenic cruise':'Scenic throttle'):'Cruise ready';
 $('routeSlider').disabled=free;$('routeSlider').title=free?'Return to Scenic cruise to move along Reno Avenue':'';
 $('sunPlay').textContent=state.sunPlaying?'Pause sky':'Play sky';$('sunPlay').setAttribute('aria-pressed',String(state.sunPlaying));
 $('timeSlider').value=state.progress;$('styleMix').value=state.style;$('roughness').value=state.roughness;$('exposure').value=state.exposure;
 $('routeSlider').value=state.route;$('routeValue').textContent=Math.round(state.route*100)+'%';$('neutralToggle').checked=state.neutral;
 $('styleValue').textContent=state.style<.15?'Physical':state.style>.85?'Illustrated':'Blended';$('roughnessValue').textContent=state.roughness.toFixed(3);$('exposureValue').textContent=state.exposure.toFixed(2);
 $('screenToggle').checked=state.screen;$('legendsToggle').checked=state.legends;$('trafficToggle').checked=state.traffic;$('soundToggle').checked=state.sound;$('qualitySelect').value=state.quality;
 $('proposalNote').hidden=!state.legends;legends.group.visible=state.legends;
 glass.material.roughness=state.roughness;renderer.toneMappingExposure=state.exposure;
 updateTimeLabel();
}
function setPreset(name){
 const presets={daylight:{progress:0,screen:false,exposure:.95},golden:{progress:.18,screen:false,exposure:1.0},prism:{progress:.63,screen:false,exposure:1.08},blue:{progress:.81,screen:false,exposure:1.15},night:{progress:.97,screen:true,exposure:1.35}};
 Object.assign(state,presets[name]||presets.prism,{neutral:false,sunPlaying:false});
 for(const el of document.querySelectorAll('[data-preset]')){el.classList.toggle('active',el.dataset.preset===name);el.setAttribute('aria-pressed',String(el.dataset.preset===name));}
 atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();
}
function scenicPose(){const offset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;const p=world.getRoutePoint(state.route,offset),t=world.getRouteTangent(state.route).multiplyScalar(state.direction);return{x:p.x,z:p.z,heading:Math.atan2(t.z,t.x),speed:Math.min(state.speed,28)};}
function clearDrivingInputs(){keys.clear();touchInputs.clear();for(const el of document.querySelectorAll('[data-drive-control]'))el.classList.remove('held');}
function focusRoad(){if(!$('helpPanel').hidden)return;$('scene').focus({preventScroll:true});}
function setDriveMode(mode){
 if(mode===state.driveMode)return;
 clearDrivingInputs();
 if(mode==='free'){
   let pose=scenicPose();
   if(!isDrivingPoseClear(drivingWorld,pose))pose=nearestRoadPose(drivingWorld,world.drivingRoads,pose,pose.heading);
   if(!pose){toast('No clear road position found. Move the route slider and try again.');return;}
   freeCar=createDrivingState(pose);state.driveMode='free';state.driving=true;state.cruise=false;
   if(state.camera==='orbit')state.camera='chase';
   toast('You have the wheel. W/S throttle, brake and reverse. A/D steer. Space handbrake.');
 }else{
   let best=Infinity,route=state.route;
   for(let i=0;i<=470;i++){const s=.03+i*.002,p=world.getRoutePoint(s),d=(p.x-freeCar.x)**2+(p.z-freeCar.z)**2;if(d<best){best=d;route=s;}}
   const tangent=world.getRouteTangent(route);state.direction=Math.cos(freeCar.heading)*tangent.x+Math.sin(freeCar.heading)*tangent.z<0?-1:1;
   state.route=route;state.lane=-1.75;actualLane=state.lane;state.driveMode='scenic';state.driving=false;state.cruise=true;state.speed=0;
   toast('Back on the Reno Avenue scenic route.');
 }
 orbitFocus=null;viewFov=null;lookYaw=0;lookPitch=0;firstCamera=true;$('studyView').value='';syncUI();focusRoad();
}
function recoverCar(){
 if(state.driveMode!=='free'){reset();return;}
 const pose=nearestRoadPose(drivingWorld,world.drivingRoads,freeCar,freeCar.heading);
 if(!pose){toast('No clear road nearby. Switch to Scenic cruise to return to Reno.');return;}
 freeCar=createDrivingState(pose);state.speed=0;state.driving=true;lookYaw=0;lookPitch=0;firstCamera=true;clearDrivingInputs();syncUI();focusRoad();toast('Back on a clear road.');
}
function reset(){$('studyView').value='';const oldSound=state.sound;orbitFocus=null;viewFov=null;state={...defaults,sound:oldSound,quality:state.quality};freeCar=null;clearDrivingInputs();actualLane=state.lane;lookYaw=0;lookPitch=0;firstCamera=true;orbitYaw=2.25;orbitPitch=.19;orbitDistance=650;setPreset('prism');resize();toast('Back on the western approach.');}
function toggleDrive(){state.driving=!state.driving;state.cruise=state.driveMode==='scenic';if(state.driveMode==='free'&&!state.driving){freeCar.vx=freeCar.vz=freeCar.speed=freeCar.travelSpeed=0;state.speed=0;clearDrivingInputs();}syncUI();focusRoad();}
function toggleHud(){hudVisible=!hudVisible;$('hud').hidden=!hudVisible;$('showHudBtn').hidden=hudVisible;clearDrivingInputs();toast(hudVisible?'Controls restored':'Tap Show controls, or press H, to restore controls');}
function isTyping(){const el=document.activeElement;return el?.isContentEditable||['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(el?.tagName);}

function bindControls(){
 $('studyView').addEventListener('change',e=>{const preset=SHOT_BY_ID.get(e.target.value);if(!preset)return;applyCapturePreset({...preset,state:{...state,driveMode:'scenic',camera:preset.state.camera,route:preset.state.route,driving:false,speed:0,legends:false},simTime});});
 for(const el of document.querySelectorAll('[data-drive-mode]'))el.addEventListener('click',()=>setDriveMode(el.dataset.driveMode));
 $('recoverBtn').addEventListener('click',recoverCar);$('showHudBtn').addEventListener('click',toggleHud);
 $('driveBtn').addEventListener('click',toggleDrive);
 $('directionBtn').addEventListener('click',()=>{state.direction*=-1;actualLane=-1.75;state.lane=-1.75;orbitFocus=null;viewFov=null;lookYaw=0;lookPitch=0;firstCamera=true;syncUI();toast(state.direction===1?'Heading east toward downtown':'Heading west into the sunset');});
 $('sunPlay').addEventListener('click',()=>{if(state.progress>=1)state.progress=0;state.sunPlaying=!state.sunPlaying;syncUI();});
 $('timeSlider').addEventListener('input',e=>{state.progress=Number(e.target.value);state.neutral=false;state.sunPlaying=false;syncUI();});
 $('timeSlider').addEventListener('change',()=>{atmosphere.update(state.progress,state.style,true);syncUI();});
 $('routeSlider').addEventListener('input',e=>{state.route=clamp(Number(e.target.value),.03,.97);state.driving=false;state.speed=0;firstCamera=true;syncUI();});
 $('neutralToggle').addEventListener('change',e=>{state.neutral=e.target.checked;state.screen=false;atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();});
 document.querySelectorAll('[data-camera]').forEach(el=>el.addEventListener('click',()=>setCamera(el.dataset.camera)));
 document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>setPreset(el.dataset.preset)));
 $('styleMix').addEventListener('input',e=>{state.style=Number(e.target.value);syncUI();});
 $('roughness').addEventListener('input',e=>{state.roughness=Number(e.target.value);syncUI();});
 $('exposure').addEventListener('input',e=>{state.exposure=Number(e.target.value);syncUI();});
 for(const [id,key] of [['screenToggle','screen'],['legendsToggle','legends'],['trafficToggle','traffic']])$(id).addEventListener('change',e=>{state[key]=e.target.checked;if(key==='legends'&&state.legends){orbitFocus=null;viewFov=null;orbitYaw=2.25;orbitPitch=.19;orbitDistance=700;$('studyView').value='';state.camera='orbit';firstCamera=true;toast('Legends Tower: an imagined future skyline, 1,907 ft.');}syncUI();});
 $('soundToggle').addEventListener('change',e=>{state.sound=e.target.checked;enableAudio();});
 $('qualitySelect').addEventListener('change',e=>{state.quality=e.target.value;resize();});
 $('settingsBtn').addEventListener('click',()=>{$('settingsPanel').hidden=!$('settingsPanel').hidden;$('settingsBtn').setAttribute('aria-expanded',String(!$('settingsPanel').hidden));});
 const showHelp=show=>{clearDrivingInputs();$('helpPanel').hidden=!show;$('helpBtn').setAttribute('aria-expanded',String(show));if(show)$('closeHelp').focus();else focusRoad();};
 $('helpBtn').addEventListener('click',()=>showHelp(true));$('closeHelp').addEventListener('click',()=>showHelp(false));
 $('helpPanel').addEventListener('click',e=>{if(e.target===$('helpPanel'))showHelp(false);});
 $('hideBtn').addEventListener('click',toggleHud);$('resetBtn').addEventListener('click',reset);
 $('fullscreenBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full screen is unavailable in this browser.');}});
 $('captureBtn').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='prairie-prism.png';a.href=renderer.domElement.toDataURL('image/png');a.click();toast('Photograph saved.');});
 $('exportBtn').addEventListener('click',()=>{const payload={version:2,title:'Prairie Prism view',state:{...state},driving:state.driveMode==='free'?snapshotDriving(freeCar):null,view:{lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus:orbitFocus?[...orbitFocus]:null,fov:viewFov}};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='prairie-prism-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('View settings saved.');});
 $('importInput').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>50000)throw Error('File too large');const p=JSON.parse(await f.text());const s=p.state;if(![1,2].includes(p.version)||!s)throw Error('Unsupported view');
   const ranges={progress:[0,1],style:[0,1],roughness:[.015,.35],exposure:[.3,2.5],route:[.03,.97],speed:[0,40],lane:[-3.8,3.8]};for(const [key,range] of Object.entries(ranges))if(!Number.isFinite(s[key])||s[key]<range[0]||s[key]>range[1])throw Error('Invalid '+key);
   if(!['chase','driver','orbit'].includes(s.camera)||![-1,1].includes(s.direction)||!['high','balanced','low'].includes(s.quality))throw Error('Invalid view');
   for(const k of ['driving','cruise','sunPlaying','screen','legends','traffic','sound','neutral'])if(typeof s[k]!=='boolean')throw Error('Invalid '+k);
   let view=p.view||{};for(const k of ['lookYaw','lookPitch','orbitYaw','orbitPitch','orbitDistance'])if(!Number.isFinite(view[k]))throw Error('Invalid camera');
   if(view.orbitFocus!=null&&(!Array.isArray(view.orbitFocus)||view.orbitFocus.length!==3||view.orbitFocus.some(n=>!Number.isFinite(n)||Math.abs(n)>20000)))throw Error('Invalid camera focus');
   if(view.fov!=null&&(!Number.isFinite(view.fov)||view.fov<15||view.fov>90))throw Error('Invalid camera lens');
   const driveMode=p.version===1?'scenic':s.driveMode;
   if(!['scenic','free'].includes(driveMode))throw Error('Invalid drive mode');
   let restoredCar=null;
   if(driveMode==='free'){
     if(!p.driving||!['x','z','heading','speed'].every(key=>Number.isFinite(p.driving[key]))||p.driving.speed< -8||p.driving.speed>28||!isDrivingPoseClear(drivingWorld,p.driving))throw Error('Invalid car position');
     restoredCar=createDrivingState(p.driving);
     if(!s.driving)restoredCar.vx=restoredCar.vz=restoredCar.speed=restoredCar.travelSpeed=0;
   }
   state={...defaults,...Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]??defaults[k]])),driveMode,sound:false};freeCar=restoredCar;clearDrivingInputs();lookYaw=view.lookYaw;lookPitch=clamp(view.lookPitch,-.8,.8);orbitYaw=view.orbitYaw;orbitPitch=clamp(view.orbitPitch,-.8,1.2);orbitDistance=clamp(view.orbitDistance,160,2200);orbitFocus=view.orbitFocus?[...view.orbitFocus]:null;viewFov=view.fov||null;actualLane=state.lane;firstCamera=true;resize();atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();toast('View restored.');
 }catch(err){toast('Could not load that setup. Your current view is unchanged.');}finally{e.target.value='';}});
 window.addEventListener('resize',resize);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){showHelp(false);$('settingsPanel').hidden=true;$('settingsBtn').setAttribute('aria-expanded','false');if(!hudVisible)toggleHud();return;}
  if(e.code==='Tab'&&!$('helpPanel').hidden){e.preventDefault();$('closeHelp').focus();return;}
  if(isTyping()||!$('helpPanel').hidden)return;
  if(['Space','KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyF')setDriveMode(state.driveMode==='free'?'scenic':'free');
  if(e.code==='Space'&&state.driveMode==='scenic')toggleDrive();
  if(e.code==='KeyA'&&state.driveMode==='scenic')state.lane=clamp(state.lane-state.direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyD'&&state.driveMode==='scenic')state.lane=clamp(state.lane+state.direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyC')setCamera(['chase','driver','orbit'][(['chase','driver','orbit'].indexOf(state.camera)+1)%3]);
  if(e.code==='KeyH')toggleHud();if(e.code==='KeyR')recoverCar();
  if(e.code==='KeyT'){if(state.progress>=1)state.progress=0;state.sunPlaying=!state.sunPlaying;syncUI();}
  if(e.code==='KeyM'){state.sound=!state.sound;enableAudio();syncUI();}
  if(e.code==='KeyN'){state.neutral=!state.neutral;state.screen=false;atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();toast(state.neutral?'Neutral environment diagnostic':'Sunset restored');}
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>{clearDrivingInputs();if(state.driveMode==='free'&&state.driving)toggleDrive();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearDrivingInputs();if(state.driveMode==='free'&&state.driving)toggleDrive();}});
 document.addEventListener('focusin',e=>{if(e.target!==$('scene'))keys.clear();});
 for(const el of document.querySelectorAll('[data-drive-control]')){
   const release=e=>{touchInputs.delete(e.pointerId);if(![...touchInputs.values()].includes(el.dataset.driveControl))el.classList.remove('held');};
   el.addEventListener('pointerdown',e=>{if(state.driveMode!=='free')return;e.preventDefault();el.setPointerCapture(e.pointerId);touchInputs.set(e.pointerId,el.dataset.driveControl);el.classList.add('held');focusRoad();});
   el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
 }
 const canvas=$('scene');canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{if(drag)return;canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY,id:e.pointerId};if(state.camera==='orbit'){orbitYaw-=dx*.004;orbitPitch=clamp(orbitPitch+dy*.003,-.8,1.2);}else{lookYaw-=dx*.003;lookPitch=clamp(lookPitch-dy*.0025,-.7,.7);}});
 canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});canvas.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null;});
 canvas.addEventListener('dblclick',()=>{lookYaw=0;lookPitch=0;toast('Look direction reset');});
 canvas.addEventListener('wheel',e=>{if(state.camera==='orbit'){e.preventDefault();orbitDistance=clamp(orbitDistance+e.deltaY*.65,160,2200);}},{passive:false});
}

function resize(){
 if(!renderer)return;
 const cap=state.quality==='high'?1.25:state.quality==='balanced'?1:.7;
 renderer.setPixelRatio(Math.min(devicePixelRatio,cap));renderer.setSize(innerWidth,innerHeight,false);
 camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
 atmosphere?.setQuality(state.quality);
 if(localReflectionOptions&&scene.environment)refreshLocalReflection(true);
}
function enableAudio(){
 if(state.sound&&!audioContext){
  audioContext=new(window.AudioContext||window.webkitAudioContext)();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
  const samples=audioContext.sampleRate*2,buffer=audioContext.createBuffer(1,samples,audioContext.sampleRate),a=buffer.getChannelData(0);let smooth=0;for(let i=0;i<samples;i++){smooth=(smooth+Math.random()*.04-.02)*.985;a[i]=smooth*2;}
  const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;noiseGain=audioContext.createGain();noiseGain.gain.value=.3;noise.connect(filter).connect(noiseGain).connect(audioGain);noise.start();
  engineOsc=audioContext.createOscillator();engineOsc.type='sine';engineOsc.frequency.value=45;const eGain=audioContext.createGain();eGain.gain.value=.025;engineOsc.connect(eGain).connect(audioGain);engineOsc.start();
 }
 if(audioContext?.state==='suspended')audioContext.resume();
}
function updateAudio(){if(!audioContext)return;audioGain.gain.setTargetAtTime(state.sound?.6:0,audioContext.currentTime,.2);engineOsc.frequency.setTargetAtTime(38+state.speed*1.6,audioContext.currentTime,.1);noiseGain.gain.setTargetAtTime(.10+state.speed*.035,audioContext.currentTime,.2);}

window.addEventListener('error',e=>{fail(e.error||Error(e.message));});

function applyCapturePreset(preset){
 state={...defaults,...preset.state,driveMode:preset.driving?'free':'scenic'};
 freeCar=preset.driving?createDrivingState(preset.driving):null;
 ({lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance}={lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650,...preset.view});
 orbitFocus=preset.view?.orbitFocus?[...preset.view.orbitFocus]:null;viewFov=preset.view?.fov||null;
 actualLane=state.lane;simTime=preset.simTime??18;firstCamera=true;clearDrivingInputs();syncUI();
 const skyState=atmosphere.uniforms;
 if(!scene.environment||skyState.uProgress.value!==state.progress||skyState.uStyle.value!==state.style||skyState.uNeutral.value!==(state.neutral?1:0))atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);
 const night=state.neutral?0:atmosphere.night(state.progress);
 glass.uniforms.style.value=state.style;glass.uniforms.night.value=night;
 player.userData.setNight?.(night);devon.update(simTime,night,state.screen&&!state.neutral);legends.update(simTime,night);
 world.update(0,simTime,night,0);updateCamera(0);refreshLocalReflection(true);
}

// Deterministic, full-resolution canvas photographs. Used by the capture
// gallery workflow; the same named presets are also opened by ?view=<id>.
export function captureView(id,width=1600,height=900){
 const preset=SHOT_BY_ID.get(id);if(!preset)throw new Error('Unknown capture view');
 if(!captureRestore)captureRestore={state:{...state},driving:state.driveMode==='free'?snapshotDriving(freeCar):null,view:{lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus:orbitFocus?[...orbitFocus]:null,fov:viewFov},simTime};
 capturing=true;
 renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;
 applyCapturePreset(preset);
 // A sky update can render PMREM and six local-probe faces immediately before
 // this photograph. Establish the complete main-camera render boundary.
 renderer.resetState();renderer.setRenderTarget(null);
 renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);
 firstCamera=true;updateCamera(0);camera.updateMatrixWorld(true);
 renderer.clear(true,true,true);renderer.render(scene,camera);
 const pose={position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),fov:camera.fov,aspect:camera.aspect,progress:state.progress,renderTarget:renderer.getRenderTarget()===null?'canvas':'offscreen'};
 return {id,width,height,pose,dataUrl:renderer.domElement.toDataURL('image/png')};
}
export function finishCaptures(){
 if(captureRestore){const saved=captureRestore;captureRestore=null;applyCapturePreset(saved);resize();updateCamera(0);renderer.render(scene,camera);}
 capturing=false;lastTime=performance.now();
}
export const sceneReady=init().then(()=>true).catch(error=>{fail(error);return false;});
