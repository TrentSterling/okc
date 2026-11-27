import {getUI} from '../ui/runtime.js';

// Boot and native browser affordances can still address their own DOM nodes.
// Scene controls themselves are drawn and hit-tested by the shared UI surface.
export const $=id=>document.getElementById(id);

export function toast(message){getUI()?.toast(message);}

export function fail(error){
 console.error(error);
 const loading=$('loading'),panel=$('errorPanel');
 if(loading)loading.hidden=true;
 if(panel){panel.hidden=false;const detail=panel.querySelector('p');if(detail)detail.textContent='The scene could not start. '+(error?.message||'Check that WebGL2 is available and reload.');}
 getUI()?.toast('The scene could not start. '+(error?.message||'Open the map or reload to try again.'));
}

export function focusRoad(){
 const ui=getUI();if(ui?.isEditing||ui?.modalOpen)return;
 if(ui)ui.focusId=null;
 $('scene')?.focus({preventScroll:true});
}

export function isTyping(){
 if(getUI()?.isEditing)return true;
 const el=document.activeElement;
 return !!(el?.isContentEditable||['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(el?.tagName));
}
