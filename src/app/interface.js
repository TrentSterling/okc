import {getUI} from '../ui/runtime.js';
import {toast} from './status.js';
import {drawHud} from './hud-view.js';
import {drawSettings} from './settings-view.js';

const presetTimes={daylight:0,golden:.18,prism:.63,blue:.81,night:.97};
export function timeLabel(state){const p=state.progress;return state.neutral?'Neutral light':p<.08?'Daylight':p<.3?'Golden hour':p<.7?'Afterglow':p<.88?'Blue hour':'Nightfall';}

// This adapter owns only presentation. Keep the established scene-setting
// effects explicit in sync while app.js migrates away from DOM status nodes.
export function createInterface({getState,legends,glass,renderer,clearDrivingInputs}){
 const surface=getUI();let hudVisible=true,panel=null,studyView='',bindings=null;
 const telemetry={gear:'D'},disposers=[];
 const invalidate=()=>surface.invalidate();
 const read=()=>{
  const state=getState();
  return {state,telemetry,hudVisible,panel,studyView,timeLabel:timeLabel(state),preset:state.neutral?'':Object.keys(presetTimes).find(id=>Math.abs(state.progress-presetTimes[id])<.002)||''};
 };
 function clearInputs(){if(bindings?.clearInputs)bindings.clearInputs();else clearDrivingInputs();}
 function setPanel(next){
  if(![null,'settings','help'].includes(next))return;
  if(panel===next)return;
  clearInputs();surface.cancelInputs('scene-panel');panel=next;
  surface.setModal('scene-controls',!!panel);invalidate();
 }
 function sync(){
  const state=getState();
  legends.group.visible=state.legends;
  glass.material.roughness=state.roughness;
  renderer.toneMappingExposure=state.exposure;
  invalidate();
 }
 const control={
  openSettings:()=>setPanel('settings'),openHelp:()=>setPanel('help'),closePanel:()=>setPanel(null),
  toggleHud(){
   setPanel(null);clearInputs();surface.cancelInputs('hud-visibility');hudVisible=!hudVisible;invalidate();
   toast(hudVisible?'Controls restored':'Tap Show, or press H, to restore controls.');
  },
 };
 const invoke=(name,...args)=>bindings?.actions[name]?.(...args);
 for(const name of ['setDriveMode','toggleDrive','recover','setCamera','cycleCamera','preset','toggleSky','reverseDirection','selectViewpoint','setSetting','reset','photograph','saveSetup','loadSetup','fullscreen','gallery'])control[name]=(...args)=>invoke(name,...args);
 control.beginHold=(id,action)=>bindings?.beginHold(id,action);
 control.endHold=id=>bindings?.endHold(id);
 control.isHeld=action=>bindings?.isHeld(action)||false;
 disposers.push(surface.addView('scene-hud',ctx=>{
  if(!surface.sceneReady||surface.mode!=='3d'||!bindings)return;
  drawHud(ctx,read(),control);
 },60));
 disposers.push(surface.addView('scene-settings',ctx=>{
  if(!surface.sceneReady||surface.mode!=='3d'||!bindings||!panel)return;
  drawSettings(ctx,read(),control);
 },80));
 return {
  configure(value){bindings={...bindings,...value};invalidate();},
  sync,read,updateTimeLabel:invalidate,toggleHud:control.toggleHud,setPanel,closePanel:control.closePanel,
  setStudyView(id){studyView=typeof id==='string'?id:'';invalidate();},
  setTelemetry(value){let dirty=false;for(const [key,next]of Object.entries(value||{}))if(telemetry[key]!==next){telemetry[key]=next;dirty=true;}if(dirty)invalidate();},
  dispose(){setPanel(null);for(const dispose of disposers)dispose?.();},
  get hudVisible(){return hudVisible;},get panel(){return panel;},get settingsOpen(){return panel==='settings';},
 };
}
