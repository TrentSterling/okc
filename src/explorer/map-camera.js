const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createMapCamera({changed=()=>{},tap=()=>{}}={}){
 const state={width:1,height:1,center:{x:-10000,z:-3000},scale:.025,bounds:[-27000,-17000,7000,8000],insets:{left:0,right:0,top:0,bottom:0}};
 const pointers=new Map();let pinching=false;
 const world=(x,y)=>({x:(x-state.width/2)/state.scale+state.center.x,z:(y-state.height/2)/state.scale+state.center.z});
 const screen=(x,z)=>[(x-state.center.x)*state.scale+state.width/2,(z-state.center.z)*state.scale+state.height/2];
 function zoom(factor,pivot={x:state.width/2,y:state.height/2}){const a=world(pivot.x,pivot.y);state.scale=clamp(state.scale*factor,.002,4);const b=world(pivot.x,pivot.y);state.center.x+=a.x-b.x;state.center.z+=a.z-b.z;changed();}
 function fit(){const {width,height,bounds:b,insets:i}=state,usableW=Math.max(80,width-i.left-i.right-40),usableH=Math.max(80,height-i.top-i.bottom-40);state.scale=clamp(Math.min(usableW/(b[2]-b[0]),usableH/(b[3]-b[1])),.002,4);state.center={x:(b[0]+b[2])/2-(i.left-i.right)/2/state.scale,z:(b[1]+b[3])/2-(i.top-i.bottom)/2/state.scale};changed();}
 function focus(p,targetScale=.32){if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return;state.scale=Math.max(state.scale,targetScale);const i=state.insets;state.center={x:p.x-(i.left-i.right)/2/state.scale,z:p.z-(i.top-i.bottom)/2/state.scale};changed();}
 const pair=()=>{const a=[...pointers.values()].slice(0,2);return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y))};};
 function down(e){pointers.set(e.pointerId,{x:e.x,y:e.y,sx:e.x,sy:e.y,moved:false});if(pointers.size>1){pinching=true;for(const p of pointers.values())p.moved=true;}}
 function move(e){const p=pointers.get(e.pointerId);if(!p)return;const before=pointers.size>1?pair():null,dx=e.x-p.x,dy=e.y-p.y;p.x=e.x;p.y=e.y;p.moved ||= Math.hypot(e.x-p.sx,e.y-p.sy)>7;if(before){const after=pair(),anchor=world(before.x,before.y);state.scale=clamp(state.scale*after.d/before.d,.002,4);const now=world(after.x,after.y);state.center.x+=anchor.x-now.x;state.center.z+=anchor.z-now.z;}else{state.center.x-=dx/state.scale;state.center.z-=dy/state.scale;}changed();}
 function up(e){const p=pointers.get(e.pointerId);if(!p)return;pointers.delete(e.pointerId);if(!p.moved&&!pinching&&Math.hypot(e.x-p.sx,e.y-p.sy)<=7)tap(e);if(!pointers.size)pinching=false;}
 function cancel(e){pointers.delete(e.pointerId);if(!pointers.size)pinching=false;}
 function clear(){pointers.clear();pinching=false;}
 return {state,world,screen,zoom,fit,focus,down,move,up,cancel,clear,pointers};
}
