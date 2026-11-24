import * as THREE from 'three';
import {createWorld,createCar} from './world.js';
import {createDevon,createLegends} from './tower.js';
import {createAtmosphere,createGlassMaterial} from './sky.js';
import {SHOT_BY_ID} from './capture-presets.js';

const $=id=>document.getElementById(id);
const clamp=THREE.MathUtils.clamp;
const defaults={progress:.63,style:0,roughness:.055,exposure:1.08,route:.392,direction:1,lane:-1.75,speed:0,driving:false,cruise:true,sunPlaying:false,camera:'chase',screen:false,legends:false,traffic:true,sound:false,quality:'high',neutral:false};
let state={...defaults};
let renderer,scene,camera,world,devon,legends,atmosphere,glass,player;
let simTime=0,lastTime=performance.now(),lastEnvironment=0,frameCount=0,fpsTime=performance.now(),toastTimer;
let actualLane=-1.75,lookYaw=0,lookPitch=0,orbitYaw=2.25,orbitPitch=.19,orbitDistance=650,firstCamera=true;
let orbitFocus=null,viewFov=null;
let drag=null,hudVisible=true,prevNight=-1,audioContext=null,audioGain=null,engineOsc=null,noiseGain=null;
const keys=new Set();
const vUp=new THREE.Vector3(0,1,0),desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),carPosition=new THREE.Vector3();
let cockpit,steeringWheel;
let capturing=false,captureRestore=null;
let localReflectionOptions=null,lastLocalReflection=-10000;

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function fail(error){console.error(error);$('loading').hidden=true;$('errorPanel').hidden=false;$('errorPanel').querySelector('p').textContent='The scene could not start. '+(error?.message||'Check that WebGL2 is available and reload.');}

async function init(){
 renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=state.exposure;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.debug.onShaderError=(gl,program,vs,fs)=>{console.error(gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));throw new Error('This graphics driver could not compile a scene shader. Enable hardware acceleration or try another WebGL2-capable browser.');};
 renderer.setClearColor(0x192235);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.5,10000);scene.add(camera);
 $('loadingStatus').textContent='Building the skyline…';
 glass=createGlassMaterial();
 atmosphere=createAtmosphere(renderer,scene);
 world=createWorld({scene,glassMaterial:glass.material,seed:1907});
 devon=createDevon({glassMaterial:glass.material});scene.add(devon.group);
 legends=createLegends({glassMaterial:glass.material});legends.group.position.set(690,0,-280);legends.group.visible=false;scene.add(legends.group);
 player=createCar('sedan',0xc79956);scene.add(player);
 makeCockpit();
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
 setTimeout(()=>toast('Hold the sunset. Change your perspective.'),650);
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
 if(!localReflectionOptions||(!immediate&&now-lastLocalReflection<750))return;
 localReflectionOptions.size=state.quality==='high'?256:128;
 if(atmosphere.captureLocalReflection(localReflectionOptions))lastLocalReflection=now;
}
function updateCamera(dt){
 const laneOffset=(state.direction===1?0:-2*(world.laneBase??5.25))+actualLane;
 carPosition.copy(world.getRoutePoint(state.route,laneOffset));
 const tangent=world.getRouteTangent(state.route).multiplyScalar(state.direction);
 player.position.copy(carPosition);player.rotation.y=-Math.atan2(tangent.z,tangent.x);player.visible=state.camera!=='driver';
 cockpit.visible=state.camera==='driver';
 const perpendicular=new THREE.Vector3(-tangent.z,0,tangent.x);
 if(state.camera==='orbit'){
   const focus=orbitFocus?new THREE.Vector3(...orbitFocus):new THREE.Vector3(state.legends?190:0,state.legends?200:118,state.legends?-65:0);
   const r=orbitDistance*(state.legends?1.35:1);
   desiredPosition.set(focus.x+Math.cos(orbitYaw)*r,focus.y+Math.sin(orbitPitch)*r,focus.z+Math.sin(orbitYaw)*r);
   desiredPosition.y=Math.max(1.7,desiredPosition.y);
   desiredTarget.copy(focus);
 }else{
   if(state.camera==='driver'){
     desiredPosition.copy(carPosition).addScaledVector(tangent,.50).add(new THREE.Vector3(0,1.46,0));
     desiredTarget.copy(desiredPosition).addScaledVector(tangent,180).add(new THREE.Vector3(0,4,0));
   }else{
     desiredPosition.copy(carPosition).addScaledVector(tangent,-15).addScaledVector(perpendicular,2).add(new THREE.Vector3(0,3.2,0));
     desiredTarget.copy(carPosition).addScaledVector(tangent,110).add(new THREE.Vector3(0,15,0));
     // The scenic chase camera gently keeps the landmark in the composition.
     const near=1-THREE.MathUtils.smoothstep(Math.abs(carPosition.x),400,1900);
     desiredTarget.lerp(new THREE.Vector3(0,78,0),.32+near*.18);
   }
   const dir=desiredTarget.clone().sub(desiredPosition).normalize();
   dir.applyAxisAngle(vUp,lookYaw);
   const right=new THREE.Vector3().crossVectors(dir,vUp).normalize();dir.applyAxisAngle(right,lookPitch);
   desiredTarget.copy(desiredPosition).addScaledVector(dir,300);
 }
 camera.position.lerp(desiredPosition,firstCamera?1:1-Math.exp(-dt*7));camera.lookAt(desiredTarget);
 if(steeringWheel)steeringWheel.rotation.z=(state.lane-actualLane)*-.12;
 camera.near=state.camera==='driver'?.25:.5;camera.far=10000;camera.fov=viewFov||(state.camera==='driver'?56:state.camera==='orbit'?44:48);camera.updateProjectionMatrix();firstCamera=false;
 atmosphere.follow(camera);
}

