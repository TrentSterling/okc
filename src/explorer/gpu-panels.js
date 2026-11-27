import {CATEGORIES} from './catalog.js';
import {COLORS} from './gpu-layout.js';

const choices=values=>values.map(([value,label])=>({value,label}));

export function drawLayers(flow,state,dispatch){
 const settings=patch=>dispatch({type:'settings.patch',patch});
 flow.title('Map and city');
 flow.select('ex-district','Jump to a district','',[{value:'',label:'Choose a neighborhood…'},...(state.mapData.districts||[]).map((d,i)=>({value:String(i),label:d.name}))],index=>{if(index!=='')dispatch({type:'district.select',index});});
 flow.label('Places to highlight');
 flow.buttons([{id:'ex-layers-all',label:'All',type:'layers.preset',payload:{preset:'all'}},{id:'ex-layers-none',label:'None',type:'layers.preset',payload:{preset:'none'}},{id:'ex-layers-favorites',label:'Interests',type:'layers.preset',payload:{preset:'favorites'}}]);
 for(const category of CATEGORIES)flow.toggle(`ex-layer-${category.id}`,category.label,state.activeCategories.has(category.id),value=>{const ids=new Set(state.activeCategories);value?ids.add(category.id):ids.delete(category.id);dispatch({type:'layers.set',ids:[...ids]});});
 flow.line();flow.title('Geography');
 for(const [id,label] of [['labels','Business and street labels'],['buildings','Building footprints'],['roads','Roads and intersections'],['water','Lakes and waterways'],['parks','Parks and green space']])flow.toggle(`ex-setting-${id}`,label,state.settings[id],value=>settings({[id]:value}));
 flow.line();flow.title('Set the scene');
 flow.toggle('ex-music','Winter music',state.settings.music,value=>settings({music:value}));
 flow.select('ex-season','Season',state.settings.season,choices([['christmas','Christmas'],['normal','Everyday OKC']]),value=>settings({season:value}));
 flow.select('ex-weather','Weather',state.settings.weather,choices([['clear','Clear winter evening'],['snow','Snow flurries'],['fog','Winter mist'],['wet','After the rain']]),value=>settings({weather:value}));
 flow.select('ex-quality','Rendering quality',state.settings.quality,choices([['high','High detail'],['balanced','Balanced'],['low','Low detail']]),value=>settings({quality:value}));
 const memories=Object.values(state.memories),visited=memories.filter(v=>v.status==='visited').length,want=memories.filter(v=>v.status==='want').length;
 flow.line();flow.title('Your discoveries');flow.text(`${visited} visited · ${want} want to visit`,{color:COLORS.accent});
 flow.buttons([{id:'ex-backup-export',label:'Back up',type:'file.export',payload:{kind:'backup'}},{id:'ex-backup-import',label:'Restore',type:'file.import',payload:{kind:'backup'}}]);
 flow.text('Your journal, itinerary, preferences and building corrections stay on this device. Export a backup to move them to another browser.',{size:13,color:COLORS.muted});
 flow.line();flow.title('Coverage and sources');
 flow.text(`${(state.stats.roads||0).toLocaleString()} road sections · ${state.places.length.toLocaleString()} places`,{size:14,color:COLORS.muted});
 flow.text('Real mapped footprints and roads provide the geography. Unverified heights, roofs and facade details remain estimates. Select a linked building to save a correction.',{size:13,color:COLORS.muted});
 flow.button('ex-source-manifest','Coverage and source information','link.open',{url:new URL('../geo/metro/manifest.json',import.meta.url).href});
}

export function drawLearning(flow,state,dispatch){
 const m=state.mission;
 flow.title('Learn the streets');
 flow.text('Use real places as destinations. Each challenge gives you a reason to explore another neighborhood.',{color:COLORS.muted});
 if(m.title){
  flow.line();flow.text('Current challenge',{size:13,color:COLORS.accent});flow.title(m.title);
  if(m.description)flow.text(m.description,{color:COLORS.muted});
  if(m.target)flow.text(typeof m.target==='object'?m.target.name:m.target,{color:COLORS.gold});
  if(Number.isFinite(m.distance))flow.text(`${m.distance>=1000?(m.distance/1000).toFixed(1)+' km':Math.round(m.distance)+' m'} from target`,{size:14,color:COLORS.muted});
  flow.buttons([{id:'ex-challenge-resume',label:'Continue',type:'challenge.command',payload:{command:'resume'}},{id:'ex-challenge-cancel',label:'End challenge',type:'challenge.command',payload:{command:'cancel'}}]);
 }
 flow.line();
 for(const [id,label,description] of [
  ['delivery','Pizza driver','Find real addresses and learn the streets between them.'],
  ['taxi','City taxi','Connect two mapped places and discover a different part of town.'],
  ['quiz','Know your city','Find the named place using the map and your memory.'],
  ['photographer','Golden-hour scout','Explore a landmark, frame a view, and save a photograph.'],
 ]){flow.button(`ex-play-${id}`,label,'challenge.command',{command:id});flow.text(description,{size:14,color:COLORS.muted});flow.gap(6);}
 flow.line();flow.text('Prototype challenges use real geography with simulated driving. Road rules, access points and venue details may be incomplete. Use live navigation for real trips.',{size:13,color:COLORS.muted});
}

export function drawBuilding(flow,state,dispatch){
 const b={...state.building,...state.overrides[state.building?.id]},draft=state.buildingDraft;if(!draft)return;
 const patch=value=>dispatch({type:'building.patch',patch:value});
 flow.button('ex-building-back','‹ All places','view.back');flow.title('Building inspector');
 flow.text(b.name||'Mapped building',{size:18});flow.text(`${b.id} · ${b.heightSource||'Height is an estimate'}`,{size:13,color:COLORS.muted});
 if(b.roofSource)flow.text(`Roof: ${b.roofSource}`,{size:13,color:COLORS.muted});
 flow.text('Corrections are stored on this device. The original source footprint remains attached to this building.',{size:14,color:COLORS.muted});
 flow.input('ex-building-name','Building label',draft.name,value=>patch({name:value}),{maxLength:100});
 flow.input('ex-building-height','Height (meters, 2–500)',draft.height,value=>patch({height:value}),{type:'number'});
 flow.input('ex-building-color','Facade color (#RRGGBB)',draft.color,value=>patch({color:value}),{type:'text',maxLength:7});
 flow.select('ex-building-roof','Roof',draft.roof,choices([['flat','Flat'],['pitched','Pitched'],['gabled','Gabled']]),value=>patch({roof:value}));
 flow.input('ex-building-reference','Reference link',draft.reference,value=>patch({reference:value}),{type:'url',maxLength:2000,placeholder:'Photo, plan or official source URL'});
 flow.input('ex-building-notes','Inspection notes',draft.notes,value=>patch({notes:value}),{multiline:true,maxLength:2000});
 flow.button('ex-building-save','Save building correction','building.save');
 flow.buttons([{id:'ex-building-export',label:'Export',type:'file.export',payload:{kind:'buildings'}},{id:'ex-building-import',label:'Import',type:'file.import',payload:{kind:'buildings'}}]);
}
