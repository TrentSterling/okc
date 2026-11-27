import * as THREE from 'three';
import {SHOT_BY_ID} from '../capture-presets.js';
import {$,toast,focusRoad,isTyping} from './status.js';

const clamp=THREE.MathUtils.clamp;

// Event wiring delegates commands; it does not own the renderer or saved state.
export function bindControls({getState,getSimTime,view,world,keys,touchInputs,ui,setup,actions}){
 const {setDriveMode,recoverCar,toggleHud,toggleDrive,setCamera,setPreset,enableAudio,resize,reset,applyCapturePreset,clearDrivingInputs,updateAtmosphere,resetLane,photograph}=actions;
 const syncUI=ui.sync;
 let drag=null;
 $('studyView').addEventListener('change',e=>{const preset=SHOT_BY_ID.get(e.target.value);if(!preset)return;applyCapturePreset({...preset,state:{...getState(),driveMode:'scenic',camera:preset.state.camera,route:preset.state.route,driving:false,speed:0,legends:false},simTime:getSimTime()});});
 for(const el of document.querySelectorAll('[data-drive-mode]'))el.addEventListener('click',()=>setDriveMode(el.dataset.driveMode));
 $('recoverBtn').addEventListener('click',recoverCar);$('showHudBtn').addEventListener('click',toggleHud);
 $('driveBtn').addEventListener('click',toggleDrive);
 $('directionBtn').addEventListener('click',()=>{getState().direction*=-1;resetLane();getState().lane=-1.75;view.orbitFocus=null;view.viewFov=null;view.lookYaw=0;view.lookPitch=0;view.firstCamera=true;syncUI();toast(getState().direction===1?'Heading east toward downtown':'Heading west into the sunset');});
 $('sunPlay').addEventListener('click',()=>{if(getState().progress>=1)getState().progress=0;getState().sunPlaying=!getState().sunPlaying;syncUI();});
 $('timeSlider').addEventListener('input',e=>{getState().progress=Number(e.target.value);getState().neutral=false;getState().sunPlaying=false;syncUI();});
 $('timeSlider').addEventListener('change',()=>{updateAtmosphere(getState().progress,getState().style,true);syncUI();});
 $('routeSlider').addEventListener('input',e=>{getState().route=clamp(Number(e.target.value),.03,.97);getState().driving=false;getState().speed=0;view.firstCamera=true;syncUI();});
 $('neutralToggle').addEventListener('change',e=>{getState().neutral=e.target.checked;getState().screen=false;updateAtmosphere(getState().progress,getState().style,true,performance.now(),getState().neutral);syncUI();});
 document.querySelectorAll('[data-camera]').forEach(el=>el.addEventListener('click',()=>setCamera(el.dataset.camera)));
 document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>setPreset(el.dataset.preset)));
 $('styleMix').addEventListener('input',e=>{getState().style=Number(e.target.value);syncUI();});
 $('roughness').addEventListener('input',e=>{getState().roughness=Number(e.target.value);syncUI();});
 $('exposure').addEventListener('input',e=>{getState().exposure=Number(e.target.value);syncUI();});
 for(const [id,key] of [['screenToggle','screen'],['legendsToggle','legends'],['trafficToggle','traffic']])$(id).addEventListener('change',e=>{getState()[key]=e.target.checked;if(key==='legends'&&getState().legends){view.orbitFocus=null;view.viewFov=null;view.orbitYaw=2.25;view.orbitPitch=.19;view.orbitDistance=700;$('studyView').value='';getState().camera='orbit';view.firstCamera=true;toast('Legends Tower: an imagined future skyline, 1,907 ft.');}syncUI();});
 $('soundToggle').addEventListener('change',e=>{getState().sound=e.target.checked;enableAudio();});
 $('qualitySelect').addEventListener('change',e=>{if(actions.setQuality)actions.setQuality(e.target.value);else{getState().quality=e.target.value;resize();}});
 $('settingsBtn').addEventListener('click',()=>{$('settingsPanel').hidden=!$('settingsPanel').hidden;$('settingsBtn').setAttribute('aria-expanded',String(!$('settingsPanel').hidden));});
 const showHelp=show=>{clearDrivingInputs();$('helpPanel').hidden=!show;$('helpBtn').setAttribute('aria-expanded',String(show));if(show)$('closeHelp').focus();else focusRoad();};
 $('helpBtn').addEventListener('click',()=>showHelp(true));$('closeHelp').addEventListener('click',()=>showHelp(false));
 $('helpPanel').addEventListener('click',e=>{if(e.target===$('helpPanel'))showHelp(false);});
 $('hideBtn').addEventListener('click',toggleHud);$('resetBtn').addEventListener('click',reset);
 $('fullscreenBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full screen is unavailable in this browser.');}});
 $('captureBtn').addEventListener('click',()=>{photograph();toast('Photograph saved.');});
 $('exportBtn').addEventListener('click',setup.save);
 $('importInput').addEventListener('change',setup.load);
 window.addEventListener('resize',resize);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){showHelp(false);$('settingsPanel').hidden=true;$('settingsBtn').setAttribute('aria-expanded','false');if(!ui.hudVisible)toggleHud();return;}
  if(e.code==='Tab'&&!$('helpPanel').hidden){e.preventDefault();$('closeHelp').focus();return;}
  if(e.defaultPrevented||document.body.classList.contains('explorer-map-open')||isTyping()||!$('helpPanel').hidden)return;
  if(['Space','KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyF')setDriveMode(getState().driveMode==='free'?'scenic':'free');
  if(e.code==='Space'&&getState().driveMode==='scenic')toggleDrive();
  if(e.code==='KeyA'&&getState().driveMode==='scenic')getState().lane=clamp(getState().lane-getState().direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyD'&&getState().driveMode==='scenic')getState().lane=clamp(getState().lane+getState().direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyC')setCamera(['chase','driver','orbit'][(['chase','driver','orbit'].indexOf(getState().camera)+1)%3]);
  if(e.code==='KeyH')toggleHud();if(e.code==='KeyR')recoverCar();
  if(e.code==='KeyT'){if(getState().progress>=1)getState().progress=0;getState().sunPlaying=!getState().sunPlaying;syncUI();}
  if(e.code==='KeyM'){getState().sound=!getState().sound;enableAudio();syncUI();}
  if(e.code==='KeyN'){getState().neutral=!getState().neutral;getState().screen=false;updateAtmosphere(getState().progress,getState().style,true,performance.now(),getState().neutral);syncUI();toast(getState().neutral?'Neutral environment diagnostic':'Sunset restored');}
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>{clearDrivingInputs();if(getState().driveMode==='free'&&getState().driving)toggleDrive();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearDrivingInputs();if(getState().driveMode==='free'&&getState().driving)toggleDrive();}});
 document.addEventListener('focusin',e=>{if(e.target!==$('scene'))keys.clear();});
 for(const el of document.querySelectorAll('[data-drive-control]')){
   const release=e=>{touchInputs.delete(e.pointerId);if(![...touchInputs.values()].includes(el.dataset.driveControl))el.classList.remove('held');};
   el.addEventListener('pointerdown',e=>{if(getState().driveMode!=='free')return;e.preventDefault();el.setPointerCapture(e.pointerId);touchInputs.set(e.pointerId,el.dataset.driveControl);el.classList.add('held');focusRoad();});
   el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
 }
 const canvas=$('scene');canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{if(drag)return;canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY,id:e.pointerId};if(getState().camera==='orbit'){view.orbitYaw-=dx*.004;view.orbitPitch=clamp(view.orbitPitch+dy*.003,-.8,1.2);}else{view.lookYaw-=dx*.003;view.lookPitch=clamp(view.lookPitch-dy*.0025,-.7,.7);}});
 canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});canvas.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null;});
 canvas.addEventListener('dblclick',()=>{view.lookYaw=0;view.lookPitch=0;toast('Look direction reset');});
 canvas.addEventListener('wheel',e=>{if(getState().camera==='orbit'){e.preventDefault();view.orbitDistance=clamp(view.orbitDistance+e.deltaY*.65,160,2200);}},{passive:false});
}
