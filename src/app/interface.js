import {$,toast} from './status.js';

// DOM presentation only. Scene changes remain explicit in syncUI.
export function createInterface({getState,legends,glass,renderer,clearDrivingInputs}){
 let hudVisible=true;

function updateTimeLabel(){
 const p=getState().progress;$('timeLabel').textContent=getState().neutral?'Neutral light':p<.08?'Daylight':p<.3?'Golden hour':p<.7?'Afterglow':p<.88?'Blue hour':'Nightfall';
 const times={daylight:0,golden:.18,prism:.63,blue:.81,night:.97};
 for(const el of document.querySelectorAll('[data-preset]')){const active=!getState().neutral&&Math.abs(p-times[el.dataset.preset])<.002;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
}

function syncUI(){
 const free=getState().driveMode==='free';
 document.body.classList.toggle('free-driving',free);
 for(const el of document.querySelectorAll('[data-drive-mode]')){const active=el.dataset.driveMode===getState().driveMode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
 for(const el of document.querySelectorAll('[data-camera]')){const active=el.dataset.camera===getState().camera;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
 $('driveBtn').textContent=free?(getState().driving?'Pause car':'Resume car'):(getState().driving?'Pause cruise':'Start cruise');$('driveBtn').setAttribute('aria-pressed',String(getState().driving));
 $('directionBtn').hidden=free;$('recoverBtn').hidden=!free;$('gearValue').hidden=!free;$('touchControls').hidden=!free;$('driveHint').hidden=!free;
 $('directionBtn').textContent=getState().direction===1?'Eastbound':'Westbound';$('modeLabel').textContent=free?(getState().driving?'You are driving':'Car paused'):getState().driving?(getState().cruise?'Scenic cruise':'Scenic throttle'):'Cruise ready';
 $('routeSlider').disabled=free;$('routeSlider').title=free?'Return to Scenic cruise to move along Reno Avenue':'';
 $('sunPlay').textContent=getState().sunPlaying?'Pause sky':'Play sky';$('sunPlay').setAttribute('aria-pressed',String(getState().sunPlaying));
 $('timeSlider').value=getState().progress;$('styleMix').value=getState().style;$('roughness').value=getState().roughness;$('exposure').value=getState().exposure;
 $('routeSlider').value=getState().route;$('routeValue').textContent=Math.round(getState().route*100)+'%';$('neutralToggle').checked=getState().neutral;
 $('styleValue').textContent=getState().style<.15?'Physical':getState().style>.85?'Illustrated':'Blended';$('roughnessValue').textContent=getState().roughness.toFixed(3);$('exposureValue').textContent=getState().exposure.toFixed(2);
 $('screenToggle').checked=getState().screen;$('legendsToggle').checked=getState().legends;$('trafficToggle').checked=getState().traffic;$('soundToggle').checked=getState().sound;$('qualitySelect').value=getState().quality;
 $('proposalNote').hidden=!getState().legends;legends.group.visible=getState().legends;
 glass.material.roughness=getState().roughness;renderer.toneMappingExposure=getState().exposure;
 updateTimeLabel();
}

function toggleHud(){hudVisible=!hudVisible;$('hud').hidden=!hudVisible;$('showHudBtn').hidden=hudVisible;clearDrivingInputs();toast(hudVisible?'Controls restored':'Tap Show controls, or press H, to restore controls');}

 return {sync:syncUI,updateTimeLabel,toggleHud,get hudVisible(){return hudVisible;}};
}
