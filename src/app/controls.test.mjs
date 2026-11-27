import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlActions,createDriveInput,createWorldCameraInput} from './control-actions.js';
import {createInputRouter} from '../ui/input-router.js';
import {createWidgets} from '../ui/widgets.js';
import {drawHud} from './hud-view.js';
import {drawSettings,settingsBounds} from './settings-view.js';

const base=()=>({driveMode:'free',driving:true,speed:8,camera:'chase',direction:1,progress:.63,style:0,roughness:.055,exposure:1.08,route:.392,neutral:false,screen:false,sunPlaying:false,legends:false,sound:false,traffic:true,quality:'high'});
const cameraView=()=>({lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650});
const point=(pointerId,x,y)=>({pointerId,x,y,pointerType:'touch'});

test('actual UI router keeps pedal and steering pointers out of the camera, with independent release',()=>{
 const state=base(),view=cameraView(),keys=new Set(),touchInputs=new Map();let takeovers=0,picks=0;
 const input=createDriveInput({getState:()=>state,keys,touchInputs,onTakeover:()=>takeovers++});
 const camera=createWorldCameraInput({getState:()=>state,view});
 const router=createInputRouter({worldTap:()=>picks++});router.setWorld(camera);
 const hold=(id,rect,action)=>({id,rect,onDown:e=>input.begin(e.pointerId,action),onUp:e=>input.end(e.pointerId),onCancel:e=>input.end(e.pointerId),lockDrag:true});
 router.setTargets([hold('gas',{x:220,y:300,w:64,h:60},'throttle'),hold('left',{x:20,y:300,w:64,h:60},'left')]);
 router.down(point(1,240,320));router.down(point(2,40,320));
 assert.equal(takeovers,1);assert.equal(input.isHeld('throttle'),true);assert.equal(input.isHeld('left'),true);
 router.move(point(1,130,100));assert.equal(view.lookYaw,0,'dragging a pedal away must not turn the camera');
 router.down(point(3,150,100));router.move(point(3,180,112));assert.equal(view.lookYaw,-.09);
 router.up(point(2,40,320));assert.equal(input.isHeld('left'),false);assert.equal(input.isHeld('throttle'),true);
 router.up(point(1,130,100));router.up(point(3,180,112));assert.equal(picks,0);assert.equal(touchInputs.size,0);
});

test('manual takeover happens on the first source, never key repeat or an additional held source',()=>{
 const state=base(),keys=new Set(),touchInputs=new Map();let takeovers=0;
 const input=createDriveInput({getState:()=>state,keys,touchInputs,onTakeover:()=>{takeovers++;state.speed=0;}});
 input.keyDown('KeyW');state.speed=12;
 for(let i=0;i<80;i++)input.keyDown('KeyW',true);
 input.begin(1,'left');input.begin(2,'throttle');
 assert.equal(state.speed,12);assert.equal(takeovers,1);
 input.keyUp('KeyW');input.end(1);assert.equal(input.isHeld('throttle'),true);
 input.end(2);input.begin(3,'brake');assert.equal(takeovers,2);
 input.clear();assert.equal(keys.size,0);assert.equal(touchInputs.size,0);
 assert.equal(input.keyDown('KeyW',true),false,'a cleared held key cannot restart driving through autorepeat');
});

test('cancellation releases every held source and world pinch uses only routed camera fingers',()=>{
 const state={...base(),camera:'orbit'},view=cameraView(),keys=new Set(),touchInputs=new Map();
 const input=createDriveInput({getState:()=>state,keys,touchInputs}),camera=createWorldCameraInput({getState:()=>state,view});
 input.begin(77,'throttle');camera.down(point(1,100,100));camera.down(point(2,200,100));camera.move(point(2,300,100));
 assert.equal(view.orbitDistance,325);assert.equal(input.isHeld('throttle'),true);
 camera.cancel();input.clear();const distance=view.orbitDistance;camera.move(point(2,500,100));assert.equal(view.orbitDistance,distance);assert.equal(touchInputs.size,0);
});

function commands(){
 const state=base(),view=cameraView(),calls=[];
 const ui={sync:()=>calls.push(['sync']),setStudyView:id=>calls.push(['study',id]),setPanel:()=>{},closePanel:()=>{},toggleHud:()=>{}};
 const actions=new Proxy({setQuality:value=>{state.quality=value;calls.push(['quality',value]);}}, {get(target,key){return key in target?target[key]:(...args)=>calls.push([key,...args]);}});
 let picker;
 const platform={pickJSON:(callback,options)=>{picker={callback,options};},openURL:()=>{}};
 const setup={save:()=>calls.push(['save']),load:async event=>calls.push(['load',await event.target.files[0].text()])};
 return {state,view,calls,get picker(){return picker;},command:createControlActions({getState:()=>state,getSimTime:()=>25,view,ui,setup,actions,platform})};
}

