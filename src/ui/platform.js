// Only browser services live here. These nodes never paint the visible UI:
// glyphs, fields, carets, menus and controls are drawn by the game renderer.
export function createPlatform(host){
 let editor=null,editing=null;
 const safeURL=value=>{try{const url=new URL(value,location.href);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
 function endEdit(){if(!editing)return;const old=editing;editing=null;host.editAnchor=null;editor?.blur();old.onCommit?.(editor.value);host.invalidate();host.canvas.focus({preventScroll:true});}
 function beginEdit(id,value,options){
  if(editing?.id===id)return;if(editing)endEdit();
  host.cancelInputs('text-entry');
  if(!editor){
   editor=document.createElement('textarea');editor.setAttribute('aria-label','Edit selected game field');
   editor.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;z-index:-1;';
   editor.autocapitalize='off';editor.autocomplete='off';editor.spellcheck=false;document.body.append(editor);
   editor.addEventListener('input',()=>{if(!editing)return;editing.value=editor.value;editing.onChange?.(editor.value);host.invalidate();});
   editor.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229){event.stopPropagation();return;}if(event.key==='Escape'||event.key==='Enter'&&!editing?.multiline){event.preventDefault();endEdit();}event.stopPropagation();});
   editor.addEventListener('blur',()=>{if(editing){const old=editing;editing=null;host.editAnchor=null;old.onCommit?.(editor.value);host.invalidate();}});
  }
  editing={id,value:String(value??''),...options};host.anchorEditor?.(id);editor.value=editing.value;
  editor.inputMode=options.type==='number'?'decimal':options.type==='email'?'email':options.type==='url'?'url':'text';
  editor.maxLength=options.maxLength||1200;editor.setAttribute('aria-label',options.label||options.placeholder||'Game text field');
  editor.focus({preventScroll:true});editor.setSelectionRange(editor.value.length,editor.value.length);host.invalidate();
 }
 function download(name,value,type='application/json'){
  const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function pickJSON(onData,{maxBytes=2*1024*1024}={}){
  const file=document.createElement('input');file.type='file';file.accept='application/json,.json';file.style.display='none';
  file.addEventListener('change',async()=>{try{const selected=file.files?.[0];if(!selected)return;if(selected.size>maxBytes)throw Error('That file is too large.');const text=await selected.text();await onData(JSON.parse(text),{file:selected,text,size:selected.size});}catch(error){host.toast(error.message);}finally{file.remove();}},{once:true});
  file.addEventListener('cancel',()=>file.remove(),{once:true});document.body.append(file);file.click();
 }
 return {download,pickJSON,beginEdit,endEdit,get editing(){return editing;},
  async copyText(text){try{await navigator.clipboard.writeText(text);host.toast('Copied.');return true;}catch{download('prairie-prism-copy.txt',text,'text/plain');host.toast('Clipboard unavailable. Saved a text copy.');return false;}},
  openURL(value){const url=safeURL(value);if(url)window.open(url,'_blank','noopener,noreferrer');else host.toast('That link is unavailable.');},
  dispose(){editing=null;editor?.remove();editor=null;},
 };
}
