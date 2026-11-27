import assert from 'node:assert/strict';
import test from 'node:test';
import {createExplorerController} from './controller.js';
import {createExplorerView} from './gpu-view.js';
import {panelLayout} from './gpu-layout.js';

const place={id:'p',name:'A real cafe',category:'cafe',address:'100 Reno Avenue',x:0,z:0,buildingId:'b',hours:'09:00–17:00',price:{kind:'allowance',amount:30,basis:'two people'},website:'https://example.com',sourceUrls:['https://example.com/source'],curated:true};
const initialState={plan:{name:'Test plan',budget:200,reserve:13,date:'2026-12-12',planningNote:'Saved 2026 schedule, check current venue hours.',stops:[{id:'stop-p',placeId:'p',name:place.name,cost:30,time:'09:30',address:place.address,note:'Planning allowance'}]}};
const intersects=(a,b)=>!b||a.x+a.w>b.x&&a.x<b.x+b.w&&a.y+a.h>b.y&&a.y<b.y+b.h;
function mockContext(width=390,height=844,offset=0){
 const targets=[],texts=[],scrolls=[];let clip=null;
 const register=(id,r,label,handler,kind='button')=>{if(intersects(r,clip))targets.push({id,r,label,handler,kind,clip});};
 const ctx={width,height,insets:{top:0,right:0,bottom:0,left:0},compact:width<=720||height<500,landscape:width>height,targets,texts,scrolls,
  text(value,x,y,options){if(intersects({x,y,w:options.maxWidth||100,h:options.size||16},clip))texts.push(String(value));},rect(){},
  button(id,label,r,handler){register(id,r,label,handler);},toggle(id,label,r,options){register(id,r,label,options.onChange,'toggle');},
  input(id,r,options){register(id,r,options.label||options.placeholder,options.onChange,'input');},select(id,r,options){register(id,r,options.options,options.onChange,'select');},
  hit(id,r,options){register(id,r,options.label,options.onClick||options.onTap);},block(){},
  clip(r,fn){const old=clip;clip=old?{x:Math.max(old.x,r.x),y:Math.max(old.y,r.y),w:Math.max(0,Math.min(old.x+old.w,r.x+r.w)-Math.max(old.x,r.x)),h:Math.max(0,Math.min(old.y+old.h,r.y+r.h)-Math.max(old.y,r.y))}:r;try{fn();}finally{clip=old;}},
  scroll(id,r,contentHeight,fn){scrolls.push({id,r,contentHeight});const value=Math.min(offset,Math.max(0,contentHeight-r.h));ctx.clip(r,()=>fn({x:r.x,y:r.y-value,width:r.w,offset:value}));},
 };
 return ctx;
}
function fixture(count=1){
 const places=Array.from({length:count},(_,i)=>({...place,id:i?'p'+i:'p',name:i?`Cafe ${String(i).padStart(5,'0')}`:place.name}));
 const controller=createExplorerController({places},{initialState:structuredClone(initialState),storage:{getItem:()=>null,setItem(){}},map:{},platform:{}});
 const ui={sceneReady:true,addView:()=>()=>{},invalidate(){}};
 return {controller,view:createExplorerView(ui,controller,{setInsets(){}})};
}
function collectPage(view,width=390,height=844){
 const all=new Map();all.texts=[];let total=1;
 for(let offset=0;offset<=total;offset+=100){const ctx=mockContext(width,height,offset);view.draw(ctx);for(const t of ctx.targets)all.set(t.id,t);all.texts.push(...ctx.texts);total=Math.max(total,...ctx.scrolls.map(s=>s.contentHeight));}
 return all;
}

test('GPU explorer virtualizes a large catalog at phone width',async()=>{
 const {controller,view}=fixture(8000);await controller.dispatch({type:'filter.patch',patch:{filter:'all'}});
 const ctx=mockContext();view.draw(ctx);
 const placeTargets=ctx.targets.filter(t=>t.id.startsWith('ex-place-open-'));
 assert.ok(placeTargets.length>0&&placeTargets.length<12,`Only visible rows should create hit targets; got ${placeTargets.length}.`);
 assert.ok(ctx.scrolls[0].contentHeight>800000);assert.ok(ctx.targets.every(t=>t.r.w>=44&&t.r.h>=44),'Touch controls have at least 44×44 CSS px before clipping.');
 assert.ok(ctx.targets.find(t=>t.id==='ex-search'));assert.ok(ctx.targets.find(t=>t.id==='ex-interest'));
});

