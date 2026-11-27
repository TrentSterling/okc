import {placeColor,placeIcon} from './catalog.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const point=v=>Array.isArray(v)?v:[v.x,v.z];
const boundsOf=p=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const v of p){const [x,z]=point(v);a=Math.min(a,x);b=Math.min(b,z);c=Math.max(c,x);d=Math.max(d,z);}return[a,b,c,d];};
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function createMap(canvas,{onSelect=()=>{},onMove=()=>{},onView=()=>{},onSelectBuilding=()=>{}}={}){
 const ctx=canvas.getContext('2d',{alpha:false});
 let width=1,height=1,dpr=1,visible=false,dirty=true,frame=0,places=[],buildings=[],selectedBuilding=null,selected=null,route=[],roadRoute=null,position=null,data={roads:[],surfaces:[],districts:[]},bounds=[-27000,-17000,7000,8000],center={x:-10000,z:-3000},scale=.025,baseScale=.025,targets=[],labels=true,layers={roads:true,water:true,parks:true,buildings:true},drag=null,hover=null,viewTimer;
 const resize=()=>{const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);dirty=true;schedule();};
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 function schedule(){if(!frame&&visible)frame=requestAnimationFrame(()=>{frame=0;if(dirty){draw();dirty=false;}});}
 const screen=(x,z)=>[(x-center.x)*scale+width/2,(z-center.z)*scale+height/2];
 const world=(x,y)=>({x:(x-width/2)/scale+center.x,z:(y-height/2)/scale+center.z});
 function getView(){const a=world(0,0),b=world(width,height);return {bounds:{minX:a.x,minZ:a.z,maxX:b.x,maxZ:b.z},scale,center:{...center},width,height,visible};}
 function emitView(){clearTimeout(viewTimer);viewTimer=setTimeout(()=>onView(getView()),100);}
 function setData(next={}){
  const b=next.bounds;if(Array.isArray(b))bounds=b;else if(b)bounds=[b.minX,b.minZ,b.maxX,b.maxZ];
  const roads=(next.roads||[]).map(r=>({...r,p:(r.p||r.points||[]).map(point)})).filter(r=>r.p.length>1);
  const surfaces=(next.surfaces||[...(next.waters||[]).map(w=>({...w,kind:'water'})),...(next.parks||[]).map(w=>({...w,kind:'park'}))]).map(r=>({...r,p:(r.p||r.points||[]).map(point)})).filter(r=>r.p.length>2);
  for(const r of [...roads,...surfaces])r.b=boundsOf(r.p);
  data={...next,roads,surfaces,districts:next.districts||[]};dirty=true;schedule();
 }
 function fit(){const panel=document.querySelector('.ex-panel'),r=panel&&!panel.hidden?panel.getBoundingClientRect():null,left=width>760&&r?Math.min(width*.45,r.right+35):50,right=60,top=155,bottom=80;baseScale=Math.min((width-left-right)/(bounds[2]-bounds[0]),(height-top-bottom)/(bounds[3]-bounds[1]));scale=Math.max(.002,baseScale);center={x:(bounds[0]+bounds[2])/2-(left-right)/2/scale,z:(bounds[1]+bounds[3])/2-(top-bottom)/2/scale};dirty=true;schedule();emitView();}
 function zoom(factor,pivot={x:width/2,y:height/2}){const a=world(pivot.x,pivot.y);scale=clamp(scale*factor,.002,4);const b=world(pivot.x,pivot.y);center.x+=a.x-b.x;center.z+=a.z-b.z;dirty=true;schedule();emitView();}
 function focus(p,targetScale=.32){if(p?.x==null||p?.z==null)return;center={x:p.x,z:p.z};scale=Math.max(scale,targetScale);selected=p.id||selected;dirty=true;schedule();emitView();}
 function path(points,close=false){ctx.beginPath();for(let i=0;i<points.length;i++){const s=screen(...points[i]);if(!i)ctx.moveTo(...s);else ctx.lineTo(...s);}if(close)ctx.closePath();}
 function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#142326';ctx.fillRect(0,0,width,height);targets=[];
  const a=world(0,0),b=world(width,height),view=[a.x,a.z,b.x,b.z];
  const grid=scale>.15?512:2048;ctx.lineWidth=1;ctx.strokeStyle='rgba(196,215,202,.035)';ctx.beginPath();
  for(let x=Math.floor(a.x/grid)*grid;x<b.x;x+=grid){const s=screen(x,0)[0];ctx.moveTo(s,0);ctx.lineTo(s,height);}for(let z=Math.floor(a.z/grid)*grid;z<b.z;z+=grid){const s=screen(0,z)[1];ctx.moveTo(0,s);ctx.lineTo(width,s);}ctx.stroke();
  for(const s of data.surfaces){if(!intersects(s.b,view))continue;const water=/water|lake|river|reservoir|canal|pond/.test(s.kind||'');if(water&&!layers.water||!water&&!layers.parks)continue;path(s.p,true);ctx.fillStyle=water?'#24444d':/park|forest|wood|grass|nature/.test(s.kind||'')?'#203f33':'#253335';ctx.fill();}
  if(layers.buildings&&scale>=.18){for(const building of buildings){if(!intersects(building.b,view))continue;path(building.p,true);ctx.fillStyle=building.id===selectedBuilding?'#d3b97999':'#8c99843b';ctx.fill();if(scale>.3){ctx.strokeStyle=building.id===selectedBuilding?'#f2cc87':'#a0b59b66';ctx.lineWidth=building.id===selectedBuilding?2:.65;ctx.stroke();}}}
  if(layers.roads){
   for(const r of data.roads){if(!intersects(r.b,view))continue;const major=/motorway|trunk|primary/.test(r.kind||r.type||''),secondary=/secondary|tertiary/.test(r.kind||r.type||'');if(scale<.035&&!major&&!secondary)continue;path(r.p);ctx.lineWidth=major?Math.max(2,Math.min(7,(r.w||15)*scale)):secondary?Math.max(1.2,Math.min(5,(r.w||10)*scale)):Math.max(.65,Math.min(3,(r.w||5)*scale));ctx.strokeStyle=major?'#70817a':secondary?'#465d57':'#304440';ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();}
   if(scale>.09&&labels){const cells=new Set();ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillStyle='#b3c1b7';for(const r of data.roads){if(!r.name||!intersects(r.b,view)||r.p.length<2||r.name===undefined)continue;const mid=Math.floor(r.p.length/2),s=screen(...r.p[mid]),key=Math.floor(s[0]/150)+':'+Math.floor(s[1]/60);if(cells.has(key))continue;cells.add(key);ctx.fillText(r.name,s[0],s[1]-6);}}
  }
  if(labels&&scale<.28){ctx.textAlign='center';for(const d of data.districts){if(d.x==null||d.z==null)continue;const s=screen(d.x,d.z);ctx.font='600 13px system-ui';ctx.fillStyle='rgba(212,224,211,.63)';ctx.fillText(String(d.name).toUpperCase(),s[0],s[1]);}}
  if(roadRoute?.points?.length>1){const points=roadRoute.points.map(point);path(points);ctx.strokeStyle='#122323';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#f2c780';ctx.lineWidth=4;ctx.stroke();}
  else if(route.length>1){const m=route.filter(p=>p.x!=null&&p.z!=null);ctx.strokeStyle='#efc784';ctx.lineWidth=2;ctx.setLineDash([6,6]);path(m.map(p=>[p.x,p.z]));ctx.stroke();ctx.setLineDash([]);}
  const clusters=new Map();for(const p of places){if(p.x==null||p.z==null)continue;const s=screen(p.x,p.z);if(s[0]<-30||s[0]>width+30||s[1]<-30||s[1]>height+30)continue;const key=scale<.55?`${Math.floor(s[0]/46)}:${Math.floor(s[1]/46)}`:p.id;const c=clusters.get(key)||{x:0,y:0,places:[]};c.x+=s[0];c.y+=s[1];c.places.push(p);clusters.set(key,c);}
  for(const c of clusters.values()){
   c.x/=c.places.length;c.y/=c.places.length;const p=c.places.find(p=>p.id===selected)||c.places[0],active=c.places.some(p=>p.id===selected),n=c.places.length,r=n>1?Math.min(21,13+Math.log(n)*2):active?15:11;
   ctx.shadowColor='#0006';ctx.shadowBlur=10;ctx.fillStyle=active?'#f2ce8c':n>1?'#273e40':placeColor(p);ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=active?3:1.5;ctx.strokeStyle=active?'#fff1c9':n>1?'#91afa0':'#15282a';ctx.stroke();ctx.fillStyle=n>1&&!active?'#e9f0e5':'#152528';ctx.font=`600 ${n>1?12:13}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n>1?String(n):placeIcon(p),c.x,c.y+.5);
   if(n===1&&(active||scale>.2)&&labels){const title=p.name.length>31?p.name.slice(0,29)+'…':p.name;ctx.font='500 12px system-ui';ctx.fillStyle='#142326';const w=ctx.measureText(title).width;ctx.fillRect(c.x-w/2-5,c.y+r+4,w+10,19);ctx.fillStyle=active?'#f1d29f':'#d4dfd6';ctx.fillText(title,c.x,c.y+r+13);}
   targets.push({...c,r});
  }
  route.forEach((p,i)=>{if(p.x==null||p.z==null)return;const s=screen(p.x,p.z);ctx.fillStyle='#f1c986';ctx.strokeStyle='#29372f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s[0]-13,s[1]-13,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#152528';ctx.font='700 10px system-ui';ctx.fillText(String(i+1),s[0]-13,s[1]-13);});
  if(position?.x!=null&&position?.z!=null){const s=screen(position.x,position.z);ctx.save();ctx.translate(...s);ctx.rotate((position.heading||0)+Math.PI/2);ctx.fillStyle='#f4f6e9';ctx.strokeStyle='#152528';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();}
  const meters=scale>.3?100:scale>.12?500:scale>.05?1000:2000;const bar=meters*scale;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#cbd6cc';ctx.font='12px system-ui';ctx.fillText(meters>=1000?`${meters/1000} km`:`${meters} m`,24,height-39);ctx.strokeStyle='#b4c5b9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(24,height-32);ctx.lineTo(24+bar,height-32);ctx.stroke();
  ctx.fillStyle='#91a79b';ctx.textAlign='right';ctx.fillText('© OpenStreetMap contributors',width-20,height-17);
 }
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false};});
 canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(drag?.id===e.pointerId){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;center.x-=dx/scale;center.z-=dy/scale;drag.x=e.clientX;drag.y=e.clientY;drag.moved ||= Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5;dirty=true;schedule();onMove();emitView();}else{hover=targets.find(c=>Math.hypot(c.x-x,c.y-y)<c.r+5);canvas.style.cursor=hover?'pointer':'grab';canvas.title=hover?.places.length===1?hover.places[0].name:hover?`${hover.places.length} places; click to zoom`:'';}});
 function inside(polygon,x,z){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;if(!drag.moved){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,c=targets.find(c=>Math.hypot(c.x-x,c.y-y)<c.r+5);if(c){if(c.places.length===1)onSelect(c.places[0]);else zoom(2,{x:c.x,y:c.y});}else if(layers.buildings&&scale>=.18){const w=world(x,y),b=buildings.find(b=>w.x>=b.b[0]&&w.x<=b.b[2]&&w.z>=b.b[1]&&w.z<=b.b[3]&&inside(b.p,w.x,w.z));if(b){selectedBuilding=b.id;onSelectBuilding(b);dirty=true;schedule();}}}drag=null;});
 canvas.addEventListener('pointercancel',()=>{drag=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
 canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect();zoom(1.7,{x:e.clientX-r.left,y:e.clientY-r.top});});
 return {setData,fit,focus,zoom,getView,show(){visible=true;resize();schedule();emitView();},hide(){visible=false;},setBuildings(v){buildings=(v||[]).map(b=>({...b,p:(b.p||b.points||[]).map(point)})).filter(b=>b.p.length>2);for(const b of buildings)b.b=boundsOf(b.p);dirty=true;schedule();},setPlaces(v){places=v;dirty=true;schedule();},setSelected(v){selected=v;dirty=true;schedule();},setRoute(v){route=v;dirty=true;schedule();},setRoadRoute(v){roadRoute=v;dirty=true;schedule();},setPosition(v){position=v;if(visible){dirty=true;schedule();}},setLayers(v){layers={...layers,...v};labels=v.labels??labels;dirty=true;schedule();},getScale(){return scale;},destroy(){observer.disconnect();clearTimeout(viewTimer);cancelAnimationFrame(frame);},get stats(){return {roads:data.roads.length,surfaces:data.surfaces.length,buildings:buildings.length,places:places.length};}};
}
