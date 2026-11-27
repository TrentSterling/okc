import {createGPUSurface,GPUSurface} from './gpu-surface.js';
import {createBootstrapAssets} from './bootstrap-font.js';
import {createWidgets,palette} from './widgets.js';
import {createInputRouter} from './input-router.js';
import {createPlatform} from './platform.js';
import {createRenderer} from '../app/renderer.js';

let singleton=null,initializing=null;
export function getUI(){if(!singleton)throw Error('The game UI has not initialized.');return singleton;}
export function initializeUI(){return initializing||=start().catch(error=>{initializing=null;throw error;});}

async function start(){
 let canvas=document.getElementById('scene'),fontError=null,surface;
 try{surface=await createGPUSurface();}catch(error){fontError=error;surface=new GPUSurface(createBootstrapAssets());}
 let renderer=null,reversedDepth=false,context=null;
 try{({renderer,reversedDepth}=createRenderer(canvas,1.08));}catch(error){console.warn('GPU unavailable; using the map canvas fallback.',error.message);context=canvas.getContext('2d',{alpha:false});}
 if(!renderer&&!context)throw Error('This browser could not create a graphics canvas.');
 const views=new Map(),layers=new Map(),listeners=new Set(),cancellations=new Set(),taps=new Set(),worlds=new Set(),modals=new Set(),escapes=new Set();
 let dirty=true,externalFrame=false,raf=0,dropdown=null,toast=null,toastTimer=0,lastTargets=[],painting=false,queued=false,destroyed=false;
 const host={canvas,renderer,reversedDepth,surface,context,fontReady:!fontError,mode:'3d',sceneReady:false,width:1,height:1,insets:{top:0,right:0,bottom:0,left:0},scrolls:new Map(),focusId:null,
  invalidate(){dirty=true;},get isEditing(){return !!host.platform.editing;},get modalOpen(){return !host.fontReady||modals.size>0||!!dropdown;},
  addView(id,draw,priority=40){views.set(id,{draw,priority});dirty=true;return()=>{views.delete(id);dirty=true;};},
  addLayer(id,layer,priority=0){layers.set(id,{...layer,priority});dirty=true;return()=>{layers.delete(id);dirty=true;};},
  onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  onEscape(fn){escapes.add(fn);return()=>escapes.delete(fn);},
  setMode(mode){if(!['map','3d'].includes(mode)||host.mode===mode)return;host.cancelInputs('mode');host.platform.endEdit();dropdown=null;host.mode=mode;host.focusId=null;dirty=true;for(const fn of listeners)fn({mode});},
  setSceneReady(value){host.sceneReady=!!value;dirty=true;for(const fn of listeners)fn({sceneReady:host.sceneReady});},
  setModal(id,open){const before=modals.has(id);if(before===!!open)return;if(open){host.cancelInputs('modal');modals.add(id);}else modals.delete(id);dirty=true;},
  onCancelInputs(fn){cancellations.add(fn);return()=>cancellations.delete(fn);},
  cancelInputs(reason='cancel'){host.router.clear();for(const fn of cancellations)fn(reason);},
  registerWorldInput(handlers){worlds.add(handlers);return()=>worlds.delete(handlers);},
  addWorldTap(fn){taps.add(fn);return()=>taps.delete(fn);},
  toast(message){toast=String(message);clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast=null;dirty=true;},6500);dirty=true;},
  openSelect(id,rect,options,onChange){host.cancelInputs('menu');host.platform.endEdit();dropdown={id,rect,options:options.map(o=>typeof o==='object'?o:{value:o,label:String(o)}),onChange};host.focusId=null;dirty=true;},
  closeSelect(){dropdown=null;dirty=true;},
  anchorEditor(id){const target=lastTargets.find(t=>t.id===id),region=host.scrolls.get(target?.scrollId);host.editAnchor=target&&region?{id,scrollId:target.scrollId,contentY:target.rect.y-region.rect.y+region.offset,height:target.rect.h}:null;},
  async retryFont(){
   if(host.fontReady||host.fontRetrying)return;host.fontRetrying=true;dirty=true;
   try{const next=await createGPUSurface();surface.dispose();surface=next;host.surface=next;host.fontReady=true;fontError=null;}
   catch(error){fontError=error;}finally{host.fontRetrying=false;dirty=true;}
  },
  useCanvasFallback(){
   if(!renderer)return;host.cancelInputs('graphics-loss');
   const next=document.createElement('canvas');next.id='scene';next.tabIndex=0;next.setAttribute('role','application');next.setAttribute('aria-label',canvas.getAttribute('aria-label')||'Prairie Prism city atlas');
   const fallback=next.getContext('2d',{alpha:false});if(!fallback)return;
   canvas.replaceWith(next);canvas=next;host.canvas=next;context=fallback;host.context=fallback;renderer=null;host.renderer=null;
   bindCanvas();host.setSceneReady(false);host.setMode('map');host.driveFrames(false);resize(true);dirty=true;
  },
  render,resize,driveFrames(value=true){externalFrame=value;if(!value&&!raf)raf=requestAnimationFrame(frame);},
  debugSnapshot(){return {mode:host.mode,sceneReady:host.sceneReady,gpu:!!renderer,width:host.width,height:host.height,insets:{...host.insets},modalOpen:host.modalOpen,editing:host.isEditing,focusId:host.focusId,stats:surface.stats(),targets:lastTargets.map(({id,rect,clip,label,kind,disabled,scrollId})=>({id,rect,clip,label,kind,disabled,scrollId})),surface:surface.snapshot()};},
  dispose(){destroyed=true;cancelAnimationFrame(raf);clearTimeout(toastTimer);host.cancelInputs('dispose');for(const remove of unbind)remove();host.platform.dispose();surface.dispose();},
 };
 host.platform=createPlatform(host);
 host.router=createInputRouter({invalidate:host.invalidate,isBlocked:()=>host.modalOpen||host.isEditing,
  scrollBy(id,delta){const item=host.scrolls.get(id);if(item){item.offset=Math.max(0,Math.min(item.max,item.offset+delta));dirty=true;}},
  worldTap(event){if(host.mode==='3d'&&host.sceneReady&&!host.modalOpen&&!host.isEditing)for(const fn of taps)fn(event);},
 });
 host.router.setWorld(Object.fromEntries(['down','move','up','cancel','wheel','doubleClick'].map(name=>[name,event=>{if(host.mode==='3d'&&host.sceneReady)for(const handlers of worlds)handlers[name]?.(event);}])));
 const unbind=[];
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);unbind.push(()=>target.removeEventListener(type,fn,options));};
 const point=e=>{const r=host.canvas.getBoundingClientRect();return {pointerId:e.pointerId,x:(e.clientX-r.left)*host.width/r.width,y:(e.clientY-r.top)*host.height/r.height,pointerType:e.pointerType||'mouse',button:e.button,buttons:e.buttons,deltaY:e.deltaY||0,originalEvent:e};};
 function bindCanvas(){
 listen(canvas,'pointerdown',e=>{if(e.button!==0&&e.button!==2)return;e.preventDefault();const p=point(e),target=host.router.hit(p.x,p.y);if(host.isEditing){if(target?.id===host.platform.editing.id)return;host.platform.endEdit();}canvas.focus({preventScroll:true});host.focusId=target?.id||null;host.router.down(p);canvas.setPointerCapture?.(e.pointerId);});
 listen(canvas,'pointermove',e=>{host.router.move(point(e));});
 listen(canvas,'pointerup',e=>{host.router.up(point(e));if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
 listen(canvas,'pointercancel',e=>host.router.cancel(e.pointerId));
 listen(canvas,'lostpointercapture',e=>host.router.cancel(e.pointerId));
 listen(canvas,'wheel',e=>{e.preventDefault();host.router.wheel(point(e));},{passive:false});
 listen(canvas,'dblclick',e=>{e.preventDefault();host.router.doubleClick(point(e));});
 listen(canvas,'contextmenu',e=>e.preventDefault());
 }bindCanvas();
 listen(window,'blur',()=>host.cancelInputs('blur'));
 listen(document,'visibilitychange',()=>{if(document.hidden)host.cancelInputs('hidden');else dirty=true;});
 listen(window,'resize',resize);
 if(window.visualViewport){listen(window.visualViewport,'resize',resize);listen(window.visualViewport,'scroll',resize);}
 listen(window,'keydown',event=>{
  if(host.isEditing)return;
  if(event.key==='Escape'&&dropdown){event.preventDefault();host.closeSelect();return;}
  if(event.key==='Escape'){for(const fn of [...escapes].reverse())if(fn()){event.preventDefault();event.stopImmediatePropagation();return;}}
  const focusable=lastTargets.filter(t=>t.focusable&&!t.disabled&&host.router.hit(t.rect.x+t.rect.w/2,t.rect.y+t.rect.h/2)?.id===t.id),target=focusable.find(t=>t.id===host.focusId);
  if(event.key==='Tab'){
   event.preventDefault();const i=focusable.indexOf(target),next=focusable[i<0?(event.shiftKey?focusable.length-1:0):(i+(event.shiftKey?-1:1)+focusable.length)%focusable.length];
   if(next){host.focusId=next.id;canvas.setAttribute('aria-label',next.label||next.id);dirty=true;}return;
  }
  if(['PageUp','PageDown','Home','End'].includes(event.key)){
   const candidates=lastTargets.filter(t=>t.scrollId&&host.router.hit(t.rect.x+t.rect.w/2,t.rect.y+t.rect.h/2)?.scrollId===t.scrollId),id=target?.scrollId||candidates.at(-1)?.scrollId,region=host.scrolls.get(id);
   if(region&&(['PageUp','PageDown'].includes(event.key)||host.modalOpen||target?.scrollId)){event.preventDefault();event.stopImmediatePropagation();region.offset=event.key==='Home'?0:event.key==='End'?region.max:Math.max(0,Math.min(region.max,region.offset+(event.key==='PageDown'?1:-1)*region.rect.h*.8));host.focusId=null;dirty=true;return;}
  }
  if(target&&(event.key==='Enter'||event.code==='Space')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)target.onTap?.({pointerId:'keyboard',x:target.rect.x+target.rect.w/2,y:target.rect.y+target.rect.h/2});dirty=true;}
  else if(target?.onKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();target.onKey(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1);dirty=true;}
 },true);
 function resize(force=false){
  const viewport=window.visualViewport,style=getComputedStyle(document.documentElement);
  const width=Math.max(1,Math.round(viewport?.width||innerWidth)),height=Math.max(1,Math.round(viewport?.height||innerHeight)),insets=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,parseFloat(style.getPropertyValue('--safe-'+side))||0]));
  const landscape=window.screen?.orientation?.type?window.screen.orientation.type.startsWith('landscape'):innerWidth>innerHeight;
  canvas.style.left=(viewport?.offsetLeft||0)+'px';canvas.style.top=(viewport?.offsetTop||0)+'px';
  if(force!==true&&width===host.width&&height===host.height&&landscape===host.landscape&&JSON.stringify(insets)===JSON.stringify(host.insets)&&canvas.width>1)return;
  host.width=width;host.height=height;host.insets=insets;host.landscape=landscape;
  canvas.style.width=host.width+'px';canvas.style.height=host.height+'px';
  if(renderer){renderer.setSize(host.width,host.height,false);}else{const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(host.width*ratio);canvas.height=Math.round(host.height*ratio);context.setTransform(ratio,0,0,ratio,0,0);}
  host.cancelInputs('resize');dirty=true;for(const fn of listeners)fn({resize:true,width:host.width,height:host.height});
 }
 function drawMenu(ctx){
  if(!dropdown)return;
  const menu=dropdown,pad=12,w=Math.min(420,ctx.width-24),maxH=ctx.height-ctx.insets.top-ctx.insets.bottom-32,h=Math.min(maxH,60+menu.options.length*48),x=Math.max(12,Math.min(menu.rect.x,ctx.width-w-12)),y=Math.max(ctx.insets.top+12,Math.min(menu.rect.y+menu.rect.h+6,ctx.height-ctx.insets.bottom-h-12));
  ctx.rect(0,0,ctx.width,ctx.height,{color:'#020a1370'});ctx.hit('select-backdrop',{x:0,y:0,w:ctx.width,h:ctx.height},{onTap:host.closeSelect});
  ctx.rect(x,y,w,h,{color:'#102432',radius:12,border:palette.cyan});ctx.block('select-panel',{x,y,w,h});
  ctx.text('Choose an option',x+16,y+17,{size:16,maxWidth:w-76});ctx.button('select-close','×',{x:x+w-52,y:y+6,w:44,h:44},host.closeSelect);
  ctx.scroll('select-'+menu.id,{x:x+pad,y:y+55,w:w-pad*2,h:h-61},menu.options.length*48,area=>{menu.options.forEach((option,i)=>ctx.button('select-option-'+i,option.label,{x:area.x,y:area.y+i*48,w:area.width-6,h:44},()=>{dropdown=null;menu.onChange?.(String(option.value));dirty=true;}));});
 }
 function compose(){
  if(!dirty)return;dirty=false;surface.begin(host.width,host.height);const ctx=createWidgets(host,surface);
  for(const {draw} of [...views.values()].sort((a,b)=>a.priority-b.priority))draw(ctx);
  if(host.isEditing&&host.editAnchor){const a=host.editAnchor,region=host.scrolls.get(a.scrollId);if(region){const current=ctx.targets.find(t=>t.id===a.id);if(current)a.contentY=current.rect.y-region.rect.y+region.offset;const padding=4;let offset=region.offset;if(a.contentY<offset+padding)offset=a.contentY-padding;else if(a.contentY+Math.min(a.height,region.rect.h-padding*2)>offset+region.rect.h-padding)offset=a.contentY+Math.min(a.height,region.rect.h-padding*2)-region.rect.h+padding;offset=Math.max(0,Math.min(region.max,offset));if(Math.abs(offset-region.offset)>.5){region.offset=offset;dirty=true;}}}
  if(toast){const w=Math.min(host.width-32,540),h=surface.measure(toast,15)>w-32?70:46,x=(host.width-w)/2,y=host.insets.top+64;ctx.rect(x,y,w,h,{color:'#132f3af2',radius:10,border:'#577f88'});ctx.text(toast,x+16,y+13,{size:15,maxWidth:w-32,maxLines:2});}
  drawMenu(ctx);
  if(!host.fontReady){
   ctx.rect(0,0,host.width,host.height,{color:'#101c29'});ctx.block('font-block',{x:0,y:0,w:host.width,h:host.height});
   const w=Math.min(330,host.width-40),x=(host.width-w)/2,y=Math.max(20,host.height/2-100);
   ctx.text('CITY FONT DOWNLOAD FAILED',x,y,{size:16,maxWidth:w});ctx.text('RETRY TO RESTORE THE UI',x,y+60,{size:14,maxWidth:w,color:'#edc583'});
   ctx.button('font-retry',host.fontRetrying?'LOADING':'RETRY',{x,y:y+110,w,h:48},host.retryFont,{disabled:host.fontRetrying,variant:'primary'});
  }
  lastTargets=ctx.targets;host.router.setTargets(lastTargets);surface.commit();
 }
 function render(){
  if(destroyed||document.hidden)return;
  const changed=dirty;compose();
  if(renderer){
   renderer.setRenderTarget(null);renderer.setViewport(0,0,host.width,host.height);renderer.setScissorTest(false);
   if(host.mode==='map'||!host.sceneReady){renderer.clear();for(const layer of [...layers.values()].sort((a,b)=>a.priority-b.priority))layer.render?.(renderer);}
   surface.render(renderer);
  }else if(changed||queued){
   if(painting){queued=true;return;}painting=true;queued=false;
   context.fillStyle='#101c29';context.fillRect(0,0,host.width,host.height);
   for(const layer of [...layers.values()].sort((a,b)=>a.priority-b.priority))layer.renderCanvas?.(context);
   surface.renderCanvas2D(context).catch(error=>console.error(error)).finally(()=>{painting=false;if(queued){dirty=true;}});
  }
 }
 function frame(){raf=0;if(destroyed)return;if(!externalFrame)render();raf=requestAnimationFrame(frame);}
 singleton=host;resize();raf=requestAnimationFrame(frame);if(fontError)setTimeout(()=>host.retryFont(),1500);return host;
}
