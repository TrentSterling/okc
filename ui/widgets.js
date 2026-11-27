import {contains} from './input-router.js';
export const palette={ink:'#eff6f5',muted:'#9db4b8',panel:'#101f2ef5',line:'#36515e',accent:'#edc583',active:'#25485b',cyan:'#7fddd1',danger:'#f59b95'};
const box=r=>({x:r.x,y:r.y,w:r.w??r.width,h:r.h??r.height});
const intersect=(a,b)=>{if(!a)return b;if(!b)return a;const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return {x,y,w:Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h:Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y)};};
const visible=(r,c)=>!c||r.x+r.w>c.x&&r.x<c.x+c.w&&r.y+r.h>c.y&&r.y<c.y+c.h;
export function createWidgets(host,surface){
 let clip=null,scrollId=null;const targets=[];
 const press=host.router.pressed,hover=host.router.hovered;
 const ctx={width:host.width,height:host.height,insets:host.insets,compact:host.width<=720||host.height<500,landscape:host.landscape??host.width>host.height,targets,
  text(text,x,y,options={}){return surface.text(String(text??''),x,y,{size:16,color:palette.ink,...options,clip:intersect(clip,options.clip)});},
  rect(x,y,w,h,options={}){if(w>0&&h>0&&visible({x,y,w,h},clip))surface.rect(x,y,w,h,{color:palette.panel,...options,clip:intersect(clip,options.clip)});},
  circle(x,y,r,options={}){surface.circle(x,y,r,{color:palette.accent,...options,clip:intersect(clip,options.clip)});},
  line(x1,y1,x2,y2,options={}){surface.line(x1,y1,x2,y2,{color:palette.line,width:1,...options,clip:intersect(clip,options.clip)});},
  measure(text,size=16){return surface.measure(String(text??''),size);},
  clip(rect,fn){const old=clip;clip=intersect(old,box(rect));try{return fn();}finally{clip=old;}},
  hit(id,rect,handlers={}){rect=box(rect);if(!visible(rect,clip)||rect.w<=0||rect.h<=0)return;targets.push({id,rect,clip,scrollId,...handlers,onTap:handlers.onTap||handlers.onClick});},
  block(id,rect){ctx.hit(id,rect);},
  button(id,label,rect,onClick,options={}){
   rect=box(rect);const active=options.active||press.has(id),focused=host.focusId===id||hover===id;
   const color=options.disabled?'#162734':active?palette.active:options.variant==='primary'?palette.accent:options.variant==='danger'?'#613e42':'#1a303f';
   ctx.rect(rect.x,rect.y,rect.w,rect.h,{color,radius:9,border:focused?palette.cyan:active?palette.accent:palette.line,borderWidth:focused?2:1});
   const baseSize=options.size||15,available=rect.w-12,size=Math.max(12,Math.min(baseSize,baseSize*available/Math.max(1,ctx.measure(label,baseSize))));
   ctx.text(label,rect.x+rect.w/2,rect.y+(rect.h-size*1.25)/2,{size,color:options.disabled?'#647d87':options.variant==='primary'? '#152635':palette.ink,align:'center',maxWidth:available,maxLines:1});
   ctx.hit(id,rect,{onTap:onClick,disabled:!!options.disabled,focusable:true,label:String(label),kind:'button'});
  },
  hold(id,label,rect,options={}){
   ctx.button(id,label,rect,()=>{},options);const target=targets[targets.length-1];if(target?.id===id)Object.assign(target,{lockDrag:true,onDown:e=>options.onDown?.(e.pointerId),onUp:e=>options.onUp?.(e.pointerId),onCancel:e=>options.onUp?.(e.pointerId),onTap:null,kind:'hold'});
  },
  toggle(id,label,rect,{value,onChange,disabled=false}={}){
   rect=box(rect);ctx.text(label,rect.x+8,rect.y+(rect.h-18)/2,{size:15,maxWidth:rect.w-72,color:disabled?palette.muted:palette.ink});
   ctx.rect(rect.x+rect.w-54,rect.y+(rect.h-26)/2,46,26,{color:value?palette.cyan:'#35515e',radius:13});
   ctx.circle(rect.x+rect.w-(value?21:41),rect.y+rect.h/2,9,{color:value?'#13313a':'#cedbdc'});
   ctx.hit(id,rect,{onTap:()=>onChange?.(!value),disabled,focusable:true,label,kind:'toggle'});
  },
  slider(id,rect,{value=0,min=0,max=1,step=.01,onChange,onCommit,disabled=false}={}){
   rect=box(rect);const fraction=Math.max(0,Math.min(1,(value-min)/(max-min||1))),y=rect.y+rect.h/2;
   ctx.rect(rect.x+12,y-3,rect.w-24,6,{color:'#334b59',radius:3});ctx.rect(rect.x+12,y-3,(rect.w-24)*fraction,6,{color:palette.cyan,radius:3});ctx.circle(rect.x+12+(rect.w-24)*fraction,y,9,{color:disabled?'#667984':palette.ink});
   const update=e=>{const f=Math.max(0,Math.min(1,(e.x-rect.x-12)/(rect.w-24)));const next=Math.min(max,Math.max(min,min+Math.round(f*(max-min)/step)*step));onChange?.(+next.toFixed(6));host.invalidate();};
   ctx.hit(id,rect,{lockDrag:true,disabled,focusable:true,kind:'slider',value,min,max,step,label:id,onDown:update,onMove:update,onUp:()=>onCommit?.(),onKey:delta=>onChange?.(Math.max(min,Math.min(max,value+delta*step)))});
  },
  input(id,rect,options={}){
   rect=box(rect);const editing=host.platform.editing?.id===id,text=editing?host.platform.editing.value:String(options.value??'');
   ctx.rect(rect.x,rect.y,rect.w,rect.h,{color:'#091b28',radius:8,border:editing?palette.cyan:palette.line,borderWidth:editing?2:1});
   ctx.clip({x:rect.x+10,y:rect.y+5,w:rect.w-20,h:rect.h-10},()=>ctx.text(text||options.placeholder||'',rect.x+12,rect.y+(options.multiline?10:(rect.h-18)/2),{size:16,maxWidth:rect.w-24,maxLines:options.multiline?Math.floor(rect.h/20):1,color:text?palette.ink:palette.muted}));
   if(editing){const width=ctx.measure(text.split('\n').at(-1)||'',16);ctx.line(Math.min(rect.x+rect.w-12,rect.x+12+width),rect.y+12,Math.min(rect.x+rect.w-12,rect.x+12+width),rect.y+30,{color:palette.cyan,width:2});}
   ctx.hit(id,rect,{focusable:true,label:options.label||options.placeholder||id,kind:'input',onTap:()=>host.platform.beginEdit(id,text,options)});
  },
  select(id,rect,{value,options=[],onChange,disabled=false}={}){
   rect=box(rect);const selected=options.find(o=>String(typeof o==='object'?o.value:o)===String(value));
   ctx.button(id,(typeof selected==='object'?selected?.label:selected)??String(value??'Select'),rect,()=>host.openSelect(id,rect,options,onChange),{disabled});
  },
  scroll(id,rect,contentHeight,fn){
   rect=box(rect);const max=Math.max(0,contentHeight-rect.h),old=scrollId;
   const record=host.scrolls.get(id)||{offset:0};record.offset=Math.max(0,Math.min(max,record.offset));Object.assign(record,{max,rect,contentHeight});host.scrolls.set(id,record);
   scrollId=id;ctx.block(id+'-scroll',rect);ctx.clip(rect,()=>fn({x:rect.x,y:rect.y-record.offset,width:rect.w,offset:record.offset}));scrollId=old;
   if(max>0){const bar=Math.max(28,rect.h*rect.h/contentHeight);ctx.rect(rect.x+rect.w-4,rect.y+(rect.h-bar)*record.offset/max,3,bar,{color:'#6c939b',radius:2});}
  },
 };
 return ctx;
}
