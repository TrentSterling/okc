#!/usr/bin/env node
// Deterministic controller tests. These exercise motion and real contact
// outcomes, not renderer implementation or source-code string patterns.
import assert from 'node:assert/strict';
import {DRIVING,createDrivingWorld,createDrivingState,advanceDriving,isDrivingPoseClear,nearestRoadPose,snapshotDriving,cameraBoomFraction} from '../dist/driving.js';
import {CITY_DATA} from '../dist/city-data.js';
import {WORLD_SURFACES} from '../dist/world-surfaces.js';

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
for(const car of poses.slice(1))for(const key of ['x','z','heading','vx','vz'])assert.ok(Math.abs(car[key]-poses[0][key])<1e-8,`${key} independent of render frame rate`);

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

console.log(JSON.stringify({passed:true,frameRates:[30,60,144],fixedStepHz:120,tests:['throttle','brake then reverse','forward from reverse','steering symmetry','handbrake','speed limits','thin-wall collision','rear collision','wall sliding','bounds','courtyard holes','corner recovery','camera boom','JSON pose round-trip'],city:{solids:city.solids.length,laneSpawns,intersectionRoute:'Reno to Hudson to Sheridan',intersectionContacts:cityContacts,simulationSeconds:Math.round(seconds)},finalPose:snapshotDriving(poses[0])},null,2));
