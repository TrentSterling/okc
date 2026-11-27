import {CATEGORIES,normalizePlace,escapeHTML as e,safeUrl} from './catalog.js';
import {defaultPlan,planTotals,addPlace,moveStop,importPlan,exportPlan,createPreset,surprisePlan,loadState,saveState,money,matchPlace} from './planner.js';
import {createMap} from './map.js';
import {icons,discoverView,detailView,plannerView,layersView,buildingView,learningView} from './views.js';

const FAVORITES=['arcades','bars','bowling','mexican','asian','subway','bargains','thrift','markets','dessert','nature','christmas','aquarium','culture'];
const DEFAULT_SETTINGS={labels:true,buildings:true,roads:true,water:true,parks:true,season:'christmas',weather:'clear',quality:'balanced'};

export function createExplorer(options={}){
 const saved=loadState();
 let places=[],byId=new Map(),mapData={},tab='discover',mode='3d',open=true,selectedId=null,building=null,query='',chain='',filter='favorites',indoor=false,onlySaved=false,limit=70,tourIndex=-1,touring=false,message='',lastMapUpdate=0,position={x:0,z:0};
 let plan=null,mission={},memories=saved.memories||{},overrides=saved.overrides||{},settings={...DEFAULT_SETTINGS,...saved.settings},activeCategories=new Set(saved.categories||CATEGORIES.map(c=>c.id));
 const root=document.createElement('section');root.id='explorer';root.className='ex-root';root.setAttribute('aria-label','Oklahoma City discovery and adventure planner');
 root.innerHTML=`<div class="ex-map-wrap" hidden><canvas id="exMap" aria-label="Interactive map of Oklahoma City, Yukon and Bethany. Drag to pan, scroll to zoom, select a place marker." tabindex="0"></canvas><div class="ex-map-title"><span class="ex-eyebrow">PRAIRIE PRISM / CITY ATLAS</span><h2>So much city. So many side quests.</h2><p>Yukon · Bethany · West OKC · Downtown</p></div><div class="ex-map-tools"><button class="ex-map-button" data-action="zoom-in" aria-label="Zoom map in">+</button><button class="ex-map-button" data-action="zoom-out" aria-label="Zoom map out">−</button><button class="ex-map-button" data-action="fit-map" title="Fit all mapped places">Fit</button><button class="ex-map-button" data-action="locate" title="Center on the virtual car">⌖</button></div><div class="ex-map-legend"><span></span> Selected itinerary · straight-line preview</div></div><div class="ex-toolbar"><button class="ex-launch is-active" data-action="toggle-panel" aria-expanded="true">${icons.pin}<span>Explore OKC</span></button><div class="ex-mode-switch" aria-label="View mode"><button data-mode="3d" class="is-active" aria-pressed="true">3D city</button><button data-mode="map" aria-pressed="false">${icons.map}Map</button></div><span class="ex-route-label" aria-live="polite">Your next adventure starts here</span></div><aside class="ex-panel"><header class="ex-panel-top"><div class="ex-panel-brand"><span class="ex-brand-star">✦</span><div><strong>OKC, let's go.</strong><span>A little closer to everywhere.</span></div></div><button class="ex-icon-button" data-action="close-panel" aria-label="Close place explorer">${icons.close}</button></header><nav class="ex-tabs" aria-label="Explorer sections"><button data-tab="discover" class="is-active" aria-selected="true">Explore</button><button data-tab="planner" aria-selected="false">Our date <span id="exStopCount">0</span></button><button data-tab="layers" aria-selected="false">Layers</button></nav><div class="ex-panel-body"></div><footer class="ex-panel-footer"><span class="ex-status-indicator"></span><span id="exFooterStatus">Mapped places. Real adventures.</span><button data-action="show-planner" aria-label="Open our adventure"><span id="exFooterTotal">$200</span></button></footer></aside><div class="ex-street-hud"><span class="ex-compass">N</span><div><strong id="exStreet">Reno Avenue</strong><span id="exLocation">Oklahoma City</span></div><button data-action="show-map" title="Open city map">${icons.map}</button></div><div class="ex-notification" hidden role="status" aria-live="polite"></div>`;
 document.body.append(root);
 root.querySelector('.ex-tabs').insertAdjacentHTML('beforeend','<button data-tab="learn" aria-selected="false">Learn</button>');
 const $=selector=>root.querySelector(selector),body=$('.ex-panel-body');
 const map=createMap($('#exMap'),{onSelect:p=>selectPlace(p.id),onMove:()=>{}});
 let notificationTimer,searchTimer;
 function notify(text){const n=$('.ex-notification');n.textContent=text;n.hidden=false;clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>n.hidden=true,3600);}
 function persist(){const ok=saveState({plan,memories,overrides,settings,categories:[...activeCategories]});if(!ok)$('#exFooterStatus').textContent='Browser storage unavailable. Export your plan.';}
 function placeMatches(p){
  if(query&&!p.searchText.includes(query.toLowerCase().trim()))return false;
  if(chain&&p.brand!==chain)return false;
  if(!p.layers.some(c=>activeCategories.has(c)))return false;
  if(onlySaved&&!memories[p.id]?.favorite&&!memories[p.id]?.status)return false;
  if(indoor&&!(p.indoor===true||(p.indoor!==false&&p.layers.some(c=>['arcades','bowling','mexican','asian','subway','bargains','thrift','markets','food','dessert','aquarium','shopping'].includes(c)))))return false;
  if(filter==='favorites'&&!p.layers.some(c=>FAVORITES.includes(c)))return false;
  if(!['all','favorites'].includes(filter)&&!p.layers.includes(filter))return false;
  return true;
 }
 function filtered(){return places.filter(placeMatches).sort((a,b)=>{
  const af=memories[a.id]?.favorite?1:0,bf=memories[b.id]?.favorite?1:0;if(af!==bf)return bf-af;
  const ac=a.curated?1:0,bc=b.curated?1:0;if(ac!==bc)return bc-ac;
  if(query){const q=query.toLowerCase(),aa=a.name.toLowerCase().startsWith(q)?1:0,bb=b.name.toLowerCase().startsWith(q)?1:0;if(aa!==bb)return bb-aa;}
  return a.name.localeCompare(b.name);
 });}
 function getTourStops(){return plan.stops.map((s,index)=>{const p=byId.get(s.placeId);return p&&p.x!=null?{...p,stopId:s.id,cost:s.cost,time:s.time,itineraryIndex:index}:null;}).filter(Boolean);}
 function updateMap(){map.setPlaces(filtered());map.setSelected(selectedId);map.setRoute(getTourStops());map.setLayers(settings);}
 function emitLayers(){options.onLayers?.({...settings,categories:[...activeCategories],subway:activeCategories.has('subway'),mexican:activeCategories.has('mexican'),filter,visiblePlaceIds:filtered().map(p=>p.id)});}
 function updateSummary(){
  const totals=planTotals(plan);$('#exStopCount').textContent=plan.stops.length;$('#exFooterTotal').textContent=money(totals.total);$('#exFooterTotal').classList.toggle('is-over',totals.remaining<0);
  $('#exFooterStatus').textContent=totals.remaining<0?`${money(-totals.remaining)} over your budget`:`${money(totals.remaining)} left for the unexpected`;
  $('.ex-route-label').textContent=selectedId?byId.get(selectedId)?.name||'Explore OKC':`${places.length.toLocaleString()} places · ${plan.stops.length} adventure stops`;
 }
 function render({keepScroll=false,keepFocus=false}={}){
  const scroll=body.scrollTop,focus=keepFocus&&document.activeElement?.id,selection=focus&&document.activeElement.selectionStart;
  if(building)body.innerHTML=buildingView({...building,...overrides[building.id]});
  else if(selectedId&&tab==='discover'&&byId.has(selectedId))body.innerHTML=detailView(byId.get(selectedId),memories[selectedId]||{},plan);
  else if(tab==='planner')body.innerHTML=plannerView(plan,{tourIndex,touring,message});
  else if(tab==='layers')body.innerHTML=layersView({activeCategories,settings,stats:map.stats,districts:mapData.districts||[],memories});
  else if(tab==='learn')body.innerHTML=learningView(mission);
  else body.innerHTML=discoverView({places:filtered(),allCount:places.length,query,filter,onlySaved,indoor,selectedId,plan,memories,limit,chain,brands:[...new Set(places.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b))});
  root.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('is-active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
  updateSummary();updateMap();
  if(keepScroll)body.scrollTop=scroll;else body.scrollTop=0;
  if(focus){const el=root.querySelector(`#${focus}`);el?.focus({preventScroll:true});try{if(selection!=null)el?.setSelectionRange(selection,selection);}catch{}}
 }
 function setMode(next){mode=next;root.classList.toggle('is-map',mode==='map');document.body.classList.toggle('explorer-map-open',mode==='map');$('.ex-map-wrap').hidden=mode!=='map';root.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('is-active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});if(mode==='map'){map.show();if(map.getScale()===.025)map.fit();}else map.hide();options.onMode?.(mode);}
 function show(nextTab){open=true;if(nextTab)tab=nextTab;$('.ex-panel').hidden=false;$('.ex-launch').classList.add('is-active');$('.ex-launch').setAttribute('aria-expanded','true');document.body.classList.add('explorer-panel-open');render();}
 function hide(){open=false;$('.ex-panel').hidden=true;$('.ex-launch').classList.remove('is-active');$('.ex-launch').setAttribute('aria-expanded','false');document.body.classList.remove('explorer-panel-open');}
 function selectPlace(id){if(!byId.has(String(id)))return;selectedId=String(id);tab='discover';building=null;show();map.setSelected(selectedId);const p=byId.get(selectedId);if(p.x!=null){if(mode==='map')map.focus(p,.18);options.onFocus?.(p);} }
 function togglePlace(id,checked){const p=byId.get(id);if(!p)return;const inPlan=plan.stops.some(s=>s.placeId===id),want=checked??!inPlan;if(want&&!inPlan){addPlace(plan,p);notify(`${p.name} added to your date.`);}else if(!want)plan.stops=plan.stops.filter(s=>s.placeId!==id);persist();render({keepScroll:true,keepFocus:true});}
 function tour(action,index){
  const stops=getTourStops();if(!stops.length){notify('Add a mapped destination to begin a tour.');return;}
  let idx=index??tourIndex;if(action==='start')idx=idx<0?stops[0].itineraryIndex:idx;if(action==='next')idx=stops.find(s=>s.itineraryIndex>tourIndex)?.itineraryIndex??stops.at(-1).itineraryIndex;if(action==='previous')idx=[...stops].reverse().find(s=>s.itineraryIndex<tourIndex)?.itineraryIndex??stops[0].itineraryIndex;
  tourIndex=idx;touring=action!=='pause';const mappedIndex=Math.max(0,stops.findIndex(s=>s.itineraryIndex===idx));
  options.onTour?.({stops,index:mappedIndex,itineraryIndex:idx,action});
  const current=stops[mappedIndex];if(current){selectedId=current.id;map.setSelected(selectedId);if(mode==='map')map.focus(current,.22);}
  render({keepScroll:true});
 }
 function exportJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function switchTab(next){tab=next;building=null;if(next!=='discover')selectedId=null;show();}
 root.addEventListener('keydown',ev=>{if(ev.code==='Escape'){if(mode==='map')setMode('3d');else if(selectedId||building){selectedId=null;building=null;render();}else hide();}ev.stopPropagation();});
 root.addEventListener('click',async ev=>{
  const el=ev.target.closest('button,a,label');if(!el||el.tagName==='A')return;
  if(el.dataset.tab)return switchTab(el.dataset.tab);
  if(el.dataset.mode)return setMode(el.dataset.mode);
  if(el.dataset.playmode){options.onMode?.(el.dataset.playmode);return;}
  if(el.dataset.filter){filter=el.dataset.filter;limit=70;selectedId=null;render();emitLayers();return;}
  if(el.dataset.openPlace)return selectPlace(el.dataset.openPlace);
  if(el.dataset.togglePlace)return togglePlace(el.dataset.togglePlace);
  if(el.dataset.favorite){const id=el.dataset.favorite;memories[id]={...memories[id],favorite:!memories[id]?.favorite};persist();render({keepScroll:true});return;}
  if(el.dataset.navigate){const p=byId.get(el.dataset.navigate);setMode('3d');options.onNavigate?.(p);notify(`Exploring ${p.name}.`);return;}
  if(el.dataset.inspect){const p=byId.get(el.dataset.inspect);options.onInspect?.(p);return;}
  if(el.dataset.openStop){const s=plan.stops.find(s=>s.id===el.dataset.openStop);if(s?.placeId)selectPlace(s.placeId);else notify('This is a budget allowance, not a mapped destination.');return;}
  if(el.dataset.removeStop){plan.stops=plan.stops.filter(s=>s.id!==el.dataset.removeStop);persist();render({keepScroll:true});return;}
  if(el.dataset.moveStop){const index=plan.stops.findIndex(s=>s.id===el.dataset.moveStop);moveStop(plan,index,Number(el.dataset.delta));persist();render({keepScroll:true});return;}
  switch(el.dataset.action){
   case 'toggle-panel':open?hide():show();break;
   case 'close-panel':hide();break;
   case 'show-planner':switchTab('planner');break;
   case 'back':selectedId=null;building=null;render();break;
   case 'show-map':setMode('map');break;
   case 'zoom-in':map.zoom(1.5);break;
   case 'zoom-out':map.zoom(1/1.5);break;
   case 'fit-map':map.fit();break;
   case 'locate':map.focus(options.getPosition?.()||position);break;
   case 'reset-filters':query='';chain='';filter='all';onlySaved=indoor=false;activeCategories=new Set(CATEGORIES.map(c=>c.id));render();emitLayers();break;
   case 'more':limit+=70;render({keepScroll:true});break;
   case 'all-layers':activeCategories=new Set(CATEGORIES.map(c=>c.id));persist();render({keepScroll:true});emitLayers();break;
   case 'no-layers':activeCategories.clear();persist();render({keepScroll:true});emitLayers();break;
   case 'favorite-layers':activeCategories=new Set(FAVORITES);persist();render({keepScroll:true});emitLayers();break;
   case 'start-tour':tour('start');break;
   case 'pause-tour':tour('pause');break;
   case 'prev-tour':tour('previous');break;
   case 'next-tour':tour('next');break;
   case 'export':exportJSON(exportPlan(plan,places),'okc-adventure.json');notify('Itinerary exported.');break;
   case 'export-buildings':exportJSON({version:1,overrides},'okc-building-corrections.json');break;
   case 'copy':{const total=planTotals(plan);const text=`${plan.name}\nBudget: ${money(plan.budget)}\n${plan.stops.map((s,i)=>`${i+1}. ${s.time?s.time+' · ':''}${s.name} — ${money(s.cost)}${s.address?' · '+s.address:''}`).join('\n')}\nReserve: ${money(plan.reserve)}\nTotal: ${money(total.total)}\nPlanning allowances for two. Check venue hours before going.`;try{await navigator.clipboard.writeText(text);notify('Your adventure is on the clipboard.');}catch{exportJSON(exportPlan(plan,places),'okc-adventure.json');notify('Clipboard unavailable; downloaded your itinerary.');}break;}
   case 'surprise':{const interior=$('#exSurpriseIndoor')?.checked,hours=Number($('#exSurpriseHours')?.value||4);plan=surprisePlan(places,{budget:plan.budget,indoor:interior,hours,categories:[...activeCategories],seed:Date.now(),visited:new Set(Object.entries(memories).filter(([,m])=>m.status==='visited').map(([id])=>id)),position:options.getPosition?.()||position});tourIndex=-1;touring=false;persist();render();notify(plan.stops.length?'A new adventure is ready. Adjust it however you like.':'No stops fit these preferences and budget. Try a larger budget or more interests.');break;}
  }
 });
 root.addEventListener('input',ev=>{
  const el=ev.target;if(el.id==='exSearch'){query=el.value;selectedId=null;limit=70;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render({keepFocus:true});emitLayers();},130);return;}
  if(el.dataset.journal){const key=el.dataset.journal;memories[selectedId]={...memories[selectedId],[key]:key.includes('Rating')?Number(el.value):el.value};persist();return;}
  if(el.id==='exPlanName'){plan.name=el.value;persist();return;}
  if(el.id==='exBudget'||el.id==='exReserve'){plan[el.id==='exBudget'?'budget':'reserve']=Math.max(0,Math.min(100000,Number(el.value)||0));persist();updateSummary();const t=planTotals(plan);$('#exTotal').textContent=money(t.total);$('#exRemaining').textContent=money(Math.abs(t.remaining));$('.ex-remaining>span').textContent=t.remaining<0?'Over budget':'Still yours';$('.ex-budget-track>span').style.width=`${Math.min(100,t.total/Math.max(1,plan.budget)*100)}%`;$('.ex-budget-card>p').textContent=`Two people · ${plan.stops.length} stops · ${money(t.reserve)} reserved for extras`;$('.ex-budget-card').classList.toggle('over-budget',t.remaining<0);return;}
 });
 root.addEventListener('change',async ev=>{
  const el=ev.target;
  if(el.dataset.checkPlace)return togglePlace(el.dataset.checkPlace,el.checked);
  if(el.id==='exChain'){chain=el.value;if(chain){filter='all';activeCategories=new Set(CATEGORIES.map(c=>c.id));}render();emitLayers();return;}
  if(el.id==='exIndoor'){indoor=el.checked;render();emitLayers();return;}
  if(el.id==='exSavedOnly'){onlySaved=el.checked;render();emitLayers();return;}
  if(el.dataset.layer){el.checked?activeCategories.add(el.dataset.layer):activeCategories.delete(el.dataset.layer);persist();updateMap();emitLayers();return;}
  if(el.dataset.setting){settings[el.dataset.setting]=el.checked;persist();updateMap();emitLayers();return;}
  if(el.dataset.stopCost){const s=plan.stops.find(s=>s.id===el.dataset.stopCost);if(s)s.cost=Math.max(0,Math.min(100000,Number(el.value)||0));persist();render({keepScroll:true});return;}
  if(el.dataset.stopTime){const s=plan.stops.find(s=>s.id===el.dataset.stopTime);if(s)s.time=el.value;persist();return;}
  if(el.id==='exPlanDate'){plan.date=el.value;persist();return;}
  if(el.id==='exBudget'||el.id==='exReserve'){render({keepScroll:true});return;}
  if(el.id==='exPreset'&&el.value){plan=createPreset(el.value,places,plan.budget);tourIndex=-1;touring=false;persist();render();return;}
  if(el.id==='exDistrict'&&el.value!==''){const district=mapData.districts?.[Number(el.value)];if(district){map.focus(district,.08);options.onNavigate?.({...district,id:`district-${el.value}`,district:district.name});}return;}
  if(el.id==='exSeason'){settings.season=el.value;options.onSeason?.(el.value);persist();return;}
  if(el.id==='exWeather'){settings.weather=el.value;options.onWeather?.(el.value);persist();return;}
  if(el.id==='exQuality'){settings.quality=el.value;options.onQuality?.(el.value);persist();return;}
  if(el.id==='exImport'){try{const file=el.files[0];if(!file)return;if(file.size>250000)throw Error('Choose an itinerary under 250 KB.');plan=importPlan(JSON.parse(await file.text()),places);tourIndex=-1;touring=false;message='Your itinerary was imported. Review its allowances before heading out.';persist();render();notify('Your adventure is ready.');}catch(error){notify(error.message||'Could not read that itinerary.');}return;}
 });
 root.addEventListener('submit',ev=>{
  ev.preventDefault();if(ev.target.id==='exCustomForm'){const name=$('#exCustomName').value.trim(),cost=Math.max(0,Math.min(100000,Number($('#exCustomCost').value)||0));if(!name)return;plan.stops.push({id:`custom-${Date.now()}`,placeId:null,name,cost,time:'',note:'Custom planning allowance'});persist();render({keepScroll:true});}
  if(ev.target.id==='exBuildingForm'&&building){const form=new FormData(ev.target),override={id:building.id,name:String(form.get('name')),h:Math.max(2,Math.min(600,Number(form.get('height'))||8)),height:Math.max(2,Math.min(600,Number(form.get('height'))||8)),color:String(form.get('color')),roof:String(form.get('roof')),reference:safeUrl(form.get('reference'))||'',notes:String(form.get('notes')),updatedAt:new Date().toISOString()};overrides[building.id]=override;persist();options.onBuildingOverride?.(override);notify('Building correction saved on this device.');}
 });
 function setData(next={}){
  if(next.places){const list=Array.isArray(next.places)?next.places:next.places.pois||[];places=list.map(normalizePlace);byId=new Map(places.map(p=>[p.id,p]));}
  if(next.mapData){mapData=next.mapData;map.setData(mapData);}
  if(!plan){try{plan=saved.plan?importPlan(saved.plan,places):defaultPlan(places);}catch{plan=defaultPlan(places);}}
  else plan.stops=plan.stops.map(s=>{if(s.placeId&&byId.has(s.placeId))return s;const exact=matchPlace(s.name,places,s.address||'');return exact?{...s,placeId:exact.id}:s;});
  render();emitLayers();
 }
 function update(next){position=next||options.getPosition?.()||position;const now=performance.now();if(now-lastMapUpdate>300){lastMapUpdate=now;map.setPosition(position);if(position.street)$('#exStreet').textContent=position.street;if(position.district)$('#exLocation').textContent=position.district;if(Number.isFinite(position.heading)){const dirs=['E','SE','S','SW','W','NW','N','NE'];$('.ex-compass').textContent=dirs[((Math.round(position.heading/(Math.PI/4))%8)+8)%8];}}}
 function setRoadRoute(route){map.setRoadRoute(route);const legend=$('.ex-map-legend');legend.textContent=route?.points?.length>1?`Road route${Number.isFinite(route.distance)?' · '+(route.distance/1000).toFixed(1)+' km':''}`:'Selected itinerary · straight-line preview';legend.prepend(document.createElement('span'));}
 setData({places:options.places||[],mapData:options.mapData||{}});show();if(options.mapOnly)setMode('map');
 return {show,hide,setMode,setData,selectPlace,update,notify,setRoadRoute,showMap(){setMode('map');},setMapVisible(value){setMode(value?'map':'3d');},setMission(value){mission=value||{};if(tab==='learn')render({keepScroll:true});},setTourStep(index){tourIndex=getTourStops()[index]?.itineraryIndex??index;render({keepScroll:true});},setBuilding(value){building=value;selectedId=null;tab='discover';show();},get overrides(){return {...overrides};},get settings(){return {...settings};},get plan(){return exportPlan(plan,places);},get visiblePlaces(){return filtered();},get selectedPlace(){return byId.get(selectedId)||null;},destroy(){clearTimeout(notificationTimer);clearTimeout(searchTimer);map.destroy();root.remove();document.body.classList.remove('explorer-panel-open','explorer-map-open');}};
}
