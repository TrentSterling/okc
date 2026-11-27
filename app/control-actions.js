import {SHOT_BY_ID} from '../capture-presets.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ranges={progress:[0,1],style:[0,1],roughness:[.015,.35],exposure:[.3,2.5],route:[.03,.97]};
export const DRIVE_KEYS=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
const inputKeys={throttle:['KeyW','ArrowUp'],brake:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],handbrake:['Space']};

// A second finger (or keyboard repeat) must not pause the car again while
// manual control is active. Releasing one source preserves other held sources.
export function createDriveInput({getState,keys,touchInputs,onTakeover=()=>{},onChange=()=>{},clear=()=>{}}){
 const hasManual=()=>[...keys].some(code=>DRIVE_KEYS.has(code))||touchInputs.size>0;
 const takeover=()=>{if(!hasManual())onTakeover();};
 return {
  keyDown(code,repeat=false){if(repeat||keys.has(code))return false;if(DRIVE_KEYS.has(code))takeover();keys.add(code);onChange();return true;},
  keyUp(code){if(keys.delete(code))onChange();},
  begin(pointerId,action){if(getState().driveMode!=='free'||!inputKeys[action]||touchInputs.has(pointerId))return false;takeover();touchInputs.set(pointerId,action);onChange();return true;},
  end(pointerId){if(touchInputs.delete(pointerId))onChange();},
  isHeld(action){return (inputKeys[action]||[]).some(code=>keys.has(code))||[...touchInputs.values()].includes(action);},
  clear(){keys.clear();touchInputs.clear();clear();onChange();},
 };
}

// Physics and capture restoration remain app-owned. DOM, GPU and keyboard
// controls use these same validated commands instead of mutating scene state.
export function createControlActions({getState,getSimTime,view,ui,setup,actions,platform,notify=()=>{},focus=()=>{}}){
 const sync=()=>ui.sync();
 const refresh=()=>actions.updateAtmosphere(getState().progress,getState().style,true,performance.now(),getState().neutral);
 function setSetting(key,value,{commit=false}={}){
  const state=getState();
  if(ranges[key]){value=Number(value);if(!Number.isFinite(value))return false;value=clamp(value,...ranges[key]);}
  else if(['neutral','screen','legends','traffic','sound'].includes(key))value=!!value;
  else if(key==='quality'){if(!['high','balanced','low'].includes(value))return false;}
  else return false;
  if(key==='route'&&state.driveMode==='free')return false;
  if(key==='quality'){
   if(actions.setQuality)actions.setQuality(value);else{state.quality=value;actions.resize();}
  }else state[key]=value;
  if(key==='progress'){state.neutral=false;state.sunPlaying=false;if(commit)refresh();}
  if(key==='route'){state.driving=false;state.speed=0;view.firstCamera=true;}
  if(key==='neutral'){state.screen=false;refresh();}
  if(key==='sound')actions.enableAudio(); // Remains in the trusted input event.
  if(key==='legends'&&value){
   view.orbitFocus=null;view.viewFov=null;view.orbitYaw=2.25;view.orbitPitch=.19;view.orbitDistance=700;view.firstCamera=true;
   ui.setStudyView('');state.camera='orbit';notify('Legends Tower: an imagined future skyline, 1,907 ft.');
  }
  sync();return true;
 }
 const command={
  setSetting,
  setDriveMode(mode){if(!['free','scenic'].includes(mode))return;actions.clearDrivingInputs();actions.setDriveMode(mode);},
  toggleDrive(){actions.toggleDrive();},
  recover(){actions.clearDrivingInputs();actions.recoverCar();},
  setCamera(mode){if(['chase','driver','orbit'].includes(mode)){actions.clearDrivingInputs();ui.setStudyView('');actions.setCamera(mode);focus();}},
  cycleCamera(){command.setCamera(['chase','driver','orbit'][(['chase','driver','orbit'].indexOf(getState().camera)+1)%3]);},
  preset(id){if(['daylight','golden','prism','blue','night'].includes(id))actions.setPreset(id);},
  toggleSky(){const s=getState();if(s.progress>=1)s.progress=0;s.sunPlaying=!s.sunPlaying;sync();},
  reverseDirection(){
   if(getState().driveMode==='free')return;
   getState().direction*=-1;actions.resetLane();getState().lane=-1.75;
   view.orbitFocus=null;view.viewFov=null;view.lookYaw=0;view.lookPitch=0;view.firstCamera=true;sync();
   notify(getState().direction===1?'Heading east toward downtown':'Heading west into the sunset');focus();
  },
  selectViewpoint(id){
   const preset=SHOT_BY_ID.get(id);ui.setStudyView(id);if(!preset)return;actions.clearDrivingInputs();
   actions.applyCapturePreset({...preset,state:{...getState(),driveMode:'scenic',camera:preset.state.camera,route:preset.state.route,driving:false,speed:0,legends:false},simTime:getSimTime()});
  },
  reset(){actions.clearDrivingInputs();ui.setStudyView('');actions.reset();},
  photograph(){actions.photograph();notify('Photograph saved.');},
  saveSetup(){setup.save();},
  loadSetup(){
   try{
    // Keep setup.load's established size/decode validation and call the native
    // picker synchronously from the trusted input event.
    platform.pickJSON(async(value,metadata)=>{
     const file=metadata.file||{size:metadata.size,text:async()=>metadata.text};
     await setup.load({target:{files:[file],value:''}});
    },{maxBytes:50000});
   }catch{notify('Could not load that setup. Your current view is unchanged.');}
  },
  async fullscreen(){
   try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
   catch{notify('Full screen is unavailable in this browser.');}
  },
  gallery(){platform.openURL(new URL('../gallery/',import.meta.url).href);},
  openSettings(){ui.setPanel('settings');},openHelp(){ui.setPanel('help');},closePanel(){ui.closePanel();focus();},toggleHud(){ui.toggleHud();},
 };
 return command;
}

