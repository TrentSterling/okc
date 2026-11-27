import {getUI} from '../ui/runtime.js';
import {placeColor,placeIcon} from './catalog.js';
import {boundsOf,createSpatialIndex} from './spatial-index.js';
import {pointsOf,waterKind,roadClass,roadWidth,packMapGeometry} from './map-geometry.js';
import {createMapBatches} from './map-batches.js';
import {createMapCamera} from './map-camera.js';

const geometry=item=>({...item,p:pointsOf(item),holes:(item.holes||[]).map(p=>pointsOf({p})).filter(p=>p.length>2)});
const inside=(p,x,z)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
export function createGPUMap({onSelect=()=>{},onMove=()=>{},onView=()=>{},onSelectBuilding=()=>{}}={}){
 const ui=getUI(),batches=createMapBatches();
 let visible=false,places=[],buildings=[],selected=null,selectedBuilding=null,route=[],roadRoute=null,position=null,labels=true,layers={roads:true,parks:true,water:true,buildings:true};
 let data={roads:[],surfaces:[],districts:[]},pending=null,roadIndex=createSpatialIndex([]),surfaceIndex=createSpatialIndex([]),buildingIndex=createSpatialIndex([]),visibleRoads=[],visibleSurfaces=[],visibleBuildings=[],targets=[];
 let viewportDirty=true,viewTimer=0,worker=null,job=0,baseJob=0,buildingJob=0,baseReady=false,dead=false,preparing=false,lastSize='',workerFailed=false,activeJob=null;
 const queuedGeometry=new Map();
 const model=createMapCamera({changed(){viewportDirty=true;ui.invalidate();onMove();emitView();},tap});
 const {state}=model;
 function getView(){const a=model.world(0,0),b=model.world(state.width,state.height);return {bounds:{minX:a.x,minZ:a.z,maxX:b.x,maxZ:b.z},scale:state.scale,center:{...state.center},width:state.width,height:state.height,visible,layers:{buildings:layers.buildings}};}
 function emitView(){clearTimeout(viewTimer);viewTimer=setTimeout(()=>{if(!dead)onView(getView());},100);}
 function accept(result){
  if(dead)return;if(result.error)ui.toast('Map geometry: '+result.error);
  else{if(result.id===baseJob){batches.setBase(result.packed);baseReady=true;}if(result.id===buildingJob)batches.setBuildings(result.packed);ui.invalidate();}
  activeJob=null;pumpGeometry();
 }
 function fallbackGeometry(task){import('three').then(({ShapeUtils})=>{if(!dead)accept({id:task.id,packed:packMapGeometry(task.input,ShapeUtils.triangulateShape)});}).catch(error=>accept({id:task.id,error:error.message}));}
 function failWorker(){workerFailed=true;worker?.terminate();worker=null;const task=activeJob;if(task)fallbackGeometry(task);else pumpGeometry();}
 function pumpGeometry(){
  if(dead||activeJob||!queuedGeometry.size)return;const kind=queuedGeometry.has('base')?'base':'buildings';activeJob=queuedGeometry.get(kind);queuedGeometry.delete(kind);
  if(workerFailed||typeof Worker==='undefined'){fallbackGeometry(activeJob);return;}
  try{if(!worker){worker=new Worker(new URL('./map-geometry.worker.js',import.meta.url),{type:'module'});worker.onmessage=({data:result})=>accept(result);worker.onerror=failWorker;}worker.postMessage(activeJob);}catch{failWorker();}
 }
 function requestGeometry(input,kind){
  if(!ui.renderer)return;const id=++job;if(kind==='base')baseJob=id;else buildingJob=id;
  // At most one running build and one newest job of each kind. Tile arrivals
  // replace obsolete queued footprint work instead of cloning an endless queue.
  queuedGeometry.set(kind,{id,input});pumpGeometry();
 }
 async function prepare(){
  if(!pending||preparing)return;preparing=true;const next=pending;pending=null;
  const roads=[],surfaces=[],sourceSurfaces=next.surfaces||[...(next.waters||[]).map(v=>({...v,kind:'water'})),...(next.parks||[]).map(v=>({...v,kind:'park'}))];
  // Index construction yields between small batches; GPU triangles and road
  // buffers are prepared by the worker and survive every camera movement.
  for(const [source,out,min]of [[next.roads||[],roads,2],[sourceSurfaces,surfaces,3]])for(let i=0;i<source.length;i+=400){for(const raw of source.slice(i,i+400)){const item=geometry(raw);if(item.p.length>=min){item.b=boundsOf(item.p);out.push(item);}}await new Promise(resolve=>setTimeout(resolve,0));if(dead)return;}
  data={roads,surfaces,districts:next.districts||[]};roadIndex=createSpatialIndex(roads);surfaceIndex=createSpatialIndex(surfaces);requestGeometry({roads,surfaces},'base');viewportDirty=true;ui.invalidate();preparing=false;if(pending)prepare();
 }
 function updateVisible(){if(!viewportDirty)return;const v=getView().bounds,b=[v.minX,v.minZ,v.maxX,v.maxZ];visibleRoads=roadIndex.query(b);visibleSurfaces=surfaceIndex.query(b);visibleBuildings=buildingIndex.query(b);viewportDirty=false;}
 function tap(e){const hit=targets.find(t=>Math.hypot(t.x-e.x,t.y-e.y)<=Math.max(22,t.r+5));if(hit){if(hit.places.length===1)onSelect(hit.places[0]);else model.zoom(2,{x:hit.x,y:hit.y});return;}if(layers.buildings&&state.scale>=.18){const p=model.world(e.x,e.y),b=visibleBuildings.find(b=>p.x>=b.b[0]&&p.x<=b.b[2]&&p.z>=b.b[1]&&p.z<=b.b[3]&&inside(b.p,p.x,p.z)&&!b.holes.some(h=>inside(h,p.x,p.z)));if(b){selectedBuilding=b.id;onSelectBuilding(b);ui.invalidate();}}}
 function draw(ctx){
  if(!visible||ui.mode!=='map')return;
  const size=ctx.width+':'+ctx.height;if(size!==lastSize){lastSize=size;state.width=ctx.width;state.height=ctx.height;viewportDirty=true;emitView();}prepare();updateVisible();
  ctx.hit('atlas-gesture',{x:0,y:0,w:ctx.width,h:ctx.height},{lockDrag:true,onDown:model.down,onMove:model.move,onUp:model.up,onCancel:model.cancel,onWheel:e=>model.zoom(Math.exp(-e.deltaY*.0015),e),onDoubleClick:e=>model.zoom(1.7,e)});
  const {scale}=state,screen=model.screen;
  if(labels){
   if(scale<.28)for(const d of data.districts){if(Number.isFinite(d.x)&&Number.isFinite(d.z)){const [x,y]=screen(d.x,d.z);ctx.text(String(d.name).toUpperCase(),x,y,{align:'center',size:12,color:'#a5bab4',maxWidth:210,maxLines:1});}}
   if(layers.roads&&scale>.09){const cells=new Set();for(const road of visibleRoads){if(!road.name)continue;const [x,y]=screen(...road.p[Math.floor(road.p.length/2)]);if(x<0||x>ctx.width||y<0||y>ctx.height)continue;const key=Math.floor(x/170)+':'+Math.floor(y/65);if(cells.has(key))continue;cells.add(key);ctx.text(road.name,x,y-15,{size:12,align:'center',color:'#a9bcb4',maxWidth:160,maxLines:1});}}
  }
  const points=roadRoute?.points?.length>1?roadRoute.points:route.filter(p=>p.x!=null&&p.z!=null).map(p=>[p.x,p.z]);
  for(let i=1;i<points.length;i++){const a=screen(...points[i-1]),b=screen(...points[i]);if(roadRoute)ctx.line(...a,...b,{color:'#10242b',width:7});ctx.line(...a,...b,{color:'#edc583',width:roadRoute?3:2});}
  const clusterSize=scale<.03?88:scale<.08?64:46,clusters=new Map();targets=[];
  for(const p of places){if(p.x==null||p.z==null)continue;const [x,y]=screen(p.x,p.z);if(x<-30||x>ctx.width+30||y<-30||y>ctx.height+30)continue;const key=scale<.55?Math.floor(x/clusterSize)+':'+Math.floor(y/clusterSize):p.id,c=clusters.get(key)||{x:0,y:0,places:[]};c.x+=x;c.y+=y;c.places.push(p);clusters.set(key,c);}
  for(const c of clusters.values()){
   c.x/=c.places.length;c.y/=c.places.length;const p=c.places.find(p=>p.id===selected)||c.places[0],active=c.places.some(p=>p.id===selected),n=c.places.length,r=n>1?Math.min(21,13+Math.log(n)*2):active?15:11;
   ctx.circle(c.x,c.y,r,{color:active?'#edc583':n>1?'#273e40':placeColor(p),border:active?'#fff1c9':'#91afa0',borderWidth:active?2:1});ctx.text(n>1?String(n):placeIcon(p),c.x,c.y-8,{size:n>1?12:14,align:'center',color:n>1&&!active?'#e9f0e5':'#152528'});
   if(n===1&&(active||scale>.2)&&labels){const w=Math.min(220,ctx.measure(p.name,13)+12);ctx.rect(c.x-w/2,c.y+r+4,w,23,{color:'#12272aed',radius:4});ctx.text(p.name,c.x,c.y+r+7,{size:13,align:'center',maxWidth:w-12,maxLines:1,color:active?'#edc583':'#d4dfd6'});}targets.push({...c,r});
  }
  route.forEach((p,i)=>{if(p.x==null||p.z==null)return;const [x,y]=screen(p.x,p.z);ctx.circle(x-13,y-13,10,{color:'#edc583',border:'#29372f'});ctx.text(String(i+1),x-13,y-20,{size:11,align:'center',color:'#152528'});});
  if(position?.x!=null&&position?.z!=null){const [x,y]=screen(position.x,position.z),heading=position.heading||0;ctx.circle(x,y,7,{color:'#f0f8ed',border:'#102634',borderWidth:2});ctx.line(x,y,x+Math.cos(heading)*16,y+Math.sin(heading)*16,{color:'#f0f8ed',width:4});}
  if(selectedBuilding){const b=visibleBuildings.find(v=>v.id===selectedBuilding);if(b)for(let i=0;i<b.p.length;i++)ctx.line(...screen(...b.p[i]),...screen(...b.p[(i+1)%b.p.length]),{color:'#edc583',width:2});}
  const meters=scale>.3?100:scale>.12?500:scale>.05?1000:2000,x=20+ctx.insets.left,y=ctx.height-ctx.insets.bottom-26;ctx.text(meters>=1000?meters/1000+' km':meters+' m',x,y-20,{size:12,color:'#cbd6cc'});ctx.line(x,y,x+meters*scale,y,{color:'#b4c5b9',width:2});ctx.text('© OpenStreetMap contributors',ctx.width-16-ctx.insets.right,ctx.height-ctx.insets.bottom-18,{align:'right',size:11,color:'#91a79b'});
  if(preparing||ui.renderer&&!baseReady)ctx.text('Preparing map geometry…',ctx.width/2,ctx.height-ctx.insets.bottom-48,{align:'center',size:14,color:'#edc583'});
 }
 function renderCanvas(context){
  if(!visible||ui.mode!=='map')return;updateVisible();context.fillStyle='#142326';context.fillRect(0,0,state.width,state.height);
  const path=(points,close=false,begin=true)=>{if(begin)context.beginPath();points.forEach((p,i)=>{const [x,y]=model.screen(...p);i?context.lineTo(x,y):context.moveTo(x,y);});if(close)context.closePath();};
  const polygon=item=>{path(item.p,true);for(const hole of item.holes)path(hole,true,false);context.fill('evenodd');};
  for(const item of visibleSurfaces){const water=waterKind(item);if(water?!layers.water:!layers.parks)continue;context.fillStyle=water?'#24444d':'#203f33';polygon(item);}
  if(layers.buildings&&state.scale>=.18){context.fillStyle='#687c7373';for(const item of visibleBuildings)polygon(item);}
  if(layers.roads){context.lineCap='round';context.lineJoin='round';for(let kind=0;kind<3;kind++){if(kind===0&&state.scale<.035)continue;context.strokeStyle=['#304440','#465d57','#70817a'][kind];for(const road of visibleRoads){if(roadClass(road)!==kind)continue;context.lineWidth=roadWidth(kind,road.w||(kind===2?15:kind===1?10:5),state.scale);path(road.p);context.stroke();}}}
 }
 const removeView=ui.addView('atlas',draw,0),removeLayer=ui.addLayer('atlas',{render(renderer){if(visible&&ui.mode==='map')batches.render(renderer,{...state,layers});},renderCanvas}),removeCancel=ui.onCancelInputs(model.clear);
 const key=e=>{if(!visible||ui.mode!=='map'||ui.isEditing||ui.modalOpen||e.defaultPrevented)return;if(['+','=','-','_'].includes(e.key)){e.preventDefault();model.zoom(['+','='].includes(e.key)?1.5:1/1.5);}else if(e.key==='Home'){e.preventDefault();model.fit();}else{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();state.center.x+=d[0]*100/state.scale;state.center.z+=d[1]*100/state.scale;viewportDirty=true;ui.invalidate();emitView();}}};window.addEventListener('keydown',key);
 return {getView,fit:model.fit,focus:model.focus,zoom:model.zoom,
  show(){visible=true;state.width=ui.width;state.height=ui.height;viewportDirty=true;ui.invalidate();emitView();},hide(){visible=false;model.clear();clearTimeout(viewTimer);onView(getView());ui.invalidate();},
  setData(next={}){const b=next.bounds;if(Array.isArray(b))state.bounds=b;else if(b)state.bounds=[b.minX,b.minZ,b.maxX,b.maxZ];pending=next;baseReady=false;if(visible)prepare();ui.invalidate();},
  setInsets(value){state.insets={...state.insets,...value};},
  setBuildings(value){buildings=(value||[]).map(geometry).filter(b=>b.p.length>2);for(const b of buildings)b.b=boundsOf(b.p);buildingIndex=createSpatialIndex(buildings);requestGeometry({buildings},'buildings');viewportDirty=true;ui.invalidate();},
  setPlaces(value){if(places!==value){places=value;ui.invalidate();}},setSelected(value){if(selected!==value){selected=value;ui.invalidate();}},
  setRoute(value){route=value;ui.invalidate();},setRoadRoute(value){roadRoute=value?{...value,points:pointsOf({p:value.points||[]})}:null;ui.invalidate();},
  setPosition(value){position=value;if(visible)ui.invalidate();},
  setLayers(value){layers={...layers,...value};labels=value.labels??labels;ui.invalidate();emitView();},getScale(){return state.scale;},
  destroy(){dead=true;queuedGeometry.clear();activeJob=null;removeView();removeLayer();removeCancel();clearTimeout(viewTimer);worker?.terminate();batches.dispose();window.removeEventListener('keydown',key);},
  get stats(){return {roads:data.roads.length,surfaces:data.surfaces.length,buildings:buildings.length,places:places.length,baseReady,...batches.stats};},
 };
}
