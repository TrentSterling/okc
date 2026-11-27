import assert from 'node:assert/strict';
import test from 'node:test';
import {createExplorerController} from './controller.js';
import {CATEGORIES} from './catalog.js';

const places=[
 {id:'cafe',name:'A Cafe',category:'cafe',brand:'A Coffee',address:'100 Reno',x:1,z:2,buildingId:'building-1',website:'https://example.com',indoor:true},
 {id:'subway-a',name:'Subway',category:'fast_food',brand:'Subway',address:'200 Main',x:20,z:30},
 {id:'park',name:'A Park',category:'park',x:50,z:60,indoor:false},
];
const blank={version:1,name:'Test adventure',budget:200,reserve:13,date:'',stops:[]};
function fixture(extra={},initial={plan:blank}){
 const events=[],notices=[],downloads=[],saved=new Map();
 const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
 const map=new Proxy({stats:{roads:10,places:places.length},getScale:()=>.1,getView:()=>({visible:true})},{get:(object,key)=>key in object?object[key]:(...args)=>events.push([key,...args])});
 const controller=createExplorerController({places,...extra},{map,initialState:structuredClone(initial),storage,now:()=>1000,notify:value=>notices.push(value),platform:{download:(...args)=>downloads.push(args),copyText:async()=>true},setMode:mode=>events.push(['mode',mode])});
 return {controller,events,notices,downloads,saved};
}

test('GPU controller keeps place filters, brand coverage, favorite order and layer callbacks',async()=>{
 const layers=[],{controller:c}=fixture({onLayers:value=>layers.push(value)});
 await c.dispatch({type:'filter.patch',patch:{query:'Reno Cafe'}});assert.deepEqual(c.visiblePlaces.map(p=>p.id),['cafe']);
 await c.dispatch({type:'filter.patch',patch:{query:'',chain:'Subway'}});assert.deepEqual(c.visiblePlaces.map(p=>p.id),['subway-a']);assert.equal(c.getSnapshot().filter,'all');
 await c.dispatch({type:'filter.reset'});await c.dispatch({type:'place.favorite',placeId:'park'});assert.equal(c.visiblePlaces[0].id,'park');
 await c.dispatch({type:'filter.patch',patch:{onlySaved:true}});assert.deepEqual(c.visiblePlaces.map(p=>p.id),['park']);
 await c.dispatch({type:'filter.patch',patch:{indoor:true}});assert.equal(c.visiblePlaces.length,0);
 assert.deepEqual(layers.at(-1).visiblePlaceIds,[]);assert.equal(c.getSnapshot().activeCategories.size,CATEGORIES.length);
});

test('planner preserves mapped tour indices around custom allowances and cancels changed routes',async()=>{
 const tours=[],{controller:c}=fixture({onTour:value=>tours.push(value)});
 await c.dispatch({type:'plan.custom.patch',patch:{name:'Parking',cost:5}});await c.dispatch({type:'plan.custom.add'});
 await c.dispatch({type:'place.include',placeId:'cafe',value:true});await c.dispatch({type:'place.include',placeId:'cafe',value:true});
 assert.equal(c.plan.stops.length,2);assert.equal(c.getSnapshot().totals.total,58);
 await c.dispatch({type:'tour.command',command:'start'});assert.equal(tours.at(-1).index,0);assert.equal(tours.at(-1).itineraryIndex,1);
 await c.dispatch({type:'tour.command',command:'pause'});assert.equal(c.getSnapshot().touring,false);
 await c.dispatch({type:'tour.command',command:'resume'});assert.equal(tours.at(-1).action,'resume');
 await c.dispatch({type:'plan.stop.move',stopId:c.plan.stops[1].id,direction:-1});assert.equal(tours.at(-1).action,'cancel');assert.equal(c.getSnapshot().tourIndex,-1);
 await c.dispatch({type:'plan.patch',patch:{budget:20,reserve:1}});assert.equal(c.getSnapshot().totals.remaining,-26);
 await c.dispatch({type:'plan.stop.patch',stopId:c.plan.stops[0].id,patch:{time:'9:30'},commit:true});assert.equal(c.plan.stops[0].time,'09:30');
});

test('text drafts remain editable and journal numbers stay bounded',async()=>{
 const {controller:c}=fixture();c.selectPlace('cafe');
 await c.dispatch({type:'journal.patch',patch:{photo:'h',notes:'A & B <C>',trentRating:9,jennRating:-2,status:'visited'}});
 assert.equal(c.getSnapshot().memories.cafe.photo,'h','A partial URL must not disappear while typing.');
 assert.equal(c.getSnapshot().memories.cafe.notes,'A & B <C>');assert.equal(c.getSnapshot().memories.cafe.trentRating,5);assert.equal(c.getSnapshot().memories.cafe.jennRating,0);
 await c.dispatch({type:'filter.patch',patch:{onlySaved:true,filter:'all'}});assert.deepEqual(c.visiblePlaces.map(p=>p.id),['cafe']);
});

