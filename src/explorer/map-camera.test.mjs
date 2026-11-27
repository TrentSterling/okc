import assert from 'node:assert/strict';
import test from 'node:test';
import {createMapCamera} from './map-camera.js';

const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} ≠ ${expected}`);
function camera(){const taps=[],model=createMapCamera({tap:e=>taps.push(e)});Object.assign(model.state,{width:800,height:600,center:{x:100,z:200},scale:.5});return {model,taps};}

test('map zoom keeps the exact world point under an off-center pivot',()=>{
 const {model}=camera(),pivot={x:243,y:167},before=model.world(pivot.x,pivot.y);model.zoom(1.75,pivot);const after=model.world(pivot.x,pivot.y);
 close(after.x,before.x,'World x at pivot');close(after.z,before.z,'World z at pivot');close(model.state.scale,.875,'Scale');
});

test('two-finger pinch combines scale and center movement around the previous midpoint',()=>{
 const {model,taps}=camera();model.down({pointerId:1,x:200,y:200});model.down({pointerId:2,x:400,y:200});
 const anchor=model.world(300,200);model.move({pointerId:2,x:500,y:260});const after=model.world(350,230);
 close(after.x,anchor.x,'Pinch midpoint x');close(after.z,anchor.z,'Pinch midpoint z');close(model.state.scale,.5*Math.hypot(300,60)/200,'Pinch distance ratio');
 model.up({pointerId:1,x:200,y:200});model.up({pointerId:2,x:500,y:260});assert.equal(taps.length,0,'Pinch release must never select a place.');
});

test('one-finger panning follows its pointer and survives a pinch finger lifting',()=>{
 const {model,taps}=camera();const before={...model.state.center};model.down({pointerId:1,x:200,y:200});model.move({pointerId:1,x:240,y:230});
 close(model.state.center.x,before.x-80,'Pan x');close(model.state.center.z,before.z-60,'Pan z');
 model.down({pointerId:2,x:400,y:200});model.up({pointerId:2,x:400,y:200});const center={...model.state.center};model.move({pointerId:1,x:250,y:235});
 close(model.state.center.x,center.x-20,'Remaining-finger pan x');close(model.state.center.z,center.z-10,'Remaining-finger pan z');
 model.up({pointerId:1,x:250,y:235});assert.equal(taps.length,0);
});

test('canceled gestures clear ownership without generating a tap',()=>{
 const {model,taps}=camera();model.down({pointerId:1,x:10,y:10});model.cancel({pointerId:1});model.up({pointerId:1,x:10,y:10});
 model.down({pointerId:2,x:10,y:10});model.down({pointerId:3,x:30,y:10});model.clear();model.up({pointerId:2,x:10,y:10});
 assert.equal(model.pointers.size,0);assert.equal(taps.length,0);
 model.down({pointerId:4,x:50,y:50});model.up({pointerId:4,x:50,y:50});assert.equal(taps.length,1,'A fresh tap after cancellation still works.');
});

test('a displaced pointerup cannot select when intermediate move events were omitted',()=>{
 const {model,taps}=camera();model.down({pointerId:1,x:100,y:100});model.up({pointerId:1,x:150,y:100});assert.equal(taps.length,0);
});

test('fit and focus center content within the unobscured map rectangle',()=>{
 const {model}=camera();model.state.insets={left:300,right:40,top:80,bottom:100};model.state.bounds=[-1000,-500,1000,500];model.fit();
 const middle=model.screen(0,0);close(middle[0],530,'Usable rectangle center x');close(middle[1],290,'Usable rectangle center y');
 const a=model.screen(-1000,-500),b=model.screen(1000,500);assert.ok(a[0]>=320&&b[0]<=740);assert.ok(a[1]>=100&&b[1]<=480);
 model.focus({x:70,z:90},.4);const focused=model.screen(70,90);close(focused[0],530,'Focused x');close(focused[1],290,'Focused y');assert.ok(model.state.scale>=.4);
});
