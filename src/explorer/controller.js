import {CATEGORIES,normalizePlace,safeUrl} from './catalog.js';
import {defaultPlan,planTotals,addPlace,moveStop,importPlan,exportPlan,createPreset,surprisePlan,money,matchPlace} from './planner.js';
import {createCatalogQuery,FAVORITE_LAYERS} from './catalog-query.js';
import {loadState,saveState,sanitizeState,sanitizeOverrides} from './persistence.js';
import {planningWarnings} from './planning-warnings.js';

export const DEFAULT_SETTINGS={labels:true,buildings:true,roads:true,water:true,parks:true,music:false,season:'christmas',weather:'clear',quality:'balanced'};
const categoryIds=CATEGORIES.map(c=>c.id),sections=new Set(['discover','planner','layers','learn']);
const amount=value=>Math.max(0,Math.min(100000,Number(value)||0));
const text=(value,max=2000)=>String(value??'').slice(0,max);

// The controller has no DOM or rendering dependency. Existing atlas, planner,
// file formats and scene callbacks remain shared with the GPU presentation.
export function createExplorerController(options={},services={}){
 const map=services.map||{},platform=services.platform||{},saved=services.initialState??loadState(services.storage);
 const listeners=new Set(),queryCatalog=createCatalogQuery();
 let places=[],byId=new Map(),memoryRevision=0,destroyed=false,lastMapUpdate=-Infinity,sequence=0;
 const state={revision:0,tab:'discover',mode:'3d',open:true,selectedId:null,building:null,buildingDraft:null,
  query:'',chain:'',filter:'favorites',indoor:false,onlySaved:false,limit:70,brands:[],mapData:{},
  plan:null,mission:{},memories:saved.memories||{},overrides:saved.overrides||{},settings:{...DEFAULT_SETTINGS,...saved.settings},
  activeCategories:new Set(saved.categories||categoryIds),tourIndex:-1,touring:false,tourFinished:false,message:'',
  position:{x:0,z:0},roadRoute:null,storageError:false,surprise:{indoor:false,hours:4},custom:{name:'',cost:'0'},expanded:false,filtersOpen:false};
 const now=services.now||Date.now;
 const notify=value=>{if(!destroyed)services.notify?.(String(value));};
 const filtered=()=>queryCatalog(places,{query:state.query,chain:state.chain,filter:state.filter,activeCategories:state.activeCategories,onlySaved:state.onlySaved,indoor:state.indoor,memories:state.memories,revision:memoryRevision});
 const getTourStops=()=>state.plan.stops.map((s,itineraryIndex)=>{const p=byId.get(s.placeId);return p&&p.x!=null?{...p,stopId:s.id,cost:s.cost,time:s.time,itineraryIndex}:null;}).filter(Boolean);
 function syncMap(){map.setPlaces?.(filtered());map.setSelected?.(state.selectedId);map.setRoute?.(getTourStops());map.setLayers?.(state.settings);}
 function emitLayers(){options.onLayers?.({...state.settings,categories:[...state.activeCategories],subway:state.activeCategories.has('subway'),mexican:state.activeCategories.has('mexican'),filter:state.filter,visiblePlaceIds:filtered().map(p=>p.id)});}
 function changed({map:refreshMap=false,layers=false}={}){if(destroyed)return;if(refreshMap)syncMap();if(layers)emitLayers();state.revision++;for(const fn of listeners)fn();}
 function persist(){state.storageError=!saveState({plan:state.plan,memories:state.memories,overrides:state.overrides,settings:state.settings,categories:[...state.activeCategories]},services.storage);}
 function invalidateTour(){if(state.tourIndex>=0)options.onTour?.({action:'cancel',stops:getTourStops(),index:0});state.tourIndex=-1;state.touring=false;state.tourFinished=false;state.roadRoute=null;map.setRoadRoute?.(null);}
 function show(tab){if(sections.has(tab)){state.tab=tab;state.building=null;state.buildingDraft=null;if(tab!=='discover')state.selectedId=null;}state.open=true;services.onPanel?.(true);changed();}
 function hide(){state.open=false;services.onPanel?.(false);changed();}
 function setMode(value){
  const next=value==='map'?'map':'3d',previous=state.mode;state.mode=next;services.setMode?.(next);
  if(next==='map')map.show?.();else map.hide?.();
  if(previous!==next)options.onMode?.(next);changed();
 }
 function selectPlace(value){
  const id=String(value),p=byId.get(id);if(!p)return;
  state.selectedId=id;state.building=null;state.buildingDraft=null;state.tab='discover';state.open=true;services.onPanel?.(true);map.setSelected?.(id);
  if(p.x!=null){if(state.mode==='map')map.focus?.(p,.18);options.onFocus?.(p);}changed();
 }
 function setBuilding(value){
  state.building=value;state.selectedId=null;state.tab='discover';state.open=true;services.onPanel?.(true);
  const b={...value,...state.overrides[value?.id]};state.buildingDraft=value?{name:b.name||'',height:String(b.h??b.height??8),color:/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:'#967e69',roof:b.roof||'flat',reference:b.reference||'',notes:b.notes||''}:null;
  changed();
 }
 function togglePlace(id,checked){
  const p=byId.get(String(id));if(!p)return;
  const exists=state.plan.stops.some(s=>s.placeId===p.id),want=checked??!exists;invalidateTour();
  if(want&&!exists){if(state.plan.stops.length>=100){notify('An adventure can have up to 100 stops.');return;}addPlace(state.plan,p);notify(`${p.name} added to your adventure.`);}
  else if(!want)state.plan.stops=state.plan.stops.filter(s=>s.placeId!==p.id);
  persist();changed({map:true});
 }
 function tour(action,index){
  const stops=getTourStops();if(!stops.length){notify('Add a mapped destination to begin a tour.');return;}
  let idx=index??state.tourIndex;if(action==='start'||action==='resume')idx=idx<0?stops[0].itineraryIndex:idx;
  if(action==='next')idx=stops.find(s=>s.itineraryIndex>state.tourIndex)?.itineraryIndex??stops.at(-1).itineraryIndex;
  if(action==='previous')idx=[...stops].reverse().find(s=>s.itineraryIndex<state.tourIndex)?.itineraryIndex??stops[0].itineraryIndex;
  const mappedIndex=Math.max(0,stops.findIndex(s=>s.itineraryIndex===idx)),current=stops[mappedIndex];
  state.tourIndex=current.itineraryIndex;state.touring=action!=='pause';state.tourFinished=false;
  options.onTour?.({stops,index:mappedIndex,itineraryIndex:current.itineraryIndex,action});
  state.selectedId=current.id;map.setSelected?.(current.id);if(state.mode==='map')map.focus?.(current,.22);changed();
 }
 function applySettings(patch){
  const valid=sanitizeState({settings:patch}).settings;state.settings={...state.settings,...valid};
  for(const [key,fn] of [['season','onSeason'],['weather','onWeather'],['quality','onQuality'],['music','onMusic']])if(Object.hasOwn(valid,key))options[fn]?.(valid[key]);
  persist();changed({map:true,layers:true});
 }
 function exportJSON(value,name){platform.download?.(name,JSON.stringify(value,null,2),'application/json');}
 async function importPayload(kind,payload){
  if(kind==='plan'){
   const plan=importPlan(payload,places);invalidateTour();state.plan=plan;state.message='Itinerary imported. Review its planning allowances.';persist();changed({map:true});notify('Your adventure is ready.');return;
  }
  let imported;
  if(kind==='buildings'){
   if(!payload?.overrides||typeof payload.overrides!=='object'||Array.isArray(payload.overrides))throw Error('Choose a building corrections export.');
   imported=sanitizeOverrides(payload.overrides);state.overrides={...state.overrides,...imported};
  }else{
   if(payload?.kind!=='prairie-prism-discovery')throw Error('Choose an OKC discovery backup.');
   const restored=sanitizeState(payload),plan=importPlan(restored.plan,places);invalidateTour();state.plan=plan;
   state.memories={...state.memories,...restored.memories};state.overrides={...state.overrides,...restored.overrides};memoryRevision++;
   state.activeCategories=new Set(restored.categories);applySettings(restored.settings);imported=restored.overrides;
  }
  persist();changed({map:true,layers:true});
  let failed=0;for(const correction of Object.values(imported)){try{await options.onBuildingOverride?.(correction);}catch{failed++;}}
  if(state.building)setBuilding(state.building);
  notify(failed?`Saved locally; ${failed} building previews could not update.`:kind==='buildings'?`${Object.keys(imported).length} building corrections restored.`:'Itinerary, journal, settings and building corrections restored.');
 }
 function pickFile(kind){
  return platform.pickJSON?.(async payload=>{try{await importPayload(kind,payload);}catch(error){notify(error.message||'Could not restore this file.');}},{maxBytes:kind==='plan'?250000:2000000});
 }
 async function copyPlan(){
  const total=planTotals(state.plan),p=state.plan;
  const value=`${p.name}\nBudget: ${money(p.budget)}\n${p.stops.map((s,i)=>`${i+1}. ${s.time?s.time+' · ':''}${s.name} — ${money(s.cost)}${s.address?' · '+s.address:''}`).join('\n')}\nReserve: ${money(p.reserve)}\nTotal: ${money(total.total)}\nPlanning allowances for two. Taxes, tips and extras are not automatic. Check venue hours before going.`;
  try{if(!platform.copyText)throw Error('Clipboard unavailable');const copied=await platform.copyText(value);if(copied===false)return;notify('Your adventure is on the clipboard.');}
  catch{exportJSON(exportPlan(p,places),'okc-adventure.json');notify('Clipboard unavailable; downloaded your itinerary.');}
 }
 async function saveBuilding(){
  if(!state.building)return;const draft=state.buildingDraft,id=state.building.id;
  const correction=sanitizeOverrides({[id]:{...draft,id,h:Number(draft.height)||8,updatedAt:new Date(now()).toISOString()}})[id];
  state.overrides={...state.overrides,[id]:correction};persist();changed();
  try{await options.onBuildingOverride?.(correction);notify('Building correction saved on this device.');}
  catch(error){notify('Correction saved locally. '+(error.message||'The 3D preview could not update.'));}
 }
 function setData(next={}){
  if(next.places){const list=Array.isArray(next.places)?next.places:next.places.pois||[];places=list.map(normalizePlace);byId=new Map(places.map(p=>[p.id,p]));state.brands=[...new Set(places.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
  if(next.mapData){state.mapData=next.mapData;map.setData?.(next.mapData);}
  if(!state.plan){try{state.plan=saved.plan?importPlan(saved.plan,places):defaultPlan(places);}catch{state.plan=defaultPlan(places);}}
  else state.plan.stops=state.plan.stops.map(s=>{if(s.placeId&&byId.has(s.placeId))return s;const exact=matchPlace(s.name,places,s.address||'');return exact?{...s,placeId:exact.id}:s;});
  changed({map:true,layers:true});
 }
 function getSnapshot(){return {...state,places,byId,results:filtered(),selectedPlace:byId.get(state.selectedId)||null,totals:planTotals(state.plan),warnings:planningWarnings(state.plan),mappedStops:getTourStops(),stats:map.stats||{roads:state.mapData.roads?.length||0,places:places.length}};}
 async function dispatch(action){
  if(destroyed)return;try{
   const {type}=action;
   switch(type){
    case 'view.show':show(action.tab);return;
    case 'view.hide':hide();return;
    case 'view.toggle':state.open?hide():show();return;
    case 'view.expand':state.expanded=!state.expanded;changed();return;
    case 'view.filters':state.filtersOpen=!state.filtersOpen;changed();return;
    case 'view.setMode':setMode(action.mode);return;
    case 'view.back':state.selectedId=null;state.building=null;state.buildingDraft=null;changed();return;
    case 'view.escape':if(state.building||state.selectedId&&state.tab==='discover'){state.selectedId=null;state.building=null;state.buildingDraft=null;changed();}else if(state.open)hide();else if(state.mode==='map')setMode('3d');return;
    case 'filter.patch':{
     const p=action.patch||{};for(const key of ['query','chain','filter'])if(Object.hasOwn(p,key))state[key]=text(p[key],300);
     for(const key of ['indoor','onlySaved'])if(Object.hasOwn(p,key))state[key]=!!p[key];
     if(p.chain){state.filter='all';state.activeCategories=new Set(categoryIds);}state.selectedId=null;state.limit=70;changed({map:true,layers:true});return;
    }
    case 'filter.reset':Object.assign(state,{query:'',chain:'',filter:'all',onlySaved:false,indoor:false,activeCategories:new Set(categoryIds)});changed({map:true,layers:true});return;
    case 'place.select':selectPlace(action.placeId);return;
    case 'place.include':togglePlace(action.placeId,action.value);return;
    case 'place.favorite':{const id=String(action.placeId);state.memories={...state.memories,[id]:{...state.memories[id],favorite:!state.memories[id]?.favorite}};memoryRevision++;persist();changed({map:true,layers:true});return;}
    case 'place.navigate':{const p=byId.get(String(action.placeId));if(!p||p.x==null)return;invalidateTour();setMode('3d');await options.onNavigate?.(p);notify(`Exploring ${p.name}.`);return;}
    case 'place.inspect':{const p=byId.get(String(action.placeId));if(p)await options.onInspect?.(p);return;}
    case 'journal.patch':{
     const id=String(action.placeId||state.selectedId),patch=action.patch||{},old=state.memories[id]||{};
     const memory={...old};for(const key of ['notes','photo'])if(Object.hasOwn(patch,key))memory[key]=text(patch[key],2000);
     if(Object.hasOwn(patch,'status'))memory.status=['want','visited'].includes(patch.status)?patch.status:'';
     if(Object.hasOwn(patch,'favorite'))memory.favorite=!!patch.favorite;
     for(const key of ['trentRating','jennRating'])if(Object.hasOwn(patch,key))memory[key]=Math.max(0,Math.min(5,Math.round(Number(patch[key])||0)));
     state.memories={...state.memories,[id]:memory};
     const affectsResults=Object.hasOwn(patch,'favorite')||Object.hasOwn(patch,'status');if(affectsResults)memoryRevision++;persist();changed({map:affectsResults,layers:affectsResults});return;
    }
    case 'plan.patch':{const p=action.patch||{};for(const key of ['budget','reserve'])if(Object.hasOwn(p,key))state.plan[key]=amount(p[key]);if(Object.hasOwn(p,'name'))state.plan.name=text(p.name,100);if(Object.hasOwn(p,'date'))state.plan.date=text(p.date,10);persist();changed();return;}
    case 'plan.preset':invalidateTour();state.plan=createPreset(action.preset,places,state.plan.budget);state.message='';persist();changed({map:true});return;
    case 'plan.stop.patch':{const stop=state.plan.stops.find(s=>s.id===action.stopId);if(!stop)return;if(Object.hasOwn(action.patch||{},'cost'))stop.cost=amount(action.patch.cost);if(Object.hasOwn(action.patch||{},'time')){stop.time=text(action.patch.time,5);if(action.commit&&stop.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time)){const m=stop.time.match(/^([0-9]):([0-5][0-9])$/);if(m)stop.time='0'+stop.time;else{stop.time='';notify('Use a 24-hour time, such as 09:30 or 17:45.');}}}persist();changed({map:true});return;}
    case 'plan.stop.open':{const stop=state.plan.stops.find(s=>s.id===action.stopId);if(stop?.placeId)selectPlace(stop.placeId);else notify('This is a budget allowance, not a mapped destination.');return;}
    case 'plan.stop.remove':invalidateTour();state.plan.stops=state.plan.stops.filter(s=>s.id!==action.stopId);persist();changed({map:true});return;
    case 'plan.stop.move':invalidateTour();moveStop(state.plan,state.plan.stops.findIndex(s=>s.id===action.stopId),action.direction);persist();changed({map:true});return;
    case 'plan.custom.patch':state.custom={...state.custom,...action.patch};changed();return;
    case 'plan.custom.add':{const name=text(state.custom.name,160).trim();if(!name)return;if(state.plan.stops.length>=100){notify('An adventure can have up to 100 stops.');return;}invalidateTour();state.plan.stops.push({id:`custom-${now()}-${sequence++}`,placeId:null,name,cost:amount(state.custom.cost),time:'',note:'Custom planning allowance',priceKind:'allowance'});state.custom={name:'',cost:'0'};persist();changed({map:true});return;}
    case 'plan.surprise.patch':state.surprise={...state.surprise,...action.patch};changed();return;
    case 'plan.surprise':invalidateTour();state.plan=surprisePlan(places,{budget:state.plan.budget,...state.surprise,categories:[...state.activeCategories],seed:now(),visited:new Set(Object.entries(state.memories).filter(([,m])=>m.status==='visited').map(([id])=>id)),position:options.getPosition?.()||state.position});state.message='';persist();changed({map:true});notify(state.plan.stops.length?'A new adventure is ready. Adjust it however you like.':'No stops fit these preferences and budget. Try more interests or a larger budget.');return;
    case 'tour.command':tour(action.command,action.index);return;
    case 'challenge.command':await options.onMode?.(action.command);return;
    case 'layers.set':state.activeCategories=new Set(action.ids.filter(id=>categoryIds.includes(id)));persist();changed({map:true,layers:true});return;
    case 'layers.preset':state.activeCategories=new Set(action.preset==='all'?categoryIds:action.preset==='favorites'?FAVORITE_LAYERS:[]);persist();changed({map:true,layers:true});return;
    case 'settings.patch':applySettings(action.patch);return;
    case 'district.select':{const district=state.mapData.districts?.[Number(action.index)];if(district){map.focus?.(district,.08);await options.onNavigate?.({...district,id:`district-${action.index}`,district:district.name});}return;}
    case 'map.command':if(action.command==='zoomIn')map.zoom?.(1.5);else if(action.command==='zoomOut')map.zoom?.(1/1.5);else if(action.command==='fit')map.fit?.();else if(action.command==='locate')map.focus?.(options.getPosition?.()||state.position);return;
    case 'building.patch':if(state.buildingDraft){state.buildingDraft={...state.buildingDraft,...action.patch};changed();}return;
    case 'building.save':await saveBuilding();return;
    case 'file.export':if(action.kind==='buildings')exportJSON({version:1,overrides:state.overrides},'okc-building-corrections.json');else if(action.kind==='backup')exportJSON({version:1,kind:'prairie-prism-discovery',plan:exportPlan(state.plan,places),memories:state.memories,overrides:state.overrides,settings:state.settings,categories:[...state.activeCategories]},'okc-discovery-backup.json');else exportJSON(exportPlan(state.plan,places),'okc-adventure.json');return;
    case 'file.import':await pickFile(action.kind);return;
    case 'file.copy':await copyPlan();return;
    case 'link.open':{const url=safeUrl(action.url);if(url)platform.openURL?.(url);return;}
   }
  }catch(error){notify(error.message||'That action could not finish.');}
 }
 function update(next){state.position=next||options.getPosition?.()||state.position;const time=now();if(time-lastMapUpdate>=300){lastMapUpdate=time;map.setPosition?.(state.position);changed();}}
 function setRoadRoute(route){state.roadRoute=route;map.setRoadRoute?.(route);changed();}
 function setTourState(value={}){if(value.index!=null)state.tourIndex=getTourStops()[value.index]?.itineraryIndex??value.index;if(value.playing!=null)state.touring=!!value.playing;if(value.finished!=null)state.tourFinished=!!value.finished;changed();}
 setData({places:options.places||[],mapData:options.mapData||{}});if(options.mapOnly)setMode('map');
 return {getSnapshot,dispatch,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},show,hide,setMode,setData,selectPlace,setBuilding,update,notify,setRoadRoute,
  setMapBuildings:value=>map.setBuildings?.(value),getMapView:()=>map.getView?.(),showMap:()=>setMode('map'),setMapVisible:value=>setMode(value?'map':'3d'),
  setMission(value){state.mission=value||{};changed();},setTourStep(index){setTourState({index});},setTourState,
  get overrides(){return {...state.overrides};},get settings(){return {...state.settings};},get plan(){return exportPlan(state.plan,places);},get visiblePlaces(){return filtered();},get selectedPlace(){return byId.get(state.selectedId)||null;},
  importPayload,destroy(){destroyed=true;listeners.clear();map.destroy?.();}
 };
}
