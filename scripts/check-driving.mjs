#!/usr/bin/env node
// Deterministic controller tests. These exercise motion and real contact
// outcomes, not renderer implementation or source-code string patterns.
import assert from 'node:assert/strict';
const runtime = process.argv.includes('--source') ? '../src/' : '../dist/';
const {DRIVING,createDrivingWorld,createDrivingState,advanceDriving,isDrivingPoseClear,nearestRoadPose,snapshotDriving,cameraBoomFraction,resetDrivingInterpolation,sampleDrivingPose} = await import(runtime + 'driving.js');
import {CITY_DATA} from '../dist/city-data.js';
import {WORLD_SURFACES} from '../dist/world-surfaces.js';
import {checkDrivingPresentation} from './lib/check-driving-presentation.mjs';

const bounds={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000};
const empty=createDrivingWorld([],bounds);
const rectangle=(id,minX,minZ,maxX,maxZ)=>({id,polygon:[[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]]});
function run(car,segments,hz=60,world=empty,onFrame=()=>{}){
  for(const [duration,input] of segments){
    let elapsed=0;
    while(elapsed<duration-1e-10){const dt=Math.min(1/hz,duration-elapsed),before={x:car.x,z:car.z};advanceDriving(car,input,dt,world);elapsed+=dt;
      assert.ok(Number.isFinite(car.x+car.z+car.heading+car.vx+car.vz),'Finite car pose and velocity');
      assert.ok(isDrivingPoseClear(world,car),'Car remains outside solid buildings and inside map bounds');
      assert.ok(Math.hypot(car.x-before.x,car.z-before.z)<=DRIVING.maxForward*(dt+DRIVING.step)+.2,'Contacts never launch or teleport the car');
      onFrame(car,dt);
    }
  }
  return car;
}
const motion=[[3,{throttle:1}],[1.5,{throttle:1,steer:.6}],[1,{throttle:-1}],[2,{throttle:-1,steer:-.4}],[.8,{handbrake:true}]];
const poses=[30,60,144].map(hz=>run(createDrivingState(),motion,hz));
for(const car of poses.slice(1))for(const key of ['x','z','heading','vx','vz','yawRate','bodyRoll','bodyPitch'])assert.ok(Math.abs(car[key]-poses[0][key])<1e-8,`${key} independent of render frame rate`);

const car=run(createDrivingState(),[[3,{throttle:1}]]);
assert.ok(car.speed>18&&car.x>25,'Throttle accelerates and moves the car');
const beforeBraking=car.speed;
run(car,[[.5,{throttle:-1}]]);
assert.ok(car.speed>0&&car.speed<beforeBraking-5,'S brakes forward motion before reversing');
run(car,[[3,{throttle:-1}]]);
assert.ok(car.speed< -4,'Holding S selects reverse after stopping');
run(car,[[2,{throttle:1}]]);
assert.ok(car.speed>0,'W brakes reverse motion then moves forward');

const left=run(createDrivingState(),[[2,{throttle:1}],[1,{throttle:1,steer:-1}]]);
const right=run(createDrivingState(),[[2,{throttle:1}],[1,{throttle:1,steer:1}]]);
assert.ok(left.z< -2&&right.z>2&&left.heading<0&&right.heading>0,'A and D steer toward opposite streets');
assert.ok(Math.abs(left.x-right.x)<1e-9&&Math.abs(left.z+right.z)<1e-9,'Left and right handling is symmetric');
const stopped=run(createDrivingState({speed:28}),[[2,{handbrake:true}]]);
assert.ok(stopped.travelSpeed<.01&&stopped.x<26,'Handbrake stops from maximum speed without reversal');
assert.equal(run(createDrivingState(),[[12,{throttle:1}]]).speed,DRIVING.maxForward,'Forward speed is bounded');
assert.equal(run(createDrivingState(),[[5,{throttle:-1}]]).speed,-DRIVING.maxReverse,'Reverse speed is bounded');

