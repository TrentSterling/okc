import assert from 'node:assert/strict';
import {createMapTileLoader} from './map-tiles.js';
import {createNavigation} from './navigation.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// A failed tile must free the queue, and a useful response from a previous
// viewport generation must still populate the current footprint view.
const loads=[],errors=[],published=[];
const tiles=Array.from({length:4},(_,x)=>({id:x+'_0',url:'tiles/'+x+'_0.json',gzipUrl:'tiles/'+x+'_0.json.gz'}));
const loader=createMapTileLoader({tileSize:512,tiles},value=>published.push(value),error=>errors.push(error),{load:(url,{signal})=>{
 const job={...deferred(),id:url.pathname.match(/(\d_0)\.json/)[1],signal};loads.push(job);signal.addEventListener('abort',()=>job.reject(new DOMException('Cancelled','AbortError')),{once:true});return job.promise;
}});
const view=(min=0,max=1535,cx=100)=>({visible:true,scale:.25,bounds:{minX:min,minZ:0,maxX:max,maxZ:511},center:{x:cx,z:200}});
loader.update(view());await settle();assert.equal(loads.length,2);assert.equal(loader.stats.pending,2);
loads.find(j=>j.id==='0_0').reject(Error('Missing tile'));await settle();assert.equal(errors.length,1);assert.ok(loads.some(j=>j.id==='2_0'),'Failure frees a slot for the next available tile.');
loader.update(view(512,1535,1200)); // Different order, same useful pending tiles.
loads.find(j=>j.id==='1_0').resolve({buildings:[{id:'building-1'}]});await settle();assert.ok(published.at(-1).some(b=>b.id==='building-1'),'An in-flight tile retained after a pan publishes immediately.');
loads.find(j=>j.id==='2_0').resolve({buildings:[{id:'building-2'}]});await settle();assert.equal(loader.stats.pending,0);assert.equal(loads.filter(j=>j.id==='0_0').length,1,'Failed metadata is skipped on later pump passes.');
loader.update(view(1536,2047,1800));await settle();const pending=loads.find(j=>j.id==='3_0');assert.ok(pending);
loader.update({...view(),visible:false});await settle();assert.equal(pending.signal.aborted,true);assert.deepEqual(published.at(-1),[]);loader.dispose();

const route=(from,to)=>({ok:true,points:[[from.x,from.z],[to.x,to.z]],meters:Math.hypot(to.x-from.x,to.z-from.z),legs:[{pointIndex:0,name:'Reno Avenue'}]});
let position={x:0,z:0},routeCount=0,bridge=null;
const states=[],notices=[],shown=[];
const noop=()=>{};
const explorer={setTourState:s=>states.push(s),setRoadRoute:r=>shown.push(r),notify:m=>notices.push(m),showMap:noop,setTourStep:noop,update:noop,setMission:noop,selectPlace:noop,show:noop,hide:noop,setMode:noop};
const provider={route:async(from,to)=>{routeCount++;return route(from,to);}};
const nav=createNavigation({getExplorer:()=>explorer,getBridge:()=>bridge,getPosition:()=>position,setPosition:p=>position=p,getPlaces:()=>[],routerProvider:()=>provider});
const stops=[{id:'a',stopId:'stop-a',name:'Park A',x:1000,z:0,itineraryIndex:0}];
await nav.tourCommand({stops,index:0,action:'start'});nav.update(1);assert.equal(position.x,28);
await nav.tourCommand({stops,index:0,action:'pause'});nav.update(1);assert.equal(position.x,28);
await nav.tourCommand({stops,index:0,action:'resume'});nav.update(1);assert.equal(position.x,56);assert.equal(routeCount,1,'An unchanged paused tour resumes its offset without recomputing the graph.');
await nav.tourCommand({stops,index:0,action:'pause'});const changed=[{...stops[0],id:'b',stopId:'stop-b',name:'Park B',x:2000}];
await nav.tourCommand({stops:changed,index:0,action:'resume'});assert.equal(routeCount,2,'A changed itinerary must not revive the old tour.');
await nav.tourCommand({action:'cancel'});const parked={...position};nav.update(1);assert.deepEqual(position,parked);assert.equal(shown.at(-1),null);
await nav.tourCommand({stops,index:0,action:'start'});nav.update(100);assert.equal(states.at(-1).finished,true);const before=notices.length;await nav.tourCommand({stops,index:0,action:'resume'});assert.equal(routeCount,3);assert.ok(notices.length>before);
nav.dispose();

// Only the newest route response is displayed; bridge operations receive a
// live ticket guard, because checking after their await is too late to stop a
// stale car teleport inside the bridge itself.
const routeJobs=[];provider.route=(from,to)=>{const job={...deferred(),from,to};routeJobs.push(job);return job.promise;};
const nav2=createNavigation({getExplorer:()=>explorer,getBridge:()=>bridge,getPosition:()=>position,setPosition:p=>position=p,getPlaces:()=>[],routerProvider:()=>provider});
const a={id:'one',name:'One',x:3000,z:0},b={id:'two',name:'Two',x:4000,z:0};
const first=nav2.navigate(a),second=nav2.navigate(b);routeJobs[0].resolve(route(position,a));await first;routeJobs[1].resolve(route(position,b));await second;assert.equal(shown.at(-1).points.at(-1)[0],4000);
const bridgeJobs=[];provider.route=async(from,to)=>route(from,to);bridge={pauseTour:noop,setRoute:noop,getPosition:()=>position,navigate:(place,r,control)=>{const job={...deferred(),place,control};bridgeJobs.push(job);return job.promise;}};
const old=nav2.navigate(a);await settle();const latest=nav2.navigate(b);await settle();assert.equal(bridgeJobs[0].control.isCurrent(),false);assert.equal(bridgeJobs[1].control.isCurrent(),true);bridgeJobs[1].resolve();await latest;bridgeJobs[0].resolve();await old;nav2.dispose();
console.log('Discovery checks passed: failed/retained/hidden map tile requests, tour pause/resume/cancel, changed itineraries, arrival, stale routes and bridge cancellation guards.');