function frame(now){
 if(capturing){lastTime=now;requestAnimationFrame(frame);return;}
 const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;simTime+=dt;
 if(keys.has('KeyW')){const changed=!state.driving||state.cruise;state.driving=true;state.cruise=false;state.speed=Math.min(40,state.speed+dt*5.8);if(changed)syncUI();}
 if(keys.has('KeyS')){const wasDriving=state.driving,wasCruise=state.cruise;state.cruise=false;state.speed=Math.max(0,state.speed-dt*9);if(state.speed===0)state.driving=false;if(wasCruise||wasDriving!==state.driving)syncUI();}
 if(state.driving&&state.cruise)state.speed=THREE.MathUtils.damp(state.speed,11.5,1.2,dt);
 if(!state.driving)state.speed=THREE.MathUtils.damp(state.speed,0,5,dt);
 if(state.speed>.03){
   state.route+=state.direction*state.speed*dt/world.routeLength;
   if(state.route>.97||state.route<.03){state.route=clamp(state.route,.03,.97);state.driving=false;state.speed=0;toast('End of this stretch. Turn around for the other view.');syncUI();}
 }
 actualLane=THREE.MathUtils.damp(actualLane,state.lane,2.8,dt);
 if(state.sunPlaying){state.progress=Math.min(1,state.progress+dt/150);if(state.progress===1){state.sunPlaying=false;syncUI();} $('timeSlider').value=state.progress;updateTimeLabel();}
 if(now-lastEnvironment>180){if(atmosphere.update(state.progress,state.style,false,now,state.neutral))lastEnvironment=now;}
 const night=state.neutral?0:atmosphere.night(state.progress);glass.uniforms.style.value=state.style;glass.uniforms.night.value=state.neutral?0:night;
 player.userData.setNight?.(night);
 devon.update(simTime,night,state.screen&&!state.neutral);legends.update(simTime,night);
 world.update(dt,simTime,night,state.traffic?1:0);
 refreshLocalReflection(false,now);
 updateCamera(dt);
 updateAudio();
 renderer.render(scene,camera);
 $('speedValue').textContent=Math.round(state.speed*2.23694);
 if(!$('settingsPanel').hidden){$('routeSlider').value=state.route;$('routeValue').textContent=Math.round(state.route*100)+'%';}
 frameCount++;if(now-fpsTime>900){$('fps').textContent=Math.round(frameCount*1000/(now-fpsTime))+' FPS';frameCount=0;fpsTime=now;}
 requestAnimationFrame(frame);
}

