import assert from 'node:assert/strict';
import {createSpatialIndex,intersects} from './spatial-index.js';
import {createCatalogQuery} from './catalog-query.js';
import {CATEGORIES,normalizePlace} from './catalog.js';
import {defaultPlan,createPreset,allowanceFor,surprisePlan,importPlan} from './planner.js';
import {planningWarnings} from './planning-warnings.js';
import {sanitizeState,sanitizeOverrides,loadState} from './persistence.js';
import {createMap} from './map.js';

const shapes=Array.from({length:200},(_,i)=>({id:i,b:[i*101-5000,(i%20)*97-1000,i*101-4800,(i%20)*97-850]}));
shapes.push({id:200,b:[-100000,-100000,100000,100000]});
const index=createSpatialIndex(shapes);
for(const view of [[-5100,-1100,-4700,-800],[0,0,1000,1000],[-200000,-200000,200000,200000],[300000,300000,300100,300100]])assert.deepEqual(index.query(view),shapes.filter(s=>intersects(s.b,view)),'Grid boundaries and oversized features must match a complete spatial scan.');

const breakfast=normalizePlace({id:'hatch',name:'Hatch Early Mood Food',category:'breakfast',tags:['breakfast','christmas-date'],price:{kind:'allowance',amount:30,basis:'two adults'}});
assert.equal(breakfast.primaryLayer,'food');assert.ok(breakfast.layers.includes('christmas'));assert.equal(allowanceFor(breakfast),30);
assert.equal(allowanceFor(normalizePlace({id:'rink',name:'Devon Ice Rink',category:'seasonal',price:{kind:'published',amount:32,basis:'two adults'}})),32,'Skating cannot become free because it has a Christmas tag.');
assert.equal(normalizePlace({name:'Subway',category:'fast_food'}).primaryLayer,'subway');
const places=[breakfast,normalizePlace({id:'gas',name:'Circle K',category:'fuel',address:'700 N Portland Ave'}),normalizePlace({id:'outdoor',name:'Outdoor patio restaurant',category:'food',indoor:false,x:200,z:300})];
const query=createCatalogQuery(),options={query:'Portland Circle',filter:'favorites',activeCategories:new Set(CATEGORIES.map(c=>c.id)),memories:{}};
assert.equal(query(places,options)[0]?.id,'gas','Text search must cover everyday places and match separate words.');
assert.equal(query(places,options),query(places,options),'Repeated consumers must reuse a filtered catalog.');
assert.equal(surprisePlan(places,{budget:200,indoor:true}).stops.some(s=>s.placeId==='outdoor'),false,'Explicit outdoor setting overrides broad restaurant category guesses.');
assert.equal(createPreset('christmas',[],75).budget,75,'Changing a preset must preserve the chosen budget.');
assert.equal(new Set(importPlan({stops:[{id:'x',name:'A'},{id:'x-2',name:'B'},{id:'x',name:'C'}]}).stops.map(s=>s.id)).size,3,'Imported IDs remain unique even when suffixes already exist.');
const plan=defaultPlan();assert.equal(planningWarnings(plan).length,0);plan.date='2026-12-14';assert.ok(planningWarnings(plan).some(w=>w.includes('Pop-Up')));assert.ok(planningWarnings(plan).some(w=>w.includes('weekday')));plan.date='2027-12-12';assert.ok(planningWarnings(plan)[0].includes('2026'));plan.date='2026-99-99';assert.ok(planningWarnings(plan)[0].includes('valid date'));
assert.equal(sanitizeState({categories:{bad:1},settings:{quality:'explode'},memories:['bad']}).settings.quality,undefined);
assert.ok(Array.isArray(loadState({getItem:()=>'{"categories":4}'}).categories));
assert.equal(sanitizeOverrides({b:{h:900,color:'javascript:bad',roof:'flat'}}).b.h,500);
assert.equal(sanitizeOverrides({b:{h:900,color:'javascript:bad',roof:'flat'}}).b.color,undefined);

// A moving car must not rerasterize unchanged geographic data. Test the cache
// with instrumented Canvas contracts, without depending on a GPU or browser.
let queued=[],basePaints=0,baseContext={};
const noOp=()=>{},makeContext=()=>new Proxy({measureText:()=>({width:20})},{get:(t,k)=>k in t?t[k]:noOp,set:(t,k,v)=>(t[k]=v,true)});
baseContext=makeContext();baseContext.fillRect=()=>basePaints++;
const canvas={width:0,height:0,getContext:()=>makeContext(),getBoundingClientRect:()=>({width:1000,height:700,left:0,top:0}),addEventListener:noOp,style:{}};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>baseContext}),querySelector:()=>null};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=fn=>(queued.push(fn),queued.length);globalThis.cancelAnimationFrame=noOp;
const flush=()=>{const frames=queued;queued=[];frames.forEach(f=>f());};
let geometryReads=0;const road={name:'Reno',get p(){geometryReads++;return [[-100,0],[100,0]];}};
const map=createMap(canvas);map.setData({bounds:[-100,-100,100,100],roads:[road],surfaces:[]});
assert.equal(geometryReads,0,'A hidden map must not prepare and index its entire overview during 3D startup.');
map.show();flush();const firstPaints=basePaints,firstReads=geometryReads;assert.ok(firstReads>0,'The first visible draw prepares its actual geography.');
map.setPosition({x:1,z:2});flush();map.setPosition({x:2,z:3});flush();assert.equal(basePaints,firstPaints,'Car updates reuse the cached base.');
assert.equal(geometryReads,firstReads,'Moving the car must not normalize map geometry again.');
map.zoom(2);flush();assert.ok(basePaints>firstPaints,'Zoom invalidates cached map pixels.');map.destroy();
console.log('Atlas checks passed: spatial equivalence, cached base rendering, catalog search, canonical categories, source allowances, indoors filtering, unique imports, date warnings, and malformed local storage.');
