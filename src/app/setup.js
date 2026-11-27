import * as THREE from 'three';
import {createDrivingState,isDrivingPoseClear} from '../driving.js';
import {toast} from './status.js';

const clamp=THREE.MathUtils.clamp;
export const defaults={progress:.63,style:0,roughness:.055,exposure:1.08,route:.392,direction:1,lane:-1.75,speed:0,driving:false,driveMode:'scenic',cruise:true,sunPlaying:false,camera:'chase',screen:false,legends:false,traffic:true,sound:false,quality:'high',neutral:false};

// v1/v2 setup formats are kept compatible with existing saved views.
export function decodeSetup(p,drivingWorld){
 const s=p.state;if(![1,2].includes(p.version)||!s)throw Error('Unsupported view');
   const ranges={progress:[0,1],style:[0,1],roughness:[.015,.35],exposure:[.3,2.5],route:[.03,.97],speed:[0,40],lane:[-3.8,3.8]};for(const [key,range] of Object.entries(ranges))if(!Number.isFinite(s[key])||s[key]<range[0]||s[key]>range[1])throw Error('Invalid '+key);
   if(!['chase','driver','orbit'].includes(s.camera)||![-1,1].includes(s.direction)||!['high','balanced','low'].includes(s.quality))throw Error('Invalid view');
   for(const k of ['driving','cruise','sunPlaying','screen','legends','traffic','sound','neutral'])if(typeof s[k]!=='boolean')throw Error('Invalid '+k);
   let view=p.view||{};for(const k of ['lookYaw','lookPitch','orbitYaw','orbitPitch','orbitDistance'])if(!Number.isFinite(view[k]))throw Error('Invalid camera');
   if(view.orbitFocus!=null&&(!Array.isArray(view.orbitFocus)||view.orbitFocus.length!==3||view.orbitFocus.some(n=>!Number.isFinite(n)||Math.abs(n)>60000)))throw Error('Invalid camera focus');
   if(view.fov!=null&&(!Number.isFinite(view.fov)||view.fov<15||view.fov>90))throw Error('Invalid camera lens');
   const driveMode=p.version===1?'scenic':s.driveMode;
   if(!['scenic','free'].includes(driveMode))throw Error('Invalid drive mode');
   let restoredCar=null;
   if(driveMode==='free'){
     if(!p.driving||!['x','z','heading','speed'].every(key=>Number.isFinite(p.driving[key]))||p.driving.speed< -8||p.driving.speed>28||!isDrivingPoseClear(drivingWorld,p.driving))throw Error('Invalid car position');
     restoredCar=createDrivingState(p.driving);
     if(!s.driving)restoredCar.vx=restoredCar.vz=restoredCar.speed=restoredCar.travelSpeed=0;
   }
   const state={...defaults,...Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]??defaults[k]])),driveMode,sound:false};
 return {state,freeCar:restoredCar,view:{lookYaw:view.lookYaw,lookPitch:clamp(view.lookPitch,-.8,.8),orbitYaw:view.orbitYaw,orbitPitch:clamp(view.orbitPitch,-.8,1.2),orbitDistance:clamp(view.orbitDistance,160,2200),orbitFocus:view.orbitFocus?[...view.orbitFocus]:null,fov:view.fov||null}};
}

export function createSetupIO({drivingWorld,snapshot,restore}){
 function save(){
  const saved=snapshot();
  const payload={version:2,title:'Prairie Prism view',state:saved.state,driving:saved.driving,view:saved.view};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='prairie-prism-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('View settings saved.');
 }
 async function load(e){
  try{
   const f=e.target.files[0];if(!f)return;if(f.size>50000)throw Error('File too large');
   const restored=decodeSetup(JSON.parse(await f.text()),drivingWorld);
   restore(restored);toast('View restored.');
  }catch(err){toast('Could not load that setup. Your current view is unchanged.');}
  finally{e.target.value='';}
 }
 return {save,load};
}
