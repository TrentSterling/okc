import * as THREE from 'three';
import {connectDiscovery} from './app/discovery-bridge.js';
import {reportLoad} from './metro/download.js';
import {stopTour} from './discovery.js';
import {createWorld,createCar} from './world.js';
import {createDevon,createLegends} from './tower.js';
import {createAtmosphere,createGlassMaterial} from './sky.js';
import {SHOT_BY_ID} from './capture-presets.js';
import {createDrivingWorld,createDrivingState,advanceDriving,isDrivingPoseClear,nearestRoadPose,snapshotDriving} from './driving.js';
import {toast,fail,focusRoad} from './app/status.js';
import {getUI} from './ui/runtime.js';
import {createCameraRig} from './app/camera.js';
import {createInterface} from './app/interface.js';
import {bindControls} from './app/controls.js';
import {createRoadAudio} from './app/audio.js';
import {defaults,createSetupIO} from './app/setup.js';
import {createCaptureController} from './app/captures.js';
import {configureDepthOffsets} from './app/renderer.js';

const clamp=THREE.MathUtils.clamp;
let state={...defaults};
let renderer,scene,camera,world,devon,legends,atmosphere,glass,player,cockpit;
let cameraRig,ui,captures,discovery;
let simTime=0,lastTime=performance.now(),lastEnvironment=0,frameCount=0,fpsTime=performance.now();
let actualLane=-1.75;
const keys=new Set();
const touchInputs=new Map();
let drivingWorld,freeCar,lastCollisionToast=-10000;
let localReflectionOptions=null,lastLocalReflection=-10000;
let sceneInitialized=false;
const audio=createRoadAudio(()=>state);

function syncUI(){ui.sync();}
function updateTimeLabel(){ui.updateTimeLabel();}
function toggleHud(){ui.toggleHud();}
function enableAudio(){audio.enable();}
function updateAudio(){audio.update();}
function updateCamera(dt){cameraRig.update(dt,state,freeCar,actualLane);}
function snapshotView(){return {state:{...state},driving:state.driveMode==='free'?snapshotDriving(freeCar):null,view:cameraRig.snapshot(),simTime};}
function restoreSetup(restored){
 state=restored.state;freeCar=restored.freeCar;clearDrivingInputs();cameraRig.restore(restored.view);actualLane=state.lane;cameraRig.view.firstCamera=true;
 if(freeCar&&!state.driving)freeCar.yawRate=0;
 resize();atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();
}

async function init(){
 const initialized=getUI();
 renderer=initialized.renderer;const reversedDepth=initialized.reversedDepth;
 if(!renderer)throw Error('WebGL2 is unavailable.');
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.5,7500);scene.add(camera);
 reportLoad('scene','Building your Oklahoma City');
 await new Promise(resolve=>requestAnimationFrame(resolve));
 glass=createGlassMaterial();
 atmosphere=createAtmosphere(renderer,scene);
 atmosphere.bindGlass(glass);
 world=createWorld({scene,glassMaterial:glass.material,seed:1907});
 drivingWorld=createDrivingWorld(world.drivingSolids,world.drivingBounds);
 devon=createDevon({glassMaterial:glass.material});scene.add(devon.group);
 legends=createLegends({glassMaterial:glass.material});legends.group.position.set(690,0,-280);legends.group.visible=false;scene.add(legends.group);
 player=createCar('sedan',0xc79956);scene.add(player);
 cameraRig=createCameraRig({camera,world,player,atmosphere,drivingWorld});cockpit=cameraRig.cockpit;
 atmosphere.bindSunlight(scene);
 configureDepthOffsets(scene,reversedDepth);
 localReflectionOptions={glass,exclude:[devon.group,legends.group,player,cockpit],position:new THREE.Vector3(0,105,0),boxMin:new THREE.Vector3(-650,0,-700),boxMax:new THREE.Vector3(650,350,500),size:256,strength:.85};
 ui=createInterface({getState:()=>state,legends,glass,renderer,clearDrivingInputs});
 captures=createCaptureController({renderer,scene,camera,getState:()=>state,applyCapturePreset,snapshot:snapshotView,updateCamera,invalidateCamera:()=>{cameraRig.view.firstCamera=true;},resize});
 const setup=createSetupIO({drivingWorld,snapshot:snapshotView,restore:restoreSetup});
 bindControls({getState:()=>state,getSimTime:()=>simTime,view:cameraRig.view,world,keys,touchInputs,ui,setup,actions:{
   setDriveMode,recoverCar,toggleHud,toggleDrive,setCamera,setPreset,enableAudio,resize,reset,applyCapturePreset,clearDrivingInputs,manualTakeover:stopTour,
   updateAtmosphere:(...args)=>atmosphere.update(...args),resetLane:()=>{actualLane=-1.75;},photograph:captures.photograph,
   setQuality:quality=>{state.quality=quality;discovery?.metro.setQuality(quality);resize();},
 }});resize();
 reportLoad('scene','Nearby city geometry is ready',{complete:true});
 reportLoad('lighting','Catching the western sky');
 await new Promise(resolve=>requestAnimationFrame(resolve));
 const viewId=typeof location==='undefined'?null:new URLSearchParams(location.search).get('view');
 if(viewId&&SHOT_BY_ID.has(viewId))applyCapturePreset(SHOT_BY_ID.get(viewId));
 else {atmosphere.update(state.progress,state.style,true);updateCamera(.016);syncUI();}
 discovery=await connectDiscovery({scene,camera,world,drivingWorld,cameraRig,renderer,atmosphere,getState:()=>state,getCar:()=>freeCar,setCar:car=>{freeCar=car;},syncUI,resize,clearDrivingInputs,reversedDepth});
 // Allow parallel shader compilation to finish without blocking the loading UI.
 // Older renderers still compile normally on first render.
 if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
 refreshLocalReflection(true);
 renderer.render(scene,camera);
 sceneInitialized=true;
 initialized.setSceneReady(true);initialized.driveFrames(true);
 reportLoad('ready','The city is yours');
 // Do not include asset construction and first-use shader compilation in FPS.
 fpsTime=lastTime=performance.now();frameCount=0;
 requestAnimationFrame(frame);
 setTimeout(()=>toast('Take the scenic cruise, or choose Drive yourself.'),650);
}