const lateralSpeed=c=>-c.vx*Math.sin(c.heading)+c.vz*Math.cos(c.heading);
const turn=run(createDrivingState({speed:20}),[[.1,{throttle:1,steer:1}]],120);
assert.ok(turn.yawRate>.1&&turn.yawRate<1,'Steering develops a finite yaw rate instead of instantly rotating the car');
assert.ok(Math.abs(lateralSpeed(turn))>.1,'World momentum remains independent of chassis heading during turn-in');
let peakSideAcceleration=0;
run(turn,[[.8,{throttle:1,steer:1}]],120,empty,(c)=>{
  const before=c.previousPose,ax=(c.vx-before.vx)/DRIVING.step,az=(c.vz-before.vz)/DRIVING.step;
  peakSideAcceleration=Math.max(peakSideAcceleration,Math.abs(-Math.sin(before.heading)*ax+Math.cos(before.heading)*az));
});
assert.ok(peakSideAcceleration>5&&peakSideAcceleration<=DRIVING.tireGrip+1e-8,'Lateral tire force saturates at the grip budget');
const releaseHeading=turn.heading,releaseYaw=turn.yawRate;
run(turn,[[.1,{}]],120);
assert.ok(turn.heading>releaseHeading&&turn.yawRate>releaseYaw*.4,'Yaw momentum persists briefly after releasing steering');
run(turn,[[2,{}]],120);
assert.ok(Math.abs(turn.yawRate)<.01&&Math.abs(lateralSpeed(turn))<.01,'Grip and yaw damping recover to stable straight coasting');
const normalTurn=run(createDrivingState({speed:20}),[[.5,{throttle:1,steer:1}],[.35,{steer:1}]],120);
const handbrakeTurn=run(createDrivingState({speed:20}),[[.5,{throttle:1,steer:1}],[.35,{steer:1,handbrake:true}]],120);
assert.ok(Math.abs(lateralSpeed(handbrakeTurn))>Math.abs(lateralSpeed(normalTurn))+1,'Handbrake releases rear grip for a controllable slide');
assert.ok(handbrakeTurn.yawRate>normalTurn.yawRate*1.4&&handbrakeTurn.travelSpeed<normalTurn.travelSpeed,'Handbrake increases rotation while slowing the car');
const movingSnapshot=snapshotDriving(handbrakeTurn),movingRestore=createDrivingState(JSON.parse(JSON.stringify(movingSnapshot)));
for(const key of Object.keys(movingSnapshot))assert.ok(Math.abs(movingRestore[key]-movingSnapshot[key])<1e-8,`Moving ${key} survives a new-format save/capture round trip`);
run(handbrakeTurn,[[2,{}]],120);
assert.ok(Math.abs(handbrakeTurn.yawRate)<.01&&Math.abs(lateralSpeed(handbrakeTurn))<.01,'Releasing the handbrake restores stable grip without a spin');
const reverseSteer=run(createDrivingState({speed:-6}),[[.6,{throttle:-1,steer:1}]],120);
assert.ok(reverseSteer.heading<-.1,'Reverse steering keeps the established +X-forward control convention');
const standingTurn=run(createDrivingState(),[[2,{steer:1}]],120);
assert.equal(standingTurn.heading,0,'Steering alone cannot spin a stationary car');

const interpolated=createDrivingState({speed:12});
advanceDriving(interpolated,{throttle:1,steer:.3},DRIVING.step*2.4,empty);
const sampled=sampleDrivingPose(interpolated,{},empty),previous=interpolated.previousPose;
assert.ok(Math.abs(sampled.x-(previous.x+(interpolated.x-previous.x)*.4))<1e-9,'Presentation interpolates the fixed-step history using remaining frame time');
assert.ok(sampled.x<interpolated.x&&sampled.x>previous.x,'Interpolation stays between resolved physics poses');
const retainedClock=interpolated.accumulator;
interpolated.x=250;interpolated.z=-80;resetDrivingInterpolation(interpolated);
assert.equal(sampleDrivingPose(interpolated).x,250,'Teleport/recovery reset cannot blend back toward the old car position');
assert.equal(interpolated.accumulator,retainedClock,'Presentation resets preserve the deterministic simulation clock phase');
const wrapping=createDrivingState({heading:Math.PI-.004,speed:5,yawRate:1.2});
advanceDriving(wrapping,{},DRIVING.step*1.5,empty);
assert.ok(Math.abs(sampleDrivingPose(wrapping).heading)>3.1,'Heading interpolation crosses the angle seam by the shortest turn');
for(const key of ['vx','vz','yawRate','steering','bodyRoll','bodyPitch','bodyRollVelocity','bodyPitchVelocity']){
  assert.throws(()=>createDrivingState({...movingSnapshot,[key]:Infinity}),/Invalid car motion/,`Non-finite ${key} is rejected`);
}
assert.throws(()=>createDrivingState({vx:3}),/Incomplete car velocity/,'Partial optional velocity is rejected');
const boundedMotion=createDrivingState({vx:Number.MAX_VALUE,vz:Number.MAX_VALUE,yawRate:1e100});
assert.ok(Number.isFinite(boundedMotion.speed)&&boundedMotion.travelSpeed<=DRIVING.maxForward+1e-8&&boundedMotion.yawRate<=DRIVING.maxYawRate,'Extreme finite saved motion is bounded safely');
const boundedBody=createDrivingState({bodyRoll:.065,bodyPitch:.045,bodyRollVelocity:1,bodyPitchVelocity:1});
run(boundedBody,[[.3,{}]],120,empty,c=>assert.ok(Math.abs(c.bodyRoll)<=.065&&Math.abs(c.bodyPitch)<=.045,'Restored spring momentum cannot exceed visual body limits'));