test('full backup round trip restores the plan, journal, preferences, categories and corrections',async()=>{
 const {controller:c,downloads}=fixture();await c.dispatch({type:'place.include',placeId:'cafe'});
 await c.dispatch({type:'settings.patch',patch:{weather:'snow',quality:'low',music:true}});await c.dispatch({type:'layers.set',ids:['food']});
 await c.dispatch({type:'journal.patch',placeId:'cafe',patch:{favorite:true,notes:'Our spot'}});
 c.setBuilding({id:'building-1',h:10});await c.dispatch({type:'building.patch',patch:{height:'24',color:'#aabbcc',roof:'pitched',notes:'Photo reference'}});await c.dispatch({type:'building.save'});
 await c.dispatch({type:'file.export',kind:'backup'});const payload=JSON.parse(downloads.at(-1)[1]);
 const callbacks=[],{controller:restored}=fixture({onWeather:value=>callbacks.push(['weather',value]),onBuildingOverride:value=>callbacks.push(['building',value])});
 await restored.importPayload('backup',payload);
 assert.equal(restored.plan.stops[0].placeId,'cafe');assert.equal(restored.settings.weather,'snow');assert.equal(restored.settings.music,true);assert.deepEqual([...restored.getSnapshot().activeCategories],['food']);
 assert.equal(restored.getSnapshot().memories.cafe.notes,'Our spot');assert.equal(restored.overrides['building-1'].h,24);assert.ok(callbacks.some(v=>v[0]==='building'));
 await assert.rejects(restored.importPayload('backup',{kind:'wrong'}),/discovery backup/);
});

test('building edits stay local on preview failure and sanitize external data',async()=>{
 const {controller:c,notices}=fixture({onBuildingOverride:async()=>{throw Error('No scene');}});
 c.setBuilding({id:'b',h:8});await c.dispatch({type:'building.patch',patch:{height:'900',reference:'javascript:alert(1)',color:'bad',notes:'Retain me'}});await c.dispatch({type:'building.save'});
 assert.equal(c.overrides.b.h,500);assert.equal(c.overrides.b.reference,'');assert.equal(c.overrides.b.color,undefined);assert.equal(c.overrides.b.notes,'Retain me');assert.match(notices.at(-1),/saved locally/i);
});

test('map, inspect, mission and external method contracts stay available without a DOM',async()=>{
 const actions=[],{controller:c,events}=fixture({onNavigate:p=>actions.push(['navigate',p.id]),onInspect:p=>actions.push(['inspect',p.id]),onMode:m=>actions.push(['mode',m]),getPosition:()=>({x:99,z:88})});
 c.showMap();assert.equal(c.getSnapshot().mode,'map');await c.dispatch({type:'map.command',command:'locate'});assert.ok(events.some(e=>e[0]==='focus'&&e[1].x===99));
 await c.dispatch({type:'place.navigate',placeId:'cafe'});await c.dispatch({type:'place.inspect',placeId:'cafe'});assert.deepEqual(actions.filter(a=>a[0]!=='mode'),[['navigate','cafe'],['inspect','cafe']]);
 c.setMission({title:'Pizza run',distance:42});assert.equal(c.getSnapshot().mission.distance,42);
 c.setRoadRoute({points:[[0,0],[1,1]],distance:10});assert.equal(c.getSnapshot().roadRoute.distance,10);
 c.setMapBuildings([{id:'b'}]);assert.ok(events.some(e=>e[0]==='setBuildings'));
 c.hide();assert.equal(c.getSnapshot().open,false);c.show('learn');assert.equal(c.getSnapshot().tab,'learn');
 await c.dispatch({type:'challenge.command',command:'taxi'});assert.ok(actions.some(a=>a[1]==='taxi'));
 c.destroy();assert.ok(events.some(e=>e[0]==='destroy'));
});

test('navigation owns its final error or route information message',async()=>{
 let controller;
 const fixtureState=fixture({onNavigate:async()=>{controller.notify('Disconnected road network');}});controller=fixtureState.controller;
 await controller.dispatch({type:'place.navigate',placeId:'cafe'});
 assert.deepEqual(fixtureState.notices,['Disconnected road network'],'A generic success toast must not overwrite the navigation result.');
});

test('leaving place details clears the controller selection and map highlight together',async()=>{
 const {controller:c,events}=fixture();
 const check=()=>{assert.equal(c.getSnapshot().selectedId,null);assert.equal(events.filter(e=>e[0]==='setSelected').at(-1)[1],null);};
 for(const action of [{type:'view.back'},{type:'view.escape'},{type:'view.show',tab:'planner'}]){
  c.selectPlace('cafe');assert.equal(events.filter(e=>e[0]==='setSelected').at(-1)[1],'cafe');await c.dispatch(action);check();
 }
 c.selectPlace('cafe');c.setBuilding({id:'building-1',h:8});check();
 c.selectPlace('cafe');await c.dispatch({type:'filter.patch',patch:{query:'Park'}});check();
});
