// User-facing loading/error feedback, independent of scene construction.
export const $=id=>document.getElementById(id);
let toastTimer;

export function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}

export function fail(error){console.error(error);$('loading').hidden=true;$('errorPanel').hidden=false;$('errorPanel').querySelector('p').textContent='The scene could not start. '+(error?.message||'Check that WebGL2 is available and reload.');}

export function focusRoad(){if(!$('helpPanel').hidden)return;$('scene').focus({preventScroll:true});}

export function isTyping(){const el=document.activeElement;return el?.isContentEditable||['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(el?.tagName);}
