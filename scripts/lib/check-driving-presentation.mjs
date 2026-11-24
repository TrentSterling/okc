import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {registerThree} from './register-three.mjs';

// Run the real camera and Three transforms without a WebGL renderer. Only the
// cockpit's decorative canvas is stubbed; pose, spring and sweep math is real.
export async function checkDrivingPresentation(runtimeURL) {
  registerThree(fileURLToPath(new URL('../../',import.meta.url)));
  const THREE=await import('three');
  const {createCameraRig}=await import(new URL('app/camera.js',runtimeURL));
  const {createDrivingWorld,createDrivingState,advanceDriving,sampleDrivingPose,resetDrivingInterpolation,cameraBoomFraction,snapshotDriving,DRIVING}=await import(new URL('driving.js',runtimeURL));
  const {springValue,wrapAngle}=await import(new URL('driving-motion.js',runtimeURL));
  const {defaults,decodeSetup}=await import(new URL('app/setup.js',runtimeURL));
  const previousDocument=globalThis.document;
  const context=new Proxy({},{get:()=>()=>{},set:()=>true});
  globalThis.document={createElement:()=>({getContext:()=>context})};
  try{
    const bounds={minX:-2000,maxX:2000,minZ:-2000,maxZ:2000};
    const empty=createDrivingWorld([],bounds);
    const state={...defaults,driveMode:'free',driving:true,camera:'driver'};
    const buildRig=(drivingWorld=empty)=>{
      const camera=new THREE.PerspectiveCamera(48,16/9,.5,7500),player=new THREE.Group();
      player.userData.body=new THREE.Group();player.add(player.userData.body);
      const world={getRoutePoint:()=>new THREE.Vector3(3,.14,5),getRouteTangent:()=>new THREE.Vector3(1,0,0)};
      const rig=createCameraRig({camera,player,world,drivingWorld,atmosphere:{follow(){}}});
      return {camera,player,rig};
    };
    let framesWithoutPhysics=0;
    for(const hz of [30,60,144]){
      const {camera,player,rig}=buildRig(),car=createDrivingState({speed:12});
      rig.update(0,state,car,0);
      for(let frame=0;frame<hz;frame++){
        const oldX=car.x,oldRenderX=player.position.x;
        advanceDriving(car,{throttle:1,steer:.4},1/hz,empty);rig.update(1/hz,state,car,0);
        const pose=sampleDrivingPose(car,{},empty),forward=new THREE.Vector3(Math.cos(pose.heading),0,Math.sin(pose.heading));
        assert.ok(player.position.distanceTo(new THREE.Vector3(pose.x,.14,pose.z))<1e-12,'Car mesh consumes the interpolated physics pose');
        assert.ok(Math.abs(wrapAngle(-player.rotation.y-pose.heading))<1e-12,'Car heading consumes the same wrapped pose');
        assert.ok(camera.position.distanceTo(player.position.clone().addScaledVector(forward,.5).add(new THREE.Vector3(0,1.46,0)))<1e-12,'Driver camera and car use the same interpolated anchor without a second position lag');
        assert.equal(player.userData.body.rotation.x,pose.bodyRoll,'Body roll is taken from the shared pose');
        assert.equal(player.userData.body.rotation.z,pose.bodyPitch,'Body pitch is taken from the shared pose');
        assert.ok(Math.abs(pose.bodyRoll)<=.065&&Math.abs(pose.bodyPitch)<=.045,'Cosmetic body motion remains subtle');
        if(oldX===car.x&&oldRenderX!==player.position.x)framesWithoutPhysics++;
      }
      // Camera-only changes must not alter the phase of the 120 Hz simulation.
      const accumulator=car.accumulator;
      rig.view.firstCamera=true;rig.update(0,state,car,0);
      assert.equal(car.accumulator,accumulator,'Camera invalidation does not consume simulation time');
      assert.equal(player.position.x,car.x,'Capture invalidation displays the current physics pose');
      car.x+=250;car.z-=120;rig.reset(car);rig.update(0,state,car,0);
      assert.equal(player.position.x,car.x,'Recovery/teleport resets both rendered car and camera');
      const restored=createDrivingState(snapshotDriving(car));
      rig.restore(rig.snapshot());rig.update(0,state,restored,0);
      assert.equal(player.position.z,restored.z,'Saved setup restore cannot reuse another car’s history');
      rig.update(0,{...state,driveMode:'scenic'},restored,0);
      assert.deepEqual(player.position.toArray(),[3,.14,5],'Switching to scenic mode retains the automatic route position');
      assert.equal(player.userData.body.rotation.x,0,'Scenic mode clears manual-driving body lean');
      rig.update(0,state,restored,0);
      assert.equal(player.position.x,restored.x,'Returning from scenic mode starts at the current free-driving pose');
    }
    assert.ok(framesWithoutPhysics>0,'High-refresh frames interpolate between physics ticks instead of repeating the car pose');

    const chaseState={...state,camera:'chase'},mutableWorld=createDrivingWorld([],bounds);
    const {camera,player,rig}=buildRig(mutableWorld),car=createDrivingState({x:25});
    rig.update(0,chaseState,car,0);
    const fullLength=camera.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,1.6,0)));
    const wall=createDrivingWorld([{polygon:[[20,-50],[20.08,-50],[20.08,50],[20,50]]}],bounds);
    Object.assign(mutableWorld,wall);rig.update(0,chaseState,car,0);
    const anchor=player.position.clone().add(new THREE.Vector3(0,1.6,0));
    const contractedLength=camera.position.distanceTo(anchor);
    assert.ok(contractedLength<fullLength*.5&&camera.position.x>20.48,'A newly obstructed boom contracts immediately even with zero frame time');
    assert.equal(cameraBoomFraction(mutableWorld,anchor,camera.position),1,'The contracted boom remains entirely on the car’s side of the wall');
    Object.assign(mutableWorld,createDrivingWorld([],bounds));rig.update(1/60,chaseState,car,0);
    const recoveringLength=camera.position.distanceTo(anchor);
    assert.ok(recoveringLength>contractedLength&&recoveringLength<fullLength-.5,'Boom distance recovers smoothly after an obstacle clears');
    for(let i=0;i<120;i++)rig.update(1/60,chaseState,car,0);
    assert.ok(Math.abs(camera.position.distanceTo(anchor)-fullLength)<.001,'Unobstructed boom returns to its normal distance');
    const reverse=createDrivingState({speed:-8});rig.reset(reverse);rig.update(0,chaseState,reverse,0);
    assert.ok(camera.position.x<player.position.x-10,'Reversing does not flip the chase camera to the front');

    const springResults=[30,60,144].map(hz=>{
      const spring={heading:Math.PI-.1,headingVelocity:0};
      for(let i=0;i<hz;i++)springValue(spring,'heading',-Math.PI+.1,9,1/hz,false,true);
      assert.ok(Math.abs(spring.heading)>3,'Camera heading springs take the short path across the angle seam');
      return spring.heading;
    });
    for(const value of springResults)assert.ok(Math.abs(value-springResults[0])<1e-10,'Analytic camera damping is frame-rate independent for a fixed target');

    const payload={version:2,state,view:rig.snapshot(),driving:{x:5,z:6,heading:.2,speed:7}};
    const legacy=decodeSetup(payload,empty);
    assert.equal(legacy.freeCar.yawRate,0,'Actual v2 setup decoder accepts legacy four-field car poses');
    for(const heading of [-2.9,-1.4,.2,1.2,2.7])for(const speed of [-DRIVING.maxReverse,DRIVING.maxForward]){
      const fullSpeed=createDrivingState({x:5,z:6,heading,speed});
      assert.doesNotThrow(()=>decodeSetup({...payload,driving:snapshotDriving(fullSpeed)},empty),'Floating-point projection cannot invalidate a saved maximum-speed pose');
    }
    const moving=createDrivingState({x:5,z:6,heading:.2,speed:7,vx:8,vz:2,yawRate:.4,steering:.3});
    const loaded=decodeSetup({...payload,driving:snapshotDriving(moving)},empty);
    for(const key of ['vx','vz','yawRate','steering'])assert.ok(Math.abs(loaded.freeCar[key]-moving[key])<1e-12,'Actual setup decoder preserves optional motion');
    assert.throws(()=>decodeSetup({...payload,driving:{...payload.driving,vx:Infinity,vz:0}},empty),/Invalid car motion/,'Setup decoder rejects invalid optional motion before replacing current state');
    resetDrivingInterpolation(loaded.freeCar);
    assert.equal(sampleDrivingPose(loaded.freeCar).x,loaded.freeCar.x,'Decoded setup begins with synchronized interpolation');
    return {frameRates:[30,60,144],sharedPose:true,betweenTickFrames:framesWithoutPhysics,bodyMotion:true,teleportAndModeReset:true,cameraSweep:'immediate contraction, smooth recovery',legacyAndMovingSetup:true};
  }finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
}
