import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

// Compare two explicitly built versions without a GPU. Scene construction and
// WebGL are mocked; application modules, controls, camera math and captures run.
const {values}=parseArgs({options:{
 'baseline-dir':{type:'string'},
 'candidate-dir':{type:'string'},
},strict:true});
if(!values['baseline-dir']){
 console.error('Usage: node --experimental-vm-modules scripts/check-app-parity.mjs --baseline-dir <built-baseline-dist> [--candidate-dir <built-candidate-dist>]');
 process.exit(2);
}
if(typeof vm.SourceTextModule!=='function')throw new Error('Run this check with node --experimental-vm-modules.');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baselineDir=path.resolve(values['baseline-dir']);
const candidateDir=path.resolve(values['candidate-dir']??path.join(repo,'dist'));

async function exercise(root){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const RealThree=await import(pathToFileURL(path.join(root,'vendor/three.module.js')).href);
 const presets=await import(pathToFileURL(path.join(root,'capture-presets.js')).href);
 let clock=0,raf=null,lastRender=null;
 const blobs=new Map(),elements=[],byId=new Map(),trace=[],snapshots=[],captures=[];
 class Element{
  constructor(tag='div',attrs={}){
   this.tagName=tag.toUpperCase();this.listeners=new Map();this.dataset={};this.attributes={...attrs};this.value=attrs.value??'';this.checked='checked'in attrs;this.hidden='hidden'in attrs;this.disabled=false;this.textContent='';this.title='';
   this.classes=new Set((attrs.class??'').split(/\s+/).filter(Boolean));this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v),toggle:(v,on)=>{if(on===undefined)on=!this.classes.has(v);on?this.classes.add(v):this.classes.delete(v);return on;}};
   for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
  }
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
  async emit(type,extra={}){const e={target:this,preventDefault(){},...extra};for(const fn of this.listeners.get(type)??[])await fn(e);}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){document.activeElement=this;}
  setPointerCapture(){}
  querySelector(){return this.child??=(new Element('p'));}
  getContext(kind){if(kind==='webgl2')return {getExtension:()=>null};return new Proxy({},{get:()=>()=>{}});}
  toDataURL(){return 'data:image/png;base64,cGFyaXR5';}
  click(){return this.emit('click');}
 }
 for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)){
  const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
  const el=new Element(match[1],attrs);elements.push(el);if(attrs.id)byId.set(attrs.id,el);
 }
 const document=new Element();document.body=elements.find(e=>e.tagName==='BODY')??new Element('body');document.documentElement=new Element('html');document.activeElement=document.body;document.hidden=false;
 document.getElementById=id=>{assert(byId.has(id),'Missing DOM id '+id);return byId.get(id);};
 document.querySelectorAll=selector=>{const attr=selector.slice(1,-1);return elements.filter(el=>attr in el.attributes);};
 document.createElement=tag=>new Element(tag);
 document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;};document.exitFullscreen=async()=>{document.fullscreenElement=null;};
 const window=new Element();
 const audioNode=()=>({connect(node){return node;},start(){},gain:{value:0,setTargetAtTime(){}},frequency:{value:0,setTargetAtTime(){}}});
 window.AudioContext=class{constructor(){this.sampleRate=10;this.currentTime=0;this.state='running';this.destination={};}createGain(){return audioNode();}createBuffer(){return {getChannelData:()=>new Float32Array(20)};}createBufferSource(){return audioNode();}createBiquadFilter(){return audioNode();}createOscillator(){return audioNode();}resume(){this.state='running';}};
 class Renderer{
  constructor({canvas}){this.domElement=canvas;this.shadowMap={};this.debug={};this.info={render:{calls:35,triangles:2000}};this.target=null;}
  setClearColor(){} setPixelRatio(v){this.ratio=v;} setSize(w,h){this.width=w;this.height=h;} resetState(){} setViewport(){} setScissorTest(){} clear(){} setRenderTarget(x){this.target=x;} getRenderTarget(){return this.target;}
  render(scene,camera){lastRender={position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,aspect:camera.aspect,width:this.width,height:this.height,ratio:this.ratio};}
 }
 const three={...RealThree,WebGLRenderer:Renderer};
 const worldStub={
  createWorld(){return {drivingSolids:[],drivingBounds:{minX:-1600,maxX:1600,minZ:-1130,maxZ:1130},drivingRoads:[{p:[[-1400,80],[1400,80]],width:14}],routeLength:2550,laneBase:5.25,laneSpacing:3.5,laneLimit:1.75,getRoutePoint:(s,off=0)=>new RealThree.Vector3(-1400+s*2550,.14,80+off),getRouteTangent:()=>new RealThree.Vector3(1,0,0),update(...v){trace.push(['world',...v]);}};},
  createCar(){const g=new RealThree.Group();g.userData.setNight=n=>trace.push(['car-night',n]);return g;}
 };
 const towerStub={createDevon(){return{group:new RealThree.Group(),update(...v){trace.push(['devon',...v]);}};},createLegends(){return{group:new RealThree.Group(),update(...v){trace.push(['legends',...v]);}};}};
 const skyStub={createGlassMaterial(){return{material:new RealThree.MeshStandardMaterial(),uniforms:{style:{value:0},night:{value:0}},clearLocalReflection(){trace.push(['clear-reflection']);}};},createAtmosphere(renderer,scene){const uniforms={uProgress:{value:0},uStyle:{value:0},uNeutral:{value:0}};return{uniforms,update(p,s,f,n,neutral){uniforms.uProgress.value=p;uniforms.uStyle.value=s;uniforms.uNeutral.value=neutral?1:0;scene.environment={};trace.push(['sky',p,s,f,n??null,neutral??null]);return true;},night:p=>p,captureLocalReflection(o){trace.push(['reflection',o.size,o.force]);return true;},follow(){},prepareShadows(p,n,m){trace.push(['shadows',p.toArray(),n,m]);},setQuality(v){trace.push(['quality',v]);}};}};
 class TestURL extends URL{}
 TestURL.createObjectURL=blob=>{const id='blob:'+blobs.size;blobs.set(id,blob);return id;};TestURL.revokeObjectURL=()=>{};
 const context=vm.createContext({console,performance:{now:()=>clock},document,window,location:{search:''},devicePixelRatio:1.7,innerWidth:1280,innerHeight:720,requestAnimationFrame:fn=>{raf=fn;},setTimeout:()=>0,clearTimeout(){},URL:TestURL,URLSearchParams,Blob});
 const modules=new Map();
 const synthetic=(id,exports)=>{const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:id});return m;};
 modules.set('three',synthetic('three',three));
 for(const [name,exports]of Object.entries({'world.js':worldStub,'tower.js':towerStub,'sky.js':skyStub}))modules.set(path.resolve(root,name),synthetic(name,exports));
 async function moduleFor(id){
  if(modules.has(id))return modules.get(id);
  const m=new vm.SourceTextModule(await fs.readFile(id,'utf8'),{context,identifier:id});modules.set(id,m);
  await m.link(async(spec,ref)=>moduleFor(spec==='three'?'three':path.resolve(path.dirname(ref.identifier),spec)));
  return m;
 }
 const app=await moduleFor(path.resolve(root,'app.js'));await app.evaluate();assert.equal(await app.namespace.sceneReady,true);
 const el=id=>document.getElementById(id);
 const byData=(key,val)=>elements.find(e=>e.dataset[key]===val);
 const emit=async(target,type,extra)=>target.emit(type,extra);
 const input=async(id,value,type='input')=>{el(id).value=value;await emit(el(id),type);};
 const toggle=async(id,value)=>{el(id).checked=value;await emit(el(id),'change');};
 const frames=async(n)=>{for(let i=0;i<n;i++){clock+=1000/60;raf(clock);}};
 const key=async(code,type='keydown')=>{document.activeElement=el('scene');await emit(window,type,{code,repeat:false});};
 async function snapshot(name){await emit(el('exportBtn'),'click');const payload=JSON.parse(await [...blobs.values()].at(-1).text());snapshots.push({name,payload,render:structuredClone(lastRender),ui:Object.fromEntries([...byId].map(([id,e])=>[id,{value:e.value,checked:e.checked,hidden:e.hidden,disabled:e.disabled,text:e.textContent,title:e.title,attrs:e.attributes,classes:[...e.classes].sort(),dataset:e.dataset}]))});return payload;}
 const original=await snapshot('initial');
 await emit(el('driveBtn'),'click');await frames(12);await snapshot('cruise');
 await key('KeyA');await key('KeyA','keyup');await frames(6);await key('KeyC');await emit(el('scene'),'pointerdown',{pointerId:1,clientX:20,clientY:20});await emit(el('scene'),'pointermove',{pointerId:1,clientX:100,clientY:70});await emit(el('scene'),'pointerup',{pointerId:1});await frames(2);await snapshot('driver-look');
 await emit(el('directionBtn'),'click');await frames(2);await snapshot('reverse-direction');
 await key('KeyF');await key('KeyW');await frames(15);await key('KeyD');await frames(15);await key('KeyW','keyup');await key('KeyD','keyup');await snapshot('free-moving');
 await emit(window,'blur');await frames(1);await snapshot('free-paused');
 await key('KeyR');await frames(1);await snapshot('recovered');
 await emit(byData('camera','orbit'),'click');await emit(el('scene'),'pointerdown',{pointerId:2,clientX:0,clientY:0});await emit(el('scene'),'pointermove',{pointerId:2,clientX:30,clientY:-60});await emit(el('scene'),'pointercancel',{pointerId:2});await emit(el('scene'),'wheel',{deltaY:100});await frames(2);const freeSaved=await snapshot('free-orbit');
 const touch=byData('driveControl','throttle');await emit(touch,'pointerdown',{pointerId:3});await frames(3);await emit(touch,'lostpointercapture',{pointerId:3});await frames(1);await snapshot('touch-driving');
 await key('KeyF');await frames(2);await snapshot('back-to-scenic');
 await toggle('legendsToggle',true);await frames(2);await snapshot('legends-orbit');
 await input('roughness','.2');await input('exposure','1.8');await input('styleMix','0.7');await input('qualitySelect','low','change');await input('timeSlider','.9');await input('timeSlider','.9','change');await frames(2);await snapshot('appearance');
 await toggle('soundToggle',true);await key('KeyM');await key('KeyN');await frames(2);await snapshot('audio-neutral');
 await emit(el('hideBtn'),'click');await key('Escape');await emit(el('helpBtn'),'click');await key('Tab');await key('Escape');await snapshot('hud-help');
 const load=async(payload)=>{const data=JSON.stringify(payload);el('importInput').files=[{size:data.length,text:async()=>data}];await emit(el('importInput'),'change');};
 await load(freeSaved);await frames(1);await snapshot('free-restored');
 const beforeInvalid=await snapshot('before-invalid');await load({...freeSaved,state:{...freeSaved.state,roughness:900}});await snapshot('after-invalid');
 await load({...original,version:1,state:{...original.state,driveMode:undefined}});await frames(1);await snapshot('v1-restored');
 const presetId=[...presets.SHOT_BY_ID.keys()][2];await input('studyView',presetId,'change');await snapshot('study-preset');
 for(const id of presets.SHOT_BY_ID.keys()){const shot=app.namespace.captureView(id,1600,900);captures.push(shot);}
 app.namespace.finishCaptures();await snapshot('captures-restored');
 assert.throws(()=>app.namespace.captureView('missing'),/Unknown capture view/);
 await emit(el('resetBtn'),'click');await frames(1);await snapshot('reset');
 return JSON.parse(JSON.stringify({snapshots,captures,trace}));
}
const baseline=await exercise(baselineDir);
const modular=await exercise(candidateDir);
try{assert.deepEqual(modular,baseline);}catch{
 const diagnostics=await fs.mkdtemp(path.join(os.tmpdir(),'okc-app-parity-'));
 await Promise.all([
  fs.writeFile(path.join(diagnostics,'baseline.json'),JSON.stringify(baseline)),
  fs.writeFile(path.join(diagnostics,'candidate.json'),JSON.stringify(modular)),
 ]);
 throw new Error(`App parity failed. Full snapshots: ${diagnostics}`);
}
console.log(JSON.stringify({result:'PASS',snapshots:baseline.snapshots.length,capturePresets:baseline.captures.length,renderAndEnvironmentEvents:baseline.trace.length,scope:'app orchestration, controls, camera poses, UI, setup serialization, capture lifecycle; renderer and world construction are mocked'}));