test('every planner operation remains reachable through a scrollable GPU page',()=>{
 const {controller,view}=fixture();controller.show('planner');const targets=collectPage(view);
 for(const id of ['ex-plan-name','ex-plan-budget','ex-plan-reserve','ex-plan-date','ex-plan-preset','ex-stop-time-stop-p','ex-stop-cost-stop-p','ex-stop-open-stop-p','ex-stop-remove-stop-p','ex-stop-up-stop-p','ex-stop-down-stop-p','ex-custom-name','ex-custom-cost','ex-custom-add','ex-tour-play','ex-tour-prev','ex-tour-next','ex-surprise-indoor','ex-surprise-hours','ex-surprise','ex-plan-export','ex-plan-import','ex-plan-copy'])assert.ok(targets.has(id),id+' must remain reachable.');
 assert.ok(targets.get('ex-plan-preset').label.some(o=>o.value==='christmas'),'The Christmas preset remains an actual selectable option.');
});

test('details, journal, sources, layers, learning and building corrections remain reachable',()=>{
 const {controller,view}=fixture();controller.selectPlace('p');let targets=collectPage(view);
 for(const id of ['ex-detail-add','ex-detail-nav','ex-directions','ex-street-view','ex-place-site','ex-detail-favorite','ex-visit','ex-trent-rating','ex-jenn-rating','ex-journal-notes','ex-journal-photo','ex-source-0','ex-inspect'])assert.ok(targets.has(id),id);
 controller.show('layers');targets=collectPage(view);
 for(const id of ['ex-district','ex-layers-all','ex-layers-none','ex-layers-favorites','ex-layer-subway','ex-layer-mexican','ex-setting-buildings','ex-setting-water','ex-season','ex-weather','ex-quality','ex-backup-export','ex-backup-import','ex-source-manifest'])assert.ok(targets.has(id),id);
 assert.equal(targets.has('ex-music'),false,'Unavailable music must not present a working toggle.');assert.match(targets.texts.join(' '),/Winter music is not available in this build\./);
 controller.show('learn');controller.setMission({title:'Test mission',target:{name:'A cafe'},distance:20});targets=collectPage(view);
 for(const id of ['ex-play-delivery','ex-play-taxi','ex-play-quiz','ex-play-photographer','ex-challenge-resume','ex-challenge-cancel'])assert.ok(targets.has(id),id);
 controller.setBuilding({id:'b',h:12});targets=collectPage(view);
 for(const id of ['ex-building-name','ex-building-height','ex-building-color','ex-building-roof','ex-building-reference','ex-building-notes','ex-building-save','ex-building-export','ex-building-import'])assert.ok(targets.has(id),id);
});

test('portrait, short landscape and keyboard-height layouts stay within the viewport',()=>{
 for(const [width,height,mode,insets] of [[320,568,'3d',{}],[390,844,'3d',{top:47,bottom:34}],[844,390,'3d',{left:47,right:47,bottom:21}],[390,440,'map',{top:47}],[390,440,'3d',{top:47}],[1024,768,'map',{}]]){
  const ctx={width,height,compact:width<=720||height<500,landscape:width>height,insets},state={open:true,mode,expanded:false},layout=panelLayout(ctx,state),p=layout.panel;
  assert.ok(p.x>=0&&p.y>=0&&p.x+p.w<=width&&p.y+p.h<=height,JSON.stringify({width,height,mode,p}));
  const {controller,view}=fixture();controller.setMode(mode);const drawCtx=mockContext(width,height);drawCtx.insets=insets;view.draw(drawCtx);
  for(const scroll of drawCtx.scrolls)assert.ok(scroll.r.y+scroll.r.h<=p.y+p.h+1,'Scrollable content stays inside the panel.');
 }
});
