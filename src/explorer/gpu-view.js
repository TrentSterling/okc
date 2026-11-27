import {money} from './planner.js';
import {COLORS,rect,action,createFlow,panelLayout} from './gpu-layout.js';
import {drawDiscovery,drawPlace} from './gpu-discover.js';
import {drawPlanner} from './gpu-planner.js';
import {drawLayers,drawLearning,drawBuilding} from './gpu-panels.js';

const tabs=[['discover','Explore'],['planner','Plan'],['layers','Layers'],['learn','Learn']];

export function createExplorerView(ui,controller,map){
 let previousInsets='',initialMapFit=false;
 function draw(ctx){
  const state=controller.getSnapshot(),dispatch=controller.dispatch,layout=panelLayout(ctx,state),bar=layout.toolbar;
  const insetKey=JSON.stringify(layout.mapInsets);if(previousInsets!==insetKey){previousInsets=insetKey;map.setInsets?.(layout.mapInsets);}
  if(state.mode==='map'&&!initialMapFit){initialMapFit=true;if(map.getScale?.()===.025)map.fit?.();}
  const launchWidth=Math.min(102,Math.max(82,bar.w-142)),modeWidth=Math.min(62,(bar.w-launchWidth-12)/2);
  ctx.button('ex-launch',state.open?'Close':'Explore',rect(bar.x,bar.y,launchWidth,44),action(dispatch,'view.toggle'),{active:state.open});
  ctx.button('ex-mode-map','Map',rect(bar.x+launchWidth+6,bar.y,modeWidth,44),action(dispatch,'view.setMode',{mode:'map'}),{active:state.mode==='map'});
  ctx.button('ex-mode-3d','3D',rect(bar.x+launchWidth+12+modeWidth,bar.y,modeWidth,44),action(dispatch,'view.setMode',{mode:'3d'}),{active:state.mode==='3d',disabled:ui.sceneReady===false});
  if(state.mode==='map'){
   const right=ctx.width-(ctx.insets?.right||0)-56,top=(ctx.insets?.top||0)+68;
   for(const [i,label,command] of [[0,'+','zoomIn'],[1,'−','zoomOut'],[2,'Fit','fit'],[3,'Car','locate']])ctx.button(`ex-map-${command}`,label,layout.compact&&!layout.short?rect(bar.x+i*48,top,44,44):rect(right,top+i*48,44,44),action(dispatch,'map.command',{command}));
  }
  if(!state.open){
   const route=state.roadRoute,position=state.position,dirs=['E','SE','S','SW','W','NW','N','NE'];
   const label=state.mode==='map'?(route?.points?.length>1?`Road route${Number.isFinite(route.distance)?' · '+(route.distance/1000).toFixed(1)+' km':''}`:'Itinerary · straight-line preview'):`${Number.isFinite(position.heading)?dirs[((Math.round(position.heading/(Math.PI/4))%8)+8)%8]+' · ':''}${position.street||'Oklahoma City'}${position.district?' · '+position.district:''}`;
   const y=(ctx.insets?.top||0)+(state.mode==='map'&&layout.compact&&!layout.short?122:65);
   ctx.text(label,bar.x,y,{size:13,color:COLORS.muted,maxWidth:ctx.width-bar.x-74});return;
  }
  const p=layout.panel;ctx.block?.('ex-panel-block',p);ctx.rect(p.x,p.y,p.w,p.h,{color:COLORS.panel,radius:12,border:COLORS.line,borderWidth:1});
  const condensed=p.h<340||layout.short;
  const headerY=p.y+7,closeX=p.x+p.w-51;
  if(!condensed){
   ctx.text(state.building?'Building':state.selectedPlace&&state.tab==='discover'?'Place details':`OKC · ${state.places.length.toLocaleString()} places`,p.x+14,headerY+12,{size:16,color:COLORS.text,maxWidth:p.w-110});
   if(layout.compact&&!layout.short)ctx.button('ex-expand',state.expanded?'↓':'↑',rect(closeX-48,headerY,44,44),action(dispatch,'view.expand'));
   ctx.button('ex-close','×',rect(closeX,headerY,44,44),action(dispatch,'view.hide'));
  }
  const tabY=p.y+(condensed?8:58),tabWidth=(p.w-16)/4;
  for(let i=0;i<tabs.length;i++){const [tab,label]=tabs[i];ctx.button(`ex-tab-${tab}`,label,rect(p.x+8+i*tabWidth,tabY,tabWidth-2,44),action(dispatch,'view.show',{tab}),{active:state.tab===tab});}
  const footerHeight=p.h<240?0:state.storageError?68:53,area=rect(p.x+12,tabY+52,p.w-24,Math.max(24,p.y+p.h-tabY-52-footerHeight-8));
  ctx.clip(area,()=>{
   if(state.tab==='discover'&&!state.selectedPlace&&!state.building){drawDiscovery(ctx,area,state,dispatch);return;}
   const key=state.building?`building-${state.building.id}`:state.tab==='discover'?`place-${state.selectedId}`:state.tab;
   const page=state.building?drawBuilding:state.tab==='discover'?drawPlace:state.tab==='planner'?drawPlanner:state.tab==='layers'?drawLayers:drawLearning;
   const measure=createFlow(ctx,{x:0,y:0,width:area.w,measureOnly:true},dispatch);page(measure,state,dispatch);const height=measure.y+12;
   ctx.scroll(`ex-page-${key}`,area,height,point=>{
    const flow=createFlow(ctx,{x:point.x,y:point.y,width:point.width,viewport:area},dispatch);
    page(flow,state,dispatch);
   });
  });
  if(!footerHeight)return;const footerY=p.y+p.h-footerHeight;ctx.rect(p.x+8,footerY,p.w-16,1,{color:COLORS.line});
  ctx.text(`${state.plan.stops.length} stops · ${money(state.totals.total)} planned`,p.x+14,footerY+9,{size:13,color:state.totals.remaining<0?COLORS.danger:COLORS.gold,maxWidth:p.w-28});
  const route=state.roadRoute,routeLabel=route?.points?.length>1?`Road route${Number.isFinite(route.distance)?' · '+(route.distance/1000).toFixed(1)+' km':''}`:'Itinerary · straight-line preview';
  ctx.text(state.mode==='map'?routeLabel:state.position.street||state.position.district||'Explore Oklahoma City',p.x+14,footerY+28,{size:12,color:COLORS.muted,maxWidth:p.w-28,maxLines:1});
  if(state.storageError)ctx.text('Storage unavailable — export a backup.',p.x+14,footerY+47,{size:12,color:COLORS.warning,maxWidth:p.w-28});
 }
 const disposeView=ui.addView('explorer',draw,40),unsubscribe=controller.subscribe(()=>ui.invalidate());
 return {draw,destroy(){disposeView?.();unsubscribe();}};
}
