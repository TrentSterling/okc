import {CATEGORIES,CATEGORY_BY_ID,placeColor,navigationUrl,streetViewUrl,safeUrl,priceSummary} from './catalog.js';
import {COLORS,rect,action,createFlow} from './gpu-layout.js';

const interests=[{value:'favorites',label:'Our interests'},{value:'all',label:'All places'},...CATEGORIES.map(c=>({value:c.id,label:c.label}))];
const ratingOptions=[0,1,2,3,4,5].map(n=>({value:String(n),label:n?`${n} / 5`:'Unrated'}));

export function drawDiscovery(ctx,area,state,dispatch){
 const w=area.w,gap=8,half=(w-gap)/2,headerHeight=131+(state.filtersOpen?96:0),rowHeight=104,planIds=new Set(state.plan.stops.map(s=>s.placeId));
 ctx.scroll('ex-place-results',area,headerHeight+Math.max(state.results.length*rowHeight,170),({x,y:top,width,offset})=>{
 let y=top;
 ctx.input('ex-search',rect(x,y,w,44),{value:state.query,placeholder:'Search places, streets or food',type:'search',maxLength:300,onChange:value=>dispatch({type:'filter.patch',patch:{query:value}})});y+=52;
 ctx.select('ex-interest',rect(x,y,w-100,44),{value:state.filter,options:interests,onChange:value=>dispatch({type:'filter.patch',patch:{filter:value}})});
 ctx.button('ex-more-filters',state.filtersOpen?'Less':'Filters',rect(x+w-92,y,92,44),action(dispatch,'view.filters'),{active:state.filtersOpen||state.indoor||state.onlySaved||!!state.chain});y+=52;
 if(state.filtersOpen){
  ctx.select('ex-chain',rect(x,y,w,44),{value:state.chain,options:[{value:'',label:'Any brand'},...state.brands.map(label=>({value:label,label}))],onChange:value=>dispatch({type:'filter.patch',patch:{chain:value}})});y+=48;
  ctx.toggle('ex-indoor','Indoors',rect(x,y,half,44),{value:state.indoor,onChange:value=>dispatch({type:'filter.patch',patch:{indoor:value}})});
  ctx.toggle('ex-saved','Saved',rect(x+half+gap,y,half,44),{value:state.onlySaved,onChange:value=>dispatch({type:'filter.patch',patch:{onlySaved:value}})});y+=48;
 }
 ctx.text(`${state.results.length.toLocaleString()} of ${state.places.length.toLocaleString()} places`,x,y+3,{size:13,color:COLORS.muted,maxWidth:w});y+=27;
 if(!state.results.length){
  const flow=createFlow(ctx,{x,y,width,viewport:area},dispatch);flow.text('No places match these filters.',{color:COLORS.muted});flow.button('ex-reset-filters','Reset filters','filter.reset');return;
 }
  const first=Math.max(0,Math.floor((offset-headerHeight)/rowHeight)-1),last=Math.min(state.results.length,Math.ceil((offset+area.h-headerHeight)/rowHeight)+1);
  for(let i=first;i<last;i++){
   const p=state.results[i],top=y+i*rowHeight,selected=state.selectedId===p.id,inPlan=planIds.has(p.id),favorite=!!state.memories[p.id]?.favorite;
   ctx.rect(x,top,width,rowHeight-7,{color:selected?'#253c4a':COLORS.raised,radius:8,border:selected?COLORS.gold:COLORS.line,borderWidth:1});
   ctx.rect(x+9,top+14,4,60,{color:placeColor(p),radius:2});
   const body=rect(x+17,top+3,width-69,rowHeight-13);
   ctx.hit(`ex-place-open-${p.id}`,body,{onClick:action(dispatch,'place.select',{placeId:p.id}),focusable:true,label:p.name,kind:'button'});
   ctx.clip(rect(body.x+5,top+10,body.w-10,34),()=>ctx.text(p.name,body.x+5,top+10,{size:16,color:COLORS.text,maxWidth:body.w-10}));
   ctx.clip(rect(body.x+5,top+45,body.w-10,18),()=>ctx.text(`${CATEGORY_BY_ID.get(p.primaryLayer)?.label||'Place'} · ${p.district}`,body.x+5,top+45,{size:12,color:COLORS.muted,maxWidth:body.w-10}));
   ctx.clip(rect(body.x+5,top+67,body.w-10,18),()=>ctx.text(p.address||'Mapped place',body.x+5,top+67,{size:12,color:COLORS.faint,maxWidth:body.w-10}));
   ctx.button(`ex-place-add-${p.id}`,inPlan?'−':'+',rect(x+width-48,top+3,44,44),action(dispatch,'place.include',{placeId:p.id}),{active:inPlan});
   ctx.button(`ex-place-fav-${p.id}`,favorite?'★':'☆',rect(x+width-48,top+48,44,44),action(dispatch,'place.favorite',{placeId:p.id}),{active:favorite});
  }
 });
}

