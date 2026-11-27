import assert from 'node:assert/strict';
import {defaultPlan,planTotals,importPlan,exportPlan,moveStop,addPlace,surprisePlan,loadState,saveState,matchPlace} from './planner.js';
import {normalizePlace,project,unproject,safeUrl,layerIds} from './catalog.js';

const base=defaultPlan();
assert.deepEqual(planTotals(base),{subtotal:187,reserve:13,total:200,remaining:0});
const original={name:'OKC Christmas Date',budget:200,total:200,stops:base.stops.map(s=>({...s,time:s.time==='13:00'?'1:00 PM':s.time}))};
const imported=importPlan(original);
assert.equal(imported.reserve,13,'The original export must retain its missing $13 as reserve.');
assert.equal(imported.stops[2].time,'13:00');
assert.equal(planTotals(imported).total,200);
assert.equal(matchPlace('Devon Ice Rink',[{name:'D',id:'parking-d'},{name:'Ice',id:'ice'}]),null,'Short mapped labels must never become itinerary venues.');
assert.equal(matchPlace('Hatch Early Mood Food',[{name:'Hatch Early Mood Food Automobile Alley',id:'hatch'}]).id,'hatch');
assert.equal(matchPlace('Bricktown Brewery',[{name:'Bricktown Brewery',id:'wrong',address:'5516 West Memorial Road'}],'1 N Oklahoma Ave'),null,'An explicit address must not resolve to another chain location.');
assert.equal(matchPlace('Bricktown Brewery',[{name:'Bricktown Brewery',id:'right',address:'1 North Oklahoma Avenue'}],'1 N Oklahoma Ave').id,'right');
assert.deepEqual(planTotals(importPlan(exportPlan(imported))),planTotals(imported));
assert.throws(()=>importPlan({stops:[{name:'Bad cost',cost:-1}]}));
assert.throws(()=>importPlan({stops:[{name:'NaN',cost:'nonsense'}]}));
assert.throws(()=>importPlan({stops:new Array(101).fill({name:'Place',cost:1})}));
const old=imported.stops[0].id;assert.equal(moveStop(imported,0,-1),false);assert.equal(moveStop(imported,0,1),true);assert.equal(imported.stops[1].id,old);

const source=[
 {id:'1',name:'Subway',category:'subway',lat:35.48,lon:-97.65,cost:24,indoor:true},
 {id:'2',name:'Pinball Arcade',category:'arcade',x:-200,z:-300,cost:25,indoor:true},
 {id:'3',name:'Goodwill Thrift',category:'thrift',x:-150,z:-200,cost:20,indoor:true},
 {id:'4',name:'Duck Park',category:'park',x:-900,z:-100,cost:0,indoor:false},
].map(normalizePlace);
assert.equal(addPlace(imported,source[0]),true);assert.equal(addPlace(imported,source[0]),false,'Repeated checkboxes must not duplicate a place.');
const opts={budget:75,indoor:true,hours:6,seed:5,visited:new Set(['2']),position:{x:0,z:0}};
const surprise=surprisePlan(source,opts);
assert.ok(planTotals(surprise).total<=75);
assert.ok(surprise.stops.every(s=>!['2','4'].includes(s.placeId)));
assert.deepEqual(surprise.stops.map(s=>s.placeId),surprisePlan(source,opts).stops.map(s=>s.placeId),'The same seed must produce the same selected order.');
assert.equal(surprisePlan(source,{budget:0,indoor:true}).stops.length,0);
assert.deepEqual(loadState({getItem(){throw Error('Blocked');}}),{});
assert.equal(saveState({}, {setItem(){throw Error('Quota');}}),false);
assert.equal(normalizePlace({name:'Unlocated',lat:null,lon:null,x:null,z:null}).x,null);
assert.equal(normalizePlace({name:'Unlocated'}).x,null);
assert.equal(normalizePlace({name:'At origin',x:0,z:0}).lon,-97.51758985376695);
const p=project(-97.65,35.5),ll=unproject(p.x,p.z);assert.ok(Math.abs(ll.lat-35.5)<1e-9&&Math.abs(ll.lon+97.65)<1e-9);
assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('https://example.com/'),'https://example.com/');
assert.ok(layerIds({name:'Subway',category:'fast_food'}).includes('subway'));
assert.ok(layerIds({name:'Mexican family restaurant',category:'restaurant'}).includes('mexican'));
assert.ok(!layerIds({name:'Taco Bell Mexican fast food',category:'fast_food'}).includes('mexican'));
console.log('Explorer checks passed: budget reserve, import validation, AM/PM conversion, duplicate stops, reorder bounds, seeded discovery budget/indoor/visited filters, blocked storage, coordinate validity, URL safety, and chain/cuisine categorization.');