// Only world-owned pointers arrive here. Pedal, steering and slider pointers
// have already been claimed by the shared router and never enter this map.
export function createWorldCameraInput({getState,view,onReset=()=>{}}){
 const pointers=new Map();let pinchDistance=null;
 const distance=()=>{const p=[...pointers.values()];return p.length<2?null:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
 return {
  down(e){pointers.set(e.pointerId,{x:e.x,y:e.y});pinchDistance=distance();},
  move(e){
   const p=pointers.get(e.pointerId);if(!p)return;
   const dx=e.x-p.x,dy=e.y-p.y;p.x=e.x;p.y=e.y;
   if(pointers.size>1){const next=distance();if(getState().camera==='orbit'&&pinchDistance>0&&next>0)view.orbitDistance=clamp(view.orbitDistance*pinchDistance/next,160,2200);pinchDistance=next;return;}
   if(getState().camera==='orbit'){view.orbitYaw-=dx*.004;view.orbitPitch=clamp(view.orbitPitch+dy*.003,-.8,1.2);}
   else{view.lookYaw-=dx*.003;view.lookPitch=clamp(view.lookPitch-dy*.0025,-.7,.7);}
  },
  up(e){pointers.delete(e.pointerId);pinchDistance=distance();},
  cancel(e){if(e?.pointerId!=null)pointers.delete(e.pointerId);else pointers.clear();pinchDistance=distance();},
  wheel(e){if(getState().camera!=='orbit')return;const delta=Number(e.originalEvent?.deltaY??e.deltaY??e.dy??0);if(Number.isFinite(delta)){e.originalEvent?.preventDefault();view.orbitDistance=clamp(view.orbitDistance+delta*.65,160,2200);}},
  doubleClick(){view.lookYaw=0;view.lookPitch=0;onReset();},
 };
}