function updateTimeLabel(){
 const p=state.progress;$('timeLabel').textContent=state.neutral?'Neutral light':p<.08?'Daylight':p<.3?'Golden hour':p<.7?'Afterglow':p<.88?'Blue hour':'Nightfall';
 const times={daylight:0,golden:.18,prism:.63,blue:.81,night:.97};
 for(const el of document.querySelectorAll('[data-preset]')){const active=!state.neutral&&Math.abs(p-times[el.dataset.preset])<.002;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
}
function syncUI(){
 for(const el of document.querySelectorAll('[data-camera]')){const active=el.dataset.camera===state.camera;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
 $('driveBtn').textContent=state.driving?'Pause drive':'Start driving';$('driveBtn').setAttribute('aria-pressed',String(state.driving));
 $('directionBtn').textContent=state.direction===1?'Eastbound':'Westbound';$('modeLabel').textContent=state.driving?(state.cruise?'Cruising':'Manual drive'):'Cruise ready';
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
function reset(){$('studyView').value='';const oldSound=state.sound;orbitFocus=null;viewFov=null;state={...defaults,sound:oldSound,quality:state.quality};actualLane=state.lane;lookYaw=0;lookPitch=0;firstCamera=true;orbitYaw=2.25;orbitPitch=.19;orbitDistance=650;setPreset('prism');resize();toast('Back on the western approach.');}
function toggleDrive(){state.driving=!state.driving;state.cruise=true;syncUI();}
function toggleHud(){hudVisible=!hudVisible;$('hud').hidden=!hudVisible;toast(hudVisible?'Controls restored':'Press H or Escape to restore controls');}
function isTyping(){const el=document.activeElement;return el?.isContentEditable||['SELECT','TEXTAREA'].includes(el?.tagName)||(el?.tagName==='INPUT'&&!['range','checkbox','file'].includes(el.type));}

function bindControls(){
 $('studyView').addEventListener('change',e=>{const preset=SHOT_BY_ID.get(e.target.value);if(!preset)return;applyCapturePreset({...preset,state:{...state,camera:preset.state.camera,route:preset.state.route,driving:false,speed:0,legends:false},simTime});});
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
 const showHelp=show=>{$('helpPanel').hidden=!show;$('helpBtn').setAttribute('aria-expanded',String(show));if(show)$('closeHelp').focus();};
 $('helpBtn').addEventListener('click',()=>showHelp(true));$('closeHelp').addEventListener('click',()=>showHelp(false));
 $('helpPanel').addEventListener('click',e=>{if(e.target===$('helpPanel'))showHelp(false);});
 $('hideBtn').addEventListener('click',toggleHud);$('resetBtn').addEventListener('click',reset);
 $('fullscreenBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full screen is unavailable in this browser.');}});
 $('captureBtn').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='prairie-prism.png';a.href=renderer.domElement.toDataURL('image/png');a.click();toast('Photograph saved.');});
 $('exportBtn').addEventListener('click',()=>{const payload={version:1,title:'Prairie Prism view',state:{...state},view:{lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus:orbitFocus?[...orbitFocus]:null,fov:viewFov}};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='prairie-prism-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('View settings saved.');});
 $('importInput').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>50000)throw Error('File too large');const p=JSON.parse(await f.text());const s=p.state;if(p.version!==1||!s)throw Error('Unsupported view');
   const ranges={progress:[0,1],style:[0,1],roughness:[.015,.35],exposure:[.3,2.5],route:[.03,.97],speed:[0,40],lane:[-3.8,3.8]};for(const [key,range] of Object.entries(ranges))if(!Number.isFinite(s[key])||s[key]<range[0]||s[key]>range[1])throw Error('Invalid '+key);
   if(!['chase','driver','orbit'].includes(s.camera)||![-1,1].includes(s.direction)||!['high','balanced','low'].includes(s.quality))throw Error('Invalid view');
   for(const k of ['driving','cruise','sunPlaying','screen','legends','traffic','sound','neutral'])if(typeof s[k]!=='boolean')throw Error('Invalid '+k);
   let view=p.view||{};for(const k of ['lookYaw','lookPitch','orbitYaw','orbitPitch','orbitDistance'])if(!Number.isFinite(view[k]))throw Error('Invalid camera');
   if(view.orbitFocus!=null&&(!Array.isArray(view.orbitFocus)||view.orbitFocus.length!==3||view.orbitFocus.some(n=>!Number.isFinite(n)||Math.abs(n)>20000)))throw Error('Invalid camera focus');
   if(view.fov!=null&&(!Number.isFinite(view.fov)||view.fov<15||view.fov>90))throw Error('Invalid camera lens');
   state={...defaults,...Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]])),sound:false};lookYaw=view.lookYaw;lookPitch=clamp(view.lookPitch,-.8,.8);orbitYaw=view.orbitYaw;orbitPitch=clamp(view.orbitPitch,-.8,1.2);orbitDistance=clamp(view.orbitDistance,160,2200);orbitFocus=view.orbitFocus?[...view.orbitFocus]:null;viewFov=view.fov||null;actualLane=state.lane;firstCamera=true;resize();atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();toast('View restored.');
 }catch(err){toast('Could not load that setup. Your current view is unchanged.');}finally{e.target.value='';}});
 window.addEventListener('resize',resize);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){showHelp(false);$('settingsPanel').hidden=true;$('settingsBtn').setAttribute('aria-expanded','false');if(!hudVisible)toggleHud();return;}
  if(e.code==='Tab'&&!$('helpPanel').hidden){e.preventDefault();$('closeHelp').focus();return;}
  if(isTyping()||!$('helpPanel').hidden)return;
  if(e.code==='Space'&&['BUTTON','INPUT','SELECT'].includes(document.activeElement?.tagName))return;
  if(['Space','KeyW','KeyS','KeyA','KeyD'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')toggleDrive();
  if(e.code==='KeyA')state.lane=clamp(state.lane-state.direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyD')state.lane=clamp(state.lane+state.direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyC')setCamera(['chase','driver','orbit'][(['chase','driver','orbit'].indexOf(state.camera)+1)%3]);
  if(e.code==='KeyH')toggleHud();if(e.code==='KeyR')reset();
  if(e.code==='KeyT'){if(state.progress>=1)state.progress=0;state.sunPlaying=!state.sunPlaying;syncUI();}
  if(e.code==='KeyM'){state.sound=!state.sound;enableAudio();syncUI();}
  if(e.code==='KeyN'){state.neutral=!state.neutral;state.screen=false;atmosphere.update(state.progress,state.style,true,performance.now(),state.neutral);syncUI();toast(state.neutral?'Neutral environment diagnostic':'Sunset restored');}
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
 const canvas=$('scene');canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};if(state.camera==='orbit'){orbitYaw-=dx*.004;orbitPitch=clamp(orbitPitch+dy*.003,-.8,1.2);}else{lookYaw-=dx*.003;lookPitch=clamp(lookPitch-dy*.0025,-.7,.7);}});
 canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('dblclick',()=>{lookYaw=0;lookPitch=0;toast('Look direction reset');});
 canvas.addEventListener('wheel',e=>{if(state.camera==='orbit'){e.preventDefault();orbitDistance=clamp(orbitDistance+e.deltaY*.65,160,2200);}},{passive:false});
}

function resize(){if(!renderer)return;const cap=state.quality==='high'?1.25:state.quality==='balanced'?.85:.58;renderer.setPixelRatio(Math.min(devicePixelRatio,cap));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
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
 state={...defaults,...preset.state};
 ({lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance}={lookYaw:0,lookPitch:0,orbitYaw:2.25,orbitPitch:.19,orbitDistance:650,...preset.view});
 orbitFocus=preset.view?.orbitFocus?[...preset.view.orbitFocus]:null;viewFov=preset.view?.fov||null;
 actualLane=state.lane;simTime=preset.simTime??18;firstCamera=true;keys.clear();syncUI();
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
 if(!captureRestore)captureRestore={state:{...state},view:{lookYaw,lookPitch,orbitYaw,orbitPitch,orbitDistance,orbitFocus:orbitFocus?[...orbitFocus]:null,fov:viewFov},simTime};
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
