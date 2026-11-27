import * as THREE from 'three';
import {cameraBoomFraction,resetDrivingInterpolation,sampleDrivingPose} from '../driving.js';
import {springValue,wrapAngle} from '../driving-motion.js';
import {createCockpit} from './cockpit.js';

const clamp=THREE.MathUtils.clamp;

// Camera state belongs to this rig. Controls edit view; rendering reads it.
export function createCameraRig({camera,world,player,atmosphere,drivingWorld}){
 const view={lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650,orbitFocus:null,viewFov:null,firstCamera:true};
 const vUp=new THREE.Vector3(0,1,0),desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),carPosition=new THREE.Vector3();
 const {cockpit,steeringWheel}=createCockpit(camera);
 const renderPose={},chase={heading:0,distance:10,height:4.4,fov:48,boomFraction:1};
 let lastCar=null,lastMode=null,lastCamera=null;

function updateCamera(dt,state,freeCar,actualLane){
 const free=state.driveMode==='free'&&freeCar;
 const snap=view.firstCamera||lastCar!==freeCar||lastMode!==state.driveMode||lastCamera!==state.camera;
 if(free&&snap)resetDrivingInterpolation(freeCar);
 const pose=free?sampleDrivingPose(freeCar,renderPose,drivingWorld):null;
 const laneOffset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;
 if(free)carPosition.set(pose.x,world.groundHeight?.(pose.x,pose.z)??.14,pose.z);
 else carPosition.copy(world.getRoutePoint(state.route,laneOffset));
 const tangent=free?new THREE.Vector3(Math.cos(pose.heading),0,Math.sin(pose.heading)):world.getRouteTangent(state.route).multiplyScalar(state.direction);
 player.position.copy(carPosition);player.rotation.y=-Math.atan2(tangent.z,tangent.x);player.visible=state.camera!=='driver';
 // Chassis motion is cosmetic; tires, collision hull and ground shadow stay flat.
 if(player.userData.body){player.userData.body.rotation.x=pose?.bodyRoll||0;player.userData.body.rotation.z=pose?.bodyPitch||0;}
 cockpit.visible=state.camera==='driver';
 const perpendicular=new THREE.Vector3(-tangent.z,0,tangent.x);
 if(state.camera==='orbit'){
   const focus=view.orbitFocus?new THREE.Vector3(...view.orbitFocus):free?carPosition.clone().add(new THREE.Vector3(0,1,0)):new THREE.Vector3(state.legends?190:0,state.legends?200:118,state.legends?-65:0);
   const r=free&&!view.orbitFocus?clamp(view.orbitDistance*.09,16,90):view.orbitDistance*(state.legends?1.35:1);
   desiredPosition.set(focus.x+Math.cos(view.orbitYaw)*r,focus.y+Math.sin(view.orbitPitch)*r,focus.z+Math.sin(view.orbitYaw)*r);
   desiredPosition.y=Math.max(1.7,desiredPosition.y);
   desiredTarget.copy(focus);
 }else{
   if(state.camera==='driver'){
     desiredPosition.copy(carPosition).addScaledVector(tangent,.50).add(new THREE.Vector3(0,1.46,0));
     desiredTarget.copy(desiredPosition).addScaledVector(tangent,180).add(new THREE.Vector3(0,4,0));
   }else if(free){
     // Follow a little of the actual travel direction in a slide. Reverse and
     // near-zero speed keep the body heading, so the camera never flips around.
     const motionHeading=Math.atan2(pose.vz,pose.vx);
     const motionWeight=.3*THREE.MathUtils.smoothstep(pose.travelSpeed,2,18)*THREE.MathUtils.smoothstep(pose.speed,-1,6);
     const heading=pose.heading+clamp(wrapAngle(motionHeading-pose.heading),-.85,.85)*motionWeight;
     springValue(chase,'heading',heading,9,dt,snap,true);
     springValue(chase,'distance',10+pose.travelSpeed*.035,7,dt,snap);
     springValue(chase,'height',4.4+pose.travelSpeed*.008,7,dt,snap);
     springValue(chase,'fov',48+clamp((pose.travelSpeed-12)*.16,0,2.5),8,dt,snap);
     const boomDirection=new THREE.Vector3(Math.cos(chase.heading),0,Math.sin(chase.heading));
     desiredPosition.copy(carPosition).addScaledVector(boomDirection,-chase.distance).add(new THREE.Vector3(0,chase.height,0));
     desiredTarget.copy(carPosition).addScaledVector(boomDirection,28).add(new THREE.Vector3(0,1.2,0));
   }else{
     desiredPosition.copy(carPosition).addScaledVector(tangent,-15).addScaledVector(perpendicular,2).add(new THREE.Vector3(0,3.2,0));
     desiredTarget.copy(carPosition).addScaledVector(tangent,110).add(new THREE.Vector3(0,15,0));
     // The scenic chase camera gently keeps the landmark in the composition.
     const near=1-THREE.MathUtils.smoothstep(Math.abs(carPosition.x),400,1900);desiredTarget.lerp(new THREE.Vector3(0,78,0),.32+near*.18);
   }
   const dir=desiredTarget.clone().sub(desiredPosition).normalize();
   dir.applyAxisAngle(vUp,view.lookYaw);
   const right=new THREE.Vector3().crossVectors(dir,vUp).normalize();dir.applyAxisAngle(right,view.lookPitch);
   desiredTarget.copy(desiredPosition).addScaledVector(dir,300);
 }
 if(free&&state.camera==='chase'){
   const anchor=carPosition.clone().add(new THREE.Vector3(0,1.6,0));
   const safeFraction=cameraBoomFraction(drivingWorld,anchor,desiredPosition);
   // Contract immediately for new obstacles, recover gently after they clear.
   chase.boomFraction=snap||safeFraction<chase.boomFraction?safeFraction:THREE.MathUtils.lerp(chase.boomFraction,safeFraction,1-Math.exp(-6*dt));
   camera.position.lerpVectors(anchor,desiredPosition,chase.boomFraction);
 }else camera.position.lerp(desiredPosition,snap||free&&state.camera==='driver'?1:1-Math.exp(-dt*(free?11:7)));
 camera.lookAt(desiredTarget);
 if(steeringWheel)steeringWheel.rotation.z=free?-pose.steering*.8:(state.lane-actualLane)*-.12;
 camera.near=state.camera==='driver'?.25:state.camera==='orbit'?.75:.5;camera.far=7500;camera.fov=view.viewFov||(state.camera==='driver'?56:state.camera==='orbit'?44:free?chase.fov:48);camera.updateProjectionMatrix();view.firstCamera=false;
 lastCar=freeCar;lastMode=state.driveMode;lastCamera=state.camera;
 atmosphere.follow(camera);
}

 function snapshot(){
  const {lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus,viewFov}=view;
  return {lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus:orbitFocus?[...orbitFocus]:null,fov:viewFov};
 }
 function restore(saved={}){
  const values={lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650,...saved};
  for(const key of ['lookYaw','lookPitch','orbitYaw','orbitPitch','orbitDistance'])view[key]=values[key];
  view.orbitFocus=saved.orbitFocus?[...saved.orbitFocus]:null;
  view.viewFov=saved.fov||null;
  view.firstCamera=true;
 }
 function reset(car=lastCar){resetDrivingInterpolation(car);view.firstCamera=true;}
 return {view,cockpit,carPosition,update:updateCamera,snapshot,restore,reset};
}
