export const contains=(r,x,y)=>!!r&&x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h;
const eligible=(target,x,y)=>contains(target.rect,x,y)&&(!target.clip||contains(target.clip,x,y));

// One owner per pointer for its entire lifetime. A button, scrolling sheet,
// map gesture and camera gesture never compete for the same finger.
export function createInputRouter({invalidate=()=>{},scrollBy=()=>{},worldTap=()=>{},isBlocked=()=>false}={}){
 let targets=[],world={},hover=null;const pointers=new Map();
 function event(raw,record){return {...raw,dx:record?raw.x-record.x:0,dy:record?raw.y-record.y:0};}
 function hit(x,y){for(let i=targets.length-1;i>=0;i--)if(!targets[i].disabled&&eligible(targets[i],x,y))return targets[i];return null;}
 function down(raw){
  if(pointers.has(raw.pointerId))cancel(raw.pointerId);
  const target=hit(raw.x,raw.y),owner=target?'ui':isBlocked()?'blocked':'world';
  const p={owner,target,x:raw.x,y:raw.y,sx:raw.x,sy:raw.y,moved:false,scrolling:false,raw};pointers.set(raw.pointerId,p);
  if(owner==='world'){
   const other=[...pointers.values()].filter(v=>v.owner==='world');if(other.length>1)for(const v of other)v.moved=true;
   world.down?.(event(raw));
  }else if(target)target.onDown?.(event(raw));
  invalidate();return owner;
 }
 function move(raw){
  const p=pointers.get(raw.pointerId);
  if(!p){const next=hit(raw.x,raw.y)?.id||null;if(next!==hover){hover=next;invalidate();}return;}
  const e=event(raw,p),distance=Math.hypot(raw.x-p.sx,raw.y-p.sy);p.moved ||=distance>7;
  if(p.owner==='world')world.move?.(e);
  else if(p.owner==='ui'){
   if(p.target.scrollId&&!p.target.lockDrag&&p.moved&&raw.pointerType!=='mouse'){
    if(!p.scrolling){p.scrolling=true;p.target.onCancel?.(e);}
    scrollBy(p.target.scrollId,-e.dy);
   }else if(!p.scrolling)p.target.onMove?.(e);
  }
  p.x=raw.x;p.y=raw.y;p.raw=raw;invalidate();
 }
 function up(raw){
  const p=pointers.get(raw.pointerId);if(!p)return;
  pointers.delete(raw.pointerId);const e=event(raw,p);
  if(p.owner==='world'){world.up?.(e);if(!p.moved&&Math.hypot(raw.x-p.sx,raw.y-p.sy)<=7)worldTap(e);}
  else if(p.owner==='ui'&&!p.scrolling){p.target.onUp?.(e);if(!p.moved&&Math.hypot(raw.x-p.sx,raw.y-p.sy)<=7&&raw.button!==2&&eligible(p.target,raw.x,raw.y))p.target.onTap?.(e);}
  invalidate();
 }
 function cancel(id){const p=pointers.get(id);if(!p)return;pointers.delete(id);const e={...p.raw,pointerId:id};if(p.owner==='world')world.cancel?.(e);else if(p.owner==='ui'){if(p.target.onCancel)p.target.onCancel(e);else p.target.onUp?.(e);}invalidate();}
 function clear(){for(const id of [...pointers.keys()])cancel(id);hover=null;}
 return {down,move,up,cancel,clear,hit,pointers,
  setTargets(next){targets=next;},setWorld(next){world=next||{};},
  wheel(raw){const target=hit(raw.x,raw.y);if(target?.onWheel)target.onWheel(raw);else if(target?.scrollId)scrollBy(target.scrollId,raw.deltaY);else if(!target&&!isBlocked())world.wheel?.(raw);invalidate();},
  doubleClick(raw){const target=hit(raw.x,raw.y);if(target?.onDoubleClick)target.onDoubleClick(raw);else if(!target&&!isBlocked())world.doubleClick?.(raw);},
  get hovered(){return hover;},get pressed(){return new Set([...pointers.values()].map(p=>p.target?.id).filter(Boolean));},
 };
}