test('shared settings enforce ranges and route ownership while retaining side effects',()=>{
 const {state,view,calls,command}=commands();
 assert.equal(command.setSetting('exposure',Infinity),false);assert.equal(state.exposure,1.08);
 command.setSetting('roughness',9);assert.equal(state.roughness,.35);
 assert.equal(command.setSetting('route',.8),false);assert.equal(state.route,.392);
 command.setSetting('quality','low');assert.deepEqual(calls.find(c=>c[0]==='quality'),['quality','low']);
 command.setSetting('neutral',true);assert.equal(state.screen,false);assert.equal(calls.at(-2)[0],'updateAtmosphere');
 command.setSetting('progress',.18,{commit:true});assert.equal(state.neutral,false);assert.equal(state.sunPlaying,false);
 command.setSetting('sound',true);assert.ok(calls.some(c=>c[0]==='enableAudio'));
 command.setSetting('legends',true);assert.equal(state.camera,'orbit');assert.equal(view.orbitDistance,700);
 state.driveMode='scenic';command.setSetting('route',.8);assert.equal(state.driving,false);assert.equal(state.speed,0);assert.equal(view.firstCamera,true);
});

test('setup picker is invoked synchronously and delegates its native file to the existing decoder path',async()=>{
 const fixture=commands();fixture.command.loadSetup();assert.equal(fixture.picker.options.maxBytes,50000);
 await fixture.picker.callback({version:2},{file:{size:13,text:async()=>'saved-payload'},text:'saved-payload',size:13});
 assert.deepEqual(fixture.calls.at(-1),['load','saved-payload']);
});

const screens=[
 [320,568,{}],[360,640,{}],[390,844,{top:47,bottom:34}],
 [844,390,{left:44,right:44,bottom:21}],[1366,768,{}],
];
const noop=()=>{};
function context(width,height,insets={}){
 const host={width,height,insets,router:{pressed:new Set(),hovered:null},focusId:null,scrolls:new Map(),platform:{editing:null},openSelect:noop,invalidate:noop};
 const surface={text:()=>18,rect:noop,circle:noop,line:noop,measure:text=>text.length*8};
 return createWidgets(host,surface);
}
const controller=new Proxy({isHeld:()=>false},{get:(object,key)=>object[key]||noop});
const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0;

test('HUD touch targets remain reachable, separate and at least 44px on narrow and short phones',()=>{
 for(const [width,height,insets]of screens){
  for(const driveMode of ['free','scenic']){
   const ctx=context(width,height,insets);drawHud(ctx,{state:{...base(),driveMode},telemetry:{gear:'D'},hudVisible:true},controller);
   assert.ok(ctx.targets.some(t=>t.id==='scene-settings'));
   const widgets=ctx.targets.filter(t=>t.focusable);
   for(const {id,rect:r}of widgets){assert.ok(r.w>=44&&r.h>=44,id);assert.ok(r.x>=(insets.left||0)&&r.y>=(insets.top||0)&&r.x+r.w<=width-(insets.right||0)&&r.y+r.h<=height-(insets.bottom||0),id+' escapes '+width+'x'+height);}
   for(let a=0;a<widgets.length;a++)for(let b=a+1;b<widgets.length;b++)assert.equal(intersects(widgets[a].rect,widgets[b].rect),false,widgets[a].id+' overlaps '+widgets[b].id);
   assert.equal(ctx.targets.filter(t=>t.kind==='hold').length,driveMode==='free'?5:0);
  }
 }
});

test('settings/help remain scrollable and closable in short landscape, with a full world-input blocker',()=>{
 for(const [width,height,insets]of screens){
  for(const panel of ['settings','help']){
   const ctx=context(width,height,insets),bounds=settingsBounds(width,height,insets);
   drawSettings(ctx,{state:base(),telemetry:{},panel,studyView:'',preset:'prism',timeLabel:'Afterglow'},controller);
   const close=ctx.targets.find(t=>t.id==='scene-panel-close'),block=ctx.targets.find(t=>t.id==='scene-modal-backdrop');
   assert.ok(close&&close.rect.h>=44);assert.ok(close.rect.y+close.rect.h<=height-(insets.bottom||0));
   assert.deepEqual(block.rect,{x:0,y:0,w:width,h:height});assert.ok(bounds.h>100);
   assert.ok(ctx.targets.some(t=>t.scrollId),'content must use the shared scroller');
  }
 }
});
