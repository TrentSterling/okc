import {getUI} from '../ui/runtime.js';
import {toast,focusRoad,isTyping} from './status.js';
import {createControlActions,createDriveInput,createWorldCameraInput,DRIVE_KEYS} from './control-actions.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Keyboard and routed world input share commands with the GPU HUD. There are
// deliberately no canvas pointer listeners or visible DOM control bindings.
export function bindControls({getState,getSimTime,view,world,keys,touchInputs,ui,setup,actions}){
 const surface=getUI(),disposers=[];
 const input=createDriveInput({getState,keys,touchInputs,onTakeover:()=>actions.manualTakeover?.(),onChange:()=>surface.invalidate(),clear:actions.clearDrivingInputs});
 const cameraInput=createWorldCameraInput({getState,view,onReset:()=>toast('Look direction reset')});
 const clearInputs=()=>{input.clear();cameraInput.cancel();};
 const command=createControlActions({getState,getSimTime,view,ui,setup,actions:{...actions,clearDrivingInputs:()=>{surface.cancelInputs('scene-command');clearInputs();}},platform:surface.platform,notify:toast,focus:focusRoad});
 ui.configure({actions:command,setup,clearInputs,beginHold:(id,action)=>{input.begin(id,action);focusRoad();},endHold:id=>input.end(id),isHeld:action=>input.isHeld(action)});
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);disposers.push(()=>target.removeEventListener(type,fn,options));};
 disposers.push(surface.registerWorldInput(cameraInput),surface.onCancelInputs(clearInputs));
 listen(window,'keydown',e=>{
  if(e.defaultPrevented)return;
  if(e.code==='Escape'){
   if(ui.panel)command.closePanel();else if(!ui.hudVisible)command.toggleHud();return;
  }
  if(surface.mode!=='3d'||surface.isEditing||surface.modalOpen||isTyping())return;
  if(DRIVE_KEYS.has(e.code))e.preventDefault();
  if(!input.keyDown(e.code,e.repeat))return;
  if(e.code==='KeyF')command.setDriveMode(getState().driveMode==='free'?'scenic':'free');
  if(e.code==='Space'&&getState().driveMode==='scenic')command.toggleDrive();
  if(e.code==='KeyA'&&getState().driveMode==='scenic')getState().lane=clamp(getState().lane-getState().direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyD'&&getState().driveMode==='scenic')getState().lane=clamp(getState().lane+getState().direction*(world.laneSpacing??3.5),-(world.laneLimit??1.75),world.laneLimit??1.75);
  if(e.code==='KeyC')command.cycleCamera();
  if(e.code==='KeyH')command.toggleHud();
  if(e.code==='KeyR')command.recover();
  if(e.code==='KeyT')command.toggleSky();
  if(e.code==='KeyM')command.setSetting('sound',!getState().sound);
  if(e.code==='KeyN'){command.setSetting('neutral',!getState().neutral);toast(getState().neutral?'Neutral environment diagnostic':'Sunset restored');}
 });
 listen(window,'keyup',e=>input.keyUp(e.code));
 const suspend=()=>{clearInputs();if(getState().driveMode==='free'&&getState().driving)command.toggleDrive();};
 listen(window,'blur',suspend);
 listen(document,'visibilitychange',()=>{if(document.hidden)suspend();});
 listen(document,'focusin',e=>{if(e.target?.id!=='scene')clearInputs();});
 return {actions:command,read:ui.read,input,clearInputs,dispose(){clearInputs();for(const dispose of disposers)dispose?.();}};
}