const wallWorld=createDrivingWorld([rectangle('thin wall',20,-1000,20.08,1000)],bounds);
const headOn=run(createDrivingState(),[[9,{throttle:1}]],30,wallWorld);
assert.ok(headOn.x<17.051&&headOn.x>16.5&&headOn.travelSpeed<.1,'Maximum-speed approach stops before a thin wall');
const reverseWall=run(createDrivingState({x:32,heading:0,speed:-8}),[[3,{throttle:-1}]],60,wallWorld);
assert.ok(reverseWall.x>23.029&&reverseWall.x<23.4,'Rear hull also blocks reverse wall penetration');
let impactZ=null;
const slide=run(createDrivingState({heading:.6}),[[6,{throttle:1}]],60,wallWorld,c=>{if(c.collided&&impactZ===null)impactZ=c.z;});
assert.ok(impactZ!==null&&slide.z>impactZ+1,'Oblique wall contact allows sliding along the wall');

const bounded=createDrivingWorld([],{minX:-50,maxX:50,minZ:-50,maxZ:50});
const edge=run(createDrivingState({x:40,speed:28}),[[4,{throttle:1}]],30,bounded);
assert.ok(edge.x<=47.051&&edge.travelSpeed<.1,'Map bounds stop the complete car hull');
run(edge,[[2,{throttle:1,steer:1}],[4,{throttle:-1,steer:-1}]],144,bounded);

const courtyard=createDrivingWorld([{...rectangle('courtyard',-30,-30,30,30),holes:[[[-12,-12],[12,-12],[12,12],[-12,12]]]}],bounds);
assert.ok(isDrivingPoseClear(courtyard,{x:0,z:0,heading:0}),'Open courtyards remain accessible');
assert.ok(!isDrivingPoseClear(courtyard,{x:20,z:0,heading:0}),'Filled part of courtyard building remains solid');
const inside=run(createDrivingState(),[[5,{throttle:1}]],60,courtyard);
assert.ok(inside.x<9.051,'Car cannot escape through an interior courtyard wall');

const cornerWorld=createDrivingWorld([rectangle('north block',10,-30,40,8),rectangle('south block',25,8,40,35)],bounds);
run(createDrivingState({x:-20,z:10,heading:-.1,speed:24}),[[3,{throttle:1,steer:-.2}],[2,{throttle:-1,steer:1}],[2,{throttle:1,steer:1}]],30,cornerWorld);
const recovered=nearestRoadPose(wallWorld,[{p:[[-40,5],[40,5]],w:14},{p:[[-30,-10],[-30,40]],w:8}],{x:20,z:5},0);
assert.ok(recovered&&isDrivingPoseClear(wallWorld,recovered),'Recovery finds a clear road pose even when the closest road intersects a solid');
const saved=snapshotDriving(left),restored=createDrivingState(JSON.parse(JSON.stringify(saved)));
for(const key of ['x','z','heading','speed'])assert.ok(Math.abs(restored[key]-left[key])<1e-8,'Free-driving pose survives JSON save/load');
const boom=cameraBoomFraction(wallWorld,{x:30,z:0},{x:10,z:0});
assert.ok(boom>.45&&boom<.48,'Chase camera shortens its boom before a thin wall');
assert.equal(cameraBoomFraction(wallWorld,{x:0,z:0},{x:-10,z:0}),1,'Clear camera boom retains its full distance');
const benchWorld=createDrivingWorld([{...rectangle('low bench',20,-10,20.5,10),height:1.15}],bounds);
assert.equal(cameraBoomFraction(benchWorld,{x:30,y:1.75,z:0},{x:10,y:4.4,z:0}),1,'Verified low props can pass below the camera boom');
assert.ok(cameraBoomFraction(benchWorld,{x:30,y:.9,z:0},{x:10,y:.9,z:0})<1,'The camera still collides with low props at their height');
assert.ok(cameraBoomFraction(benchWorld,{x:30,z:0},{x:10,z:0})<1,'Legacy two-dimensional camera queries remain conservative');
assert.ok(!isDrivingPoseClear(benchWorld,{x:20,z:0,heading:0}),'Prop height never disables its vehicle collision');
const legacyRestore=createDrivingState({x:2,z:3,heading:.4,speed:7});
assert.equal(legacyRestore.yawRate,0,'Legacy four-field saved poses retain stable zero-yaw defaults');
assert.equal(sampleDrivingPose(legacyRestore).x,legacyRestore.x,'Newly restored poses start without stale interpolation history');

