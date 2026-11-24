import * as THREE from 'three';
import {cameraBoomFraction} from '../driving.js';
import {createCockpit} from './cockpit.js';

const clamp=THREE.MathUtils.clamp;

// Camera state belongs to this rig. Controls edit view; rendering reads it.
export function createCameraRig({camera,world,player,atmosphere,drivingWorld}){
 const view={lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650,orbitFocus:null,viewFov:null,firstCamera:true};
 const vUp=new THREE.Vector3(0,1,0),desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),carPosition=new THREE.Vector3();
 const {cockpit,steeringWheel}=createCockpit(camera);

function updateCamera(dt,state,freeCar,actualLane){
 const free=state.driveMode==='free'&&freeCar;
 const laneOffset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;
 if(free)carPosition.set(freeCar.x,.14,freeCar.z);
 else carPosition.copy(world.getRoutePoint(state.route,laneOffset));
 const tangent=free?new THREE.Vector3(Math.cos(freeCar.heading),0,Math.sin(freeCar.heading)):world.getRouteTangent(state.route).multiplyScalar(state.direction);
 player.position.copy(carPosition);player.rotation.y=-Math.atan2(tangent.z,tangent.x);player.visible=state.camera!=='driver';
 cockpit.visible=state.camera==='driver';
 const perpendicular=new THREE.Vector3(-tangent.z,0,tangent.x);
 if(state.camera==='orbit'){
   const focus=free?carPosition.clone().add(new THREE.Vector3(0,1,0)):view.orbitFocus?new THREE.Vector3(...view.orbitFocus):new THREE.Vector3(state.legends?190:0,state.legends?200:118,state.legends?-65:0);
   const r=free?clamp(view.orbitDistance*.09,16,90):view.orbitDistance*(state.legends?1.35:1);
   desiredPosition.set(focus.x+Math.cos(view.orbitYaw)*r,focus.y+Math.sin(view.orbitPitch)*r,focus.z+Math.sin(view.orbitYaw)*r);
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
   dir.applyAxisAngle(vUp,view.lookYaw);
   const right=new THREE.Vector3().crossVectors(dir,vUp).normalize();dir.applyAxisAngle(right,view.lookPitch);
   desiredTarget.copy(desiredPosition).addScaledVector(dir,300);
 }
 if(free&&state.camera==='chase'){
   const anchor=carPosition.clone().add(new THREE.Vector3(0,1.6,0));
   desiredPosition.lerpVectors(anchor,desiredPosition,cameraBoomFraction(drivingWorld,anchor,desiredPosition));
 }
 camera.position.lerp(desiredPosition,view.firstCamera||free&&state.camera==='driver'?1:1-Math.exp(-dt*(free?11:7)));
 if(free&&state.camera==='chase'){
   const anchor=carPosition.clone().add(new THREE.Vector3(0,1.6,0));
   camera.position.lerpVectors(anchor,camera.position,cameraBoomFraction(drivingWorld,anchor,camera.position));
 }
 camera.lookAt(desiredTarget);
 if(steeringWheel)steeringWheel.rotation.z=free?-freeCar.steering*.8:(state.lane-actualLane)*-.12;
 camera.near=state.camera==='driver'?.25:state.camera==='orbit'?.75:.5;camera.far=7500;camera.fov=view.viewFov||(state.camera==='driver'?56:state.camera==='orbit'?44:48);camera.updateProjectionMatrix();view.firstCamera=false;
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
 }
 return {view,cockpit,carPosition,update:updateCamera,snapshot,restore};
}