export function drawPlace(flow,state,dispatch){
 const p=state.selectedPlace;if(!p)return;const memory=state.memories[p.id]||{},inPlan=state.plan.stops.some(s=>s.placeId===p.id);
 const journal=patch=>dispatch({type:'journal.patch',placeId:p.id,patch});
 flow.button('ex-place-back','‹ All places','view.back');
 flow.text(p.name,{size:22,color:COLORS.text});flow.text(p.address||'Street address not supplied',{size:14,color:COLORS.muted});
 flow.text(`${p.district} · ${p.layers.map(c=>CATEGORY_BY_ID.get(c)?.label||c).join(' · ')}`,{size:13,color:placeColor(p)});
 flow.buttons([{id:'ex-detail-add',label:inPlan?'Remove stop':'Add stop',type:'place.include',payload:{placeId:p.id},options:{active:inPlan}},{id:'ex-detail-nav',label:'Go in 3D',type:'place.navigate',payload:{placeId:p.id},options:{disabled:p.x==null}}]);
 flow.text(p.description||'A real mapped place. Save it, add it to your adventure, and explore the neighborhood.',{color:COLORS.muted});
 flow.buttons([{id:'ex-directions',label:'Directions',type:'link.open',payload:{url:navigationUrl(p)}},{id:'ex-street-view',label:'Street view',type:'link.open',payload:{url:streetViewUrl(p)}}]);
 if(p.website)flow.button('ex-place-site','Official website','link.open',{url:p.website});
 flow.line();flow.title('Good to know');
 const hours=typeof p.hours==='object'?Object.entries(p.hours).map(([k,v])=>`${k}: ${v}`).join('\n'):p.hours;
 flow.label('Source hours');flow.text(hours||'Hours are not in this record. Check the venue before going.',{size:14,color:COLORS.muted});
 if(p.price){flow.label('Source pricing');flow.text(priceSummary(p.price),{size:14,color:COLORS.muted});}
 if(p.ageRestriction||p.age){flow.label('Age policy');flow.text(p.ageRestriction||p.age,{size:14,color:COLORS.muted});}
 if(p.indoor!=null)flow.text(p.indoor?'Indoor destination':'Outdoor or mixed setting',{size:14,color:COLORS.muted});
 flow.label('Map position');flow.text(p.x==null?'Location awaiting coordinates':`${p.coordinateSource==='official'?'Official place coordinates':p.coordinateSource||'Mapped coordinates'}${p.buildingId?` · Building ${p.buildingId}`:''}`,{size:13,color:COLORS.muted});
 flow.line();flow.title('Our discovery journal');
 flow.toggle('ex-detail-favorite','Favorite',memory.favorite,()=>dispatch({type:'place.favorite',placeId:p.id}));
 flow.select('ex-visit','Visit status',memory.status||'',[{value:'',label:'Not saved'},{value:'want',label:'Want to visit'},{value:'visited',label:'Visited'}],value=>journal({status:value}));
 flow.select('ex-trent-rating','Trent’s rating',memory.trentRating||0,ratingOptions,value=>journal({trentRating:value}));
 flow.select('ex-jenn-rating','Jennifer’s rating',memory.jennRating||0,ratingOptions,value=>journal({jennRating:value}));
 flow.input('ex-journal-notes','Dishes, finds and things to remember',memory.notes||'',value=>journal({notes:value}),{multiline:true,maxLength:2000,placeholder:'What should we try here?'});
 flow.input('ex-journal-photo','Photo link',memory.photo||'',value=>journal({photo:value}),{type:'url',maxLength:2000,placeholder:'https://…'});
 if(safeUrl(memory.photo))flow.button('ex-open-photo','Open our photo','link.open',{url:memory.photo});
 flow.line();flow.title('Place and building sources');
 flow.text(`${p.source||p.sourceName||'OpenStreetMap'}${p.verifiedAt?` · Retrieved ${String(p.verifiedAt).slice(0,10)}`:''}. ${p.curated?'Venue details were reviewed against the linked source.':'Imported map records have not each been verified with the venue.'}`,{size:13,color:COLORS.muted});
 p.sourceUrls.forEach((url,i)=>flow.button(`ex-source-${i}`,p.sourceUrls.length===1?'View source':`View source ${i+1}`,'link.open',{url}));
 flow.button('ex-inspect','Inspect linked building','place.inspect',{placeId:p.id},{disabled:!p.buildingId});
 flow.text('Street-level imagery opens at the mapped point. Coverage and imagery dates vary.',{size:13,color:COLORS.muted});
}
