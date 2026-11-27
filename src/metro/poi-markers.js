import * as THREE from 'three';
import {getUI} from '../ui/runtime.js';

const palette={subway:'#eec958',mexican:'#ef9a76',arcade:'#b39cf5',bowling:'#b39cf5',bar:'#b39cf5',christmas:'#9fe5bd',park:'#9fe5bd',water:'#87c7de',shopping:'#edb27d',thrift:'#edb27d',default:'#d5e0dc'};
const tagText=p=>Array.isArray(p.tags)?p.tags.join(' '):Object.values(p.tags||{}).join(' ');

// Place labels share the screen-space GPU glyph atlas. No per-place canvas,
// browser-font rasterization, texture upload, SpriteMaterial or draw call.
export function createPOIMarkers({scene,places,onSelect=()=>{}}){
 const ui=getUI(),group=new THREE.Group();group.name='Sourced real-place markers';scene.add(group);
 const cells=new Map(),byId=new Map(),projected=new THREE.Vector3();let labels=true,selected=null,layers=null,visibleIds=null,lastCell='',entries=[],screenEntries=[],signature='',lastCamera=null;
 for(const p of places){if(!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;byId.set(p.id,p);const key=Math.floor(p.x/512)+','+Math.floor(p.z/512);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
 const color=p=>/subway/i.test(p.name)?palette.subway:/mexican/i.test(p.category+' '+tagText(p))?palette.mexican:palette[p.category]||palette.default;
 const eligible=p=>{if(p.id===selected)return true;if(visibleIds)return visibleIds.has(p.id);if(!layers)return true;if(layers.subway&&/subway/i.test(p.name)||layers.mexican&&/mexican/i.test(p.category+' '+tagText(p)))return true;return !Array.isArray(layers.categories)||layers.categories.includes(p.category||'other');};
 function update(position,camera){
  if(!position)return;lastCamera=camera;
  const cell=Math.round(position.x/100)+','+Math.round(position.z/100)+','+selected+','+labels;
  if(cell!==lastCell){lastCell=cell;const nearby=[],cx=Math.floor(position.x/512),cz=Math.floor(position.z/512);if(labels)for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)nearby.push(...(cells.get((cx+x)+','+(cz+z))||[]));const chosen=byId.get(selected);if(chosen&&!nearby.includes(chosen))nearby.push(chosen);entries=nearby.filter(eligible).map(p=>({p,d:Math.hypot(p.x-position.x,p.z-position.z)})).filter(v=>v.d<1100||v.p.id===selected).sort((a,b)=>a.p.id===selected?-1:b.p.id===selected?1:a.d-b.d).slice(0,20).map(v=>v.p);}
  if(ui.mode!=='3d')return;
  camera.updateMatrixWorld();const next=[];
  for(const p of entries){if(!labels&&p.id!==selected)continue;projected.set(p.x,(p.buildingHeight||9)+8,p.z);const distance=camera.position.distanceTo(projected);projected.project(camera);if(projected.z< -1||projected.z>1||Math.abs(projected.x)>1.15||Math.abs(projected.y)>1.15)continue;next.push({p,x:Math.round((projected.x+1)*ui.width/2),y:Math.round((1-projected.y)*ui.height/2),distance});}
  const key=next.map(v=>v.p.id+':'+v.x+':'+v.y).join('|');if(key!==signature){signature=key;screenEntries=next;ui.invalidate();}
 }
 const remove=ui.addView('world-place-labels',ctx=>{
  if(ui.mode!=='3d'||!ui.sceneReady)return;
  const used=[];
  for(const entry of [...screenEntries].sort((a,b)=>a.p.id===selected?-1:b.p.id===selected?1:a.distance-b.distance)){
   const {p,x,y}=entry,w=Math.min(ctx.compact?180:240,ctx.measure(p.name,13)+30),rect={x:x-w/2,y:y-14,w,h:30};
   if(p.id!==selected&&used.some(r=>r.x<rect.x+rect.w&&r.x+r.w>rect.x&&r.y<rect.y+rect.h&&r.y+r.h>rect.y))continue;used.push(rect);
   ctx.rect(rect.x,rect.y,w,30,{color:'#0a1d1bed',radius:7,border:color(p),borderWidth:p.id===selected?2:1});ctx.circle(rect.x+10,y,3,{color:color(p)});ctx.text(p.name,rect.x+20,rect.y+6,{size:13,color:'#f3f4e7',maxWidth:w-28,maxLines:1});
   entry.rect=rect;ctx.hit('world-place-'+p.id,{...rect,y:y-22,h:44},{onTap:()=>onSelect(p)});
  }
 },10);
 function pick(event,camera,canvas){if(!event)return false;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*ui.width/r.width,y=(event.clientY-r.top)*ui.height/r.height;const hit=screenEntries.find(v=>v.rect&&x>=v.rect.x&&x<=v.rect.x+v.rect.w&&y>=v.rect.y&&y<=v.rect.y+v.rect.h);if(hit){onSelect(hit.p);return true;}return false;}
 return {group,update,pick,select(id){selected=id;lastCell='';signature='';ui.invalidate();},setLayers(next){layers=next;visibleIds=Array.isArray(next.visiblePlaceIds)?new Set(next.visiblePlaceIds):null;labels=next.labels!==false;lastCell='';signature='';ui.invalidate();},dispose(){remove();entries=[];screenEntries=[];scene.remove(group);}};
}