// Validate the actual city footprints and intersections used by the app.
const city=createDrivingWorld(WORLD_SURFACES.drivingSolids,WORLD_SURFACES.drivingBounds);
assert.ok(city.solids.length>500,'Production building collision data is present');
let laneSpawns=0;
for(let i=0;i<CITY_DATA.route.length-1;i++){
  const a=CITY_DATA.route[i],b=CITY_DATA.route[i+1],heading=Math.atan2(b[1]-a[1],b[0]-a[0]);
  for(const t of [0,.5])for(const offset of [-7,-3.5,3.5,7]){
    const pose={x:a[0]+(b[0]-a[0])*t-Math.sin(heading)*offset,z:a[1]+(b[1]-a[1])*t+Math.cos(heading)*offset,heading};
    assert.ok(isDrivingPoseClear(city,pose),'Every scenic lane position permits immediate free-driving takeover');laneSpawns++;
  }
}
// Drive a 560 m route through two real corners: Reno -> Hudson -> Sheridan.
// A test-only pure-pursuit driver follows this path at neighborhood speed.
const path=[];
function line(a,b){const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);for(let i=0;i<count;i++)path.push([a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count]);}
line([-250,295.4],[-182,295.4]);
for(let i=0;i<=12;i++){const angle=i*Math.PI/24;path.push([-182+10*Math.sin(angle),285.4+10*Math.cos(angle)]);}
line([-172,285.4],[-169,230]);line([-169,230],[-170,141]);line([-170,141],[-172,65]);
for(let i=0;i<=12;i++){const angle=i*Math.PI/24;path.push([-162-10*Math.cos(angle),65-10*Math.sin(angle)]);}
line([-162,55],[80,55]);path.push([80,55]);
const cityCar=createDrivingState({x:path[0][0],z:path[0][1],heading:0,speed:5});
let nearest=0,cityContacts=0,seconds=0;
for(;seconds<110;seconds+=1/60){
  let best=Infinity;
  for(let i=nearest;i<Math.min(path.length,nearest+15);i++){const p=path[i],distance=(p[0]-cityCar.x)**2+(p[1]-cityCar.z)**2;if(distance<best){best=distance;nearest=i;}}
  if(nearest>=path.length-2)break;
  const target=path[Math.min(path.length-1,nearest+4)],dx=target[0]-cityCar.x,dz=target[1]-cityCar.z,distance=Math.hypot(dx,dz);
  const error=Math.atan2(Math.sin(Math.atan2(dz,dx)-cityCar.heading),Math.cos(Math.atan2(dz,dx)-cityCar.heading));
  const steer=Math.atan(DRIVING.wheelbase*2*Math.sin(error)/Math.max(2,distance))*(1+Math.abs(cityCar.speed)*.035)/.57;
  advanceDriving(cityCar,{throttle:cityCar.speed<6?1:0,steer},1/60,city);
  if(cityCar.collided)cityContacts++;
  assert.ok(isDrivingPoseClear(city,cityCar),'Real intersection turns do not penetrate buildings');
}
assert.ok(nearest>=path.length-2&&cityCar.x>75,'Both real city turns are navigable');
assert.equal(cityContacts,0,'Mapped road corner route has no invisible collision barriers');
for(const pose of [{x:0,z:0,heading:0},{x:0,z:120,heading:Math.PI/2},{x:300,z:330,heading:0},{x:1250,z:-900,heading:Math.PI}]){
  const safe=nearestRoadPose(city,CITY_DATA.roads,pose,pose.heading);
  assert.ok(safe&&isDrivingPoseClear(city,safe,.07),'Recovery finds a clear mapped road from landmarks and map edges');
}

const presentation=await checkDrivingPresentation(new URL(runtime,import.meta.url));
console.log(JSON.stringify({passed:true,frameRates:[30,60,144],fixedStepHz:120,tests:['throttle','brake then reverse','forward from reverse','steering symmetry','handbrake','speed limits','world momentum','finite tire grip','yaw inertia and recovery','handbrake slide and recovery','reverse steering','pose interpolation','angle wrapping','teleport reset','saved momentum and validation','thin-wall collision','rear collision','wall sliding','bounds','courtyard holes','corner recovery','camera boom','legacy JSON pose round-trip'],presentation,city:{solids:city.solids.length,laneSpawns,intersectionRoute:'Reno to Hudson to Sheridan',intersectionContacts:cityContacts,simulationSeconds:Math.round(seconds)},finalPose:snapshotDriving(poses[0])},null,2));