function setCamera(mode){ui.setStudyView('');state.camera=mode;cameraRig.view.lookYaw=0;cameraRig.view.lookPitch=0;cameraRig.view.orbitFocus=null;cameraRig.view.viewFov=null;cameraRig.view.firstCamera=true;syncUI();}

function refreshLocalReflection(immediate=false,now=performance.now()){
 if(state.quality==='low'){glass.clearLocalReflection();return;}
 if(!immediate&&cameraRig&&Math.hypot(cameraRig.carPosition.x,cameraRig.carPosition.z)>3000)return;
 if(!localReflectionOptions||(!immediate&&now-lastLocalReflection<750))return;
 localReflectionOptions.size=state.quality==='high'?256:128;
 localReflectionOptions.force=immediate;
 if(atmosphere.captureLocalReflection(localReflectionOptions))lastLocalReflection=now;
}

function frame(now){
 if(captures.isCapturing){lastTime=now;requestAnimationFrame(frame);return;}
 const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;simTime+=dt;
 const surface=getUI(),sceneVisible=!document.hidden&&surface.mode!=='map';
 if(state.driveMode==='free'){
   const held=action=>[...touchInputs.values()].includes(action);
   const throttle=Number(keys.has('KeyW')||keys.has('ArrowUp')||held('throttle'))-Number(keys.has('KeyS')||keys.has('ArrowDown')||held('brake'));
   const steer=Number(keys.has('KeyD')||keys.has('ArrowRight')||held('right'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')||held('left'));
   if(throttle&&!state.driving){state.driving=true;syncUI();}
   if(state.driving)advanceDriving(freeCar,{throttle,steer,handbrake:keys.has('Space')||held('handbrake')},dt,drivingWorld);
   state.speed=freeCar.travelSpeed;
   ui.setTelemetry({gear:freeCar.speed<-.15?'R':'D'});
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
 if(state.sunPlaying){state.progress=Math.min(1,state.progress+dt/150);if(state.progress===1){state.sunPlaying=false;syncUI();}updateTimeLabel();}
 if(sceneVisible&&now-lastEnvironment>180){if(atmosphere.update(state.progress,state.style,false,now,state.neutral))lastEnvironment=now;}
 const night=state.neutral?0:atmosphere.night(state.progress);glass.uniforms.style.value=state.style;glass.uniforms.night.value=state.neutral?0:night;
 player.userData.setNight?.(night);
 devon.update(simTime,night,state.screen&&!state.neutral);legends.update(simTime,night);
 world.update(dt,simTime,night,state.traffic?1:0);
 if(sceneVisible)refreshLocalReflection(false,now);
 updateCamera(dt);
 discovery?.update(dt,simTime,night,now);
 if(sceneVisible)atmosphere.prepareShadows(cameraRig.carPosition,now,state.traffic||state.speed>.01);
 updateAudio();
 if(sceneVisible)renderer.render(scene,camera);
 ui.setTelemetry({speedMph:Math.round(state.speed*2.23694)});
 if(ui.settingsOpen)surface.invalidate();
 if(!sceneVisible){frameCount=0;fpsTime=now;}else frameCount++;
 if(sceneVisible&&now-fpsTime>900){
   const fps=Math.round(frameCount*1000/(now-fpsTime)),info=renderer.info.render;
   ui.setTelemetry({fps,drawCalls:info.calls,triangles:info.triangles,depthMode:renderer.domElement.dataset.depthMode});
   frameCount=0;fpsTime=now;
 }
 surface.render();
 requestAnimationFrame(frame);
}

function setPreset(name){
 const presets={daylight:{progress:0,screen:false,exposure:.95},golden:{progress:.18,screen:false,exposure:1.0},prism:{progress:.63,screen:false,exposure:1.08},blue:{progress:.81,screen:false,exposure:1.15},night:{progress:.97,screen:true,exposure:1.35}};
 Object.assign(state,presets[name]||presets.prism,{neutral:false,sunPlaying:false});
 atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();
}

function scenicPose(){const offset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;const p=world.getRoutePoint(state.route,offset),t=world.getRouteTangent(state.route).multiplyScalar(state.direction);return{x:p.x,z:p.z,heading:Math.atan2(t.z,t.x),speed:Math.min(state.speed,28)};}

function clearDrivingInputs(){keys.clear();touchInputs.clear();}

function setDriveMode(mode){
 stopTour();
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
 cameraRig.view.orbitFocus=null;cameraRig.view.viewFov=null;cameraRig.view.lookYaw=0;cameraRig.view.lookPitch=0;cameraRig.view.firstCamera=true;ui.setStudyView('');syncUI();focusRoad();
}

function recoverCar(){
 if(state.driveMode!=='free'){reset();return;}
 const pose=nearestRoadPose(drivingWorld,world.drivingRoads,freeCar,freeCar.heading);
 if(!pose){toast('No clear road nearby. Switch to Scenic cruise to return to Reno.');return;}
 freeCar=createDrivingState(pose);state.speed=0;state.driving=true;cameraRig.view.lookYaw=0;cameraRig.view.lookPitch=0;cameraRig.view.firstCamera=true;clearDrivingInputs();syncUI();focusRoad();toast('Back on a clear road.');
}

function reset(){ui.setStudyView('');const oldSound=state.sound;cameraRig.view.orbitFocus=null;cameraRig.view.viewFov=null;state={...defaults,sound:oldSound,quality:state.quality};freeCar=null;clearDrivingInputs();actualLane=state.lane;cameraRig.view.lookYaw=0;cameraRig.view.lookPitch=0;cameraRig.view.firstCamera=true;cameraRig.view.orbitYaw=2.25;cameraRig.view.orbitPitch=.19;cameraRig.view.orbitDistance=650;setPreset('prism');resize();toast('Back on the western approach.');}

function toggleDrive(){state.driving=!state.driving;state.cruise=state.driveMode==='scenic';if(state.driveMode==='free'&&!state.driving){freeCar.vx=freeCar.vz=freeCar.speed=freeCar.travelSpeed=freeCar.yawRate=0;freeCar.bodyRoll=freeCar.bodyPitch=freeCar.bodyRollVelocity=freeCar.bodyPitchVelocity=0;cameraRig.reset(freeCar);state.speed=0;clearDrivingInputs();}syncUI();focusRoad();}

function resize(){
 if(!renderer)return;
 const cap=state.quality==='high'?1.25:state.quality==='balanced'?1:.7;
 const surface=getUI();renderer.setPixelRatio(Math.min(devicePixelRatio,cap));renderer.setSize(surface.width,surface.height,false);
 camera.aspect=surface.width/surface.height;camera.updateProjectionMatrix();
 atmosphere?.setQuality(state.quality);
 if(sceneInitialized&&localReflectionOptions&&scene.environment)refreshLocalReflection(false);
}

function applyCapturePreset(preset){
 state={...defaults,...preset.state,driveMode:preset.driving?'free':'scenic'};
 freeCar=preset.driving?createDrivingState(preset.driving):null;
 cameraRig.restore(preset.view);
 actualLane=state.lane;simTime=preset.simTime??18;cameraRig.view.firstCamera=true;clearDrivingInputs();syncUI();
 const skyState=atmosphere.uniforms;
 if(!scene.environment||skyState.uProgress.value!==state.progress||skyState.uStyle.value!==state.style||skyState.uNeutral.value!==(state.neutral?1:0))atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);
 const night=state.neutral?0:atmosphere.night(state.progress);
 glass.uniforms.style.value=state.style;glass.uniforms.night.value=night;
 player.userData.setNight?.(night);devon.update(simTime,night,state.screen&&!state.neutral);legends.update(simTime,night);
 world.update(0,simTime,night,0);updateCamera(0);if(sceneInitialized)refreshLocalReflection(true);
}

window.addEventListener('error',e=>{fail(e.error||Error(e.message));});

// Public capture API remains at app.js for existing automation and gallery links.
export function captureView(id,width=1600,height=900){return captures.captureView(id,width,height);}
export function finishCaptures(){captures.finishCaptures();lastTime=performance.now();}
export let sceneStartupError=null;
export const sceneReady=init().then(()=>true).catch(error=>{sceneStartupError=error;fail(error);return false;});
