import {isIndoorPlace} from './catalog-query.js';
export {loadState,saveState} from './persistence.js';
export const DEFAULT_DATE = [
 ['Hatch Early Mood Food',30,'09:30','Breakfast','1101 N Broadway Ave'],
 ['Holiday Pop-Up Shops',60,'11:00','Shopping allowance','399 NW 10th St'],
 ['Devon Ice Rink',32,'13:00','Two adults with skate rental','113 S Robinson Ave'],
 ['Lights on Broadway',0,'16:00','Free holiday stop','N Broadway Ave'],
 ['Bricktown Brewery',40,'17:45','Dinner allowance','1 N Oklahoma Ave'],
 ['Bricktown Candy Co',15,'19:00','Dessert allowance','100 E California Ave'],
 ['Bricktown Canal',0,'19:30','Canal walk'],
 ['Christmas lights drive',10,'20:00','Fuel allowance'],
];
export const CHRISTMAS_PLANNING_NOTE='Holiday Pop-Up Shops: Friday–Sunday, November 27–December 20. A 1 PM skating stop needs weekend opening hours. Lights on Broadway festival: December 5 and 12, 4–7 PM; the light displays can be seen on other nights. Published schedules are not live availability. Check each venue before heading out.';
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Math.max(0,Math.min(100000,Number(v))):fallback;
export const money=v=>'$'+finite(v).toLocaleString('en-US',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2});
export function planTotals(plan){const subtotal=plan.stops.reduce((s,p)=>s+Math.round(finite(p.cost)*100),0)/100,reserve=finite(plan.reserve),total=Math.round((subtotal+reserve)*100)/100;return {subtotal,reserve,total,remaining:Math.round((finite(plan.budget)-total)*100)/100};}
export function matchPlace(name,places,address=''){
 if(String(name).toLowerCase()==='bricktown dessert allowance'){name='Bricktown Candy Co';address='';}
 const clean=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 const normalizeAddress=s=>clean(String(s).toLowerCase().replace(/\bnorthwest\b/g,'nw').replace(/\bsouthwest\b/g,'sw').replace(/\bnortheast\b/g,'ne').replace(/\bsoutheast\b/g,'se').replace(/\bnorth\b/g,'n').replace(/\bsouth\b/g,'s').replace(/\beast\b/g,'e').replace(/\bwest\b/g,'w').replace(/\bavenue\b/g,'ave').replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\bboulevard\b/g,'blvd'));
 const key=clean(name),exact=places.filter(p=>clean(p.name)===key),prefix=places.filter(p=>{const n=clean(p.name);return key.length>=5&&n.length>=5&&(n.startsWith(key)||(key.startsWith(n)&&n.length>=key.length*.6));}),candidates=exact.length?exact:prefix;
 if(address){const a=normalizeAddress(address),match=candidates.find(p=>{const b=normalizeAddress(p.address||'');return b.length>=5&&(a===b||b.startsWith(a)||a.startsWith(b));});if(match)return match;if(candidates.length>1||candidates.some(p=>p.address))return null;}
 return candidates.find(p=>p.curated)||candidates[0]||null;
}
export function defaultPlan(places=[]){return {version:1,name:'OKC Christmas Date',budget:200,reserve:13,date:'2026-12-12',planningNote:CHRISTMAS_PLANNING_NOTE,stops:DEFAULT_DATE.map(([name,cost,time,note,address=''],i)=>{const place=matchPlace(name,places,address);return{id:`stop-default-${i}`,placeId:place?.id||null,name:place?.name||name,address:place?.address||address,cost,time,note,priceKind:'allowance'};})};}
export function allowanceFor(p){
 if(Number.isFinite(Number(p.cost))&&p.cost!=null)return finite(p.cost);
 const price=p.price;if(price&&typeof price==='object'&&price.amount!=null&&Number.isFinite(Number(price.amount))&&(/two|shared|vehicle|per car|couple/i.test(price.basis||'')||Number(price.amount)===0))return finite(price.amount);
 if(p.layers?.includes('subway'))return 24;
 if(/ice.?rink|ice.?skating/i.test(p.name||''))return 32;
 if(p.primaryLayer==='nature'||p.primaryLayer==='christmas'&&!/shop|market/i.test(p.name||''))return 0;
 if(p.layers?.includes('bowling'))return 40;
 if(p.layers?.includes('arcades'))return 25;
 if(p.layers?.includes('bargains')||p.layers?.includes('thrift')||p.layers?.includes('markets'))return 30;
 if(p.layers?.includes('dessert'))return 15;
 if(p.layers?.includes('mexican')||p.layers?.includes('asian')||p.layers?.includes('food'))return 40;
 if(p.layers?.includes('bars'))return 25;
 return 25;
}
export function addPlace(plan,p){if(plan.stops.some(s=>s.placeId===p.id))return false;plan.stops.push({id:`stop-${p.id}-${Date.now().toString(36)}`,placeId:p.id,name:p.name,address:p.address||'',cost:allowanceFor(p),time:'',note:'Planning allowance for two',priceKind:'allowance'});return true;}
export function importPlan(payload,places=[]){
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.stops)||payload.stops.length>100)throw Error('Choose an itinerary JSON file with up to 100 stops.');
 const used=new Set(),byId=new Map(places.map(p=>[p.id,p]));
 const stops=payload.stops.map((raw,i)=>{
  if(!raw||typeof raw.name!=='string'||!raw.name.trim())throw Error(`Stop ${i+1} needs a name.`);
  if(raw.cost!=null&&(!Number.isFinite(Number(raw.cost))||Number(raw.cost)<0))throw Error(`Stop ${i+1} has an invalid cost.`);
  const place=byId.get(String(raw.placeId))||matchPlace(raw.name,places,raw.address||'');
  let id=String(raw.id||`imported-${i}`).slice(0,160);while(used.has(id))id=`${id}-${i}`;used.add(id);
  let time=String(raw.time||'');const match=time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(match){let h=Number(match[1])%12+(match[3].toUpperCase()==='PM'?12:0);time=`${String(h).padStart(2,'0')}:${match[2]}`;}
  return {id,placeId:place?.id||null,name:raw.name.trim().slice(0,160),address:String(raw.address||place?.address||'').slice(0,300),cost:finite(raw.cost),time:/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'',note:String(raw.note||'').slice(0,500),priceKind:'allowance'};
 });
 const budget=finite(payload.budget,200);
 // Original exported itinerary listed $200 but its stops total $187. Preserve that $13 as reserve.
 const subtotal=stops.reduce((s,p)=>s+p.cost,0),reserve=payload.reserve!=null?finite(payload.reserve):Number(payload.total)>subtotal?Math.max(0,Number(payload.total)-subtotal):0;
 const christmas=/christmas/i.test(payload.name||'');
 return {version:1,name:String(payload.name||'Our OKC adventure').slice(0,100),budget,reserve,date:/^\d{4}-\d{2}-\d{2}$/.test(payload.date||'')?payload.date:!Object.hasOwn(payload,'date')&&christmas?'2026-12-12':'',planningNote:String(payload.planningNote|| (christmas?CHRISTMAS_PLANNING_NOTE:'')).slice(0,1500),stops};
}
export function exportPlan(plan,places=[]){const total=planTotals(plan).total,byId=new Map(places.map(p=>[p.id,p]));return {...plan,total,stops:plan.stops.map(s=>{const p=byId.get(s.placeId);return {...s,lat:p?.lat??null,lon:p?.lon??null,website:p?.website||null};})};}
export function moveStop(plan,index,delta){const next=index+delta;if(index<0||index>=plan.stops.length||next<0||next>=plan.stops.length)return false;[plan.stops[index],plan.stops[next]]=[plan.stops[next],plan.stops[index]];return true;}
export function createPreset(kind,places,budget=200){
 if(kind==='christmas')return {...defaultPlan(places),budget:finite(budget)};
 const plan={version:1,name:{arcade:'Arcade night for two',cold:'Too cold outside',west:'West-side bargain hunt',free:'Fresh air & free stops'}[kind]||'Our OKC adventure',budget:finite(budget),reserve:13,date:'',stops:[]};
 const needles={arcade:['FlashBack RetroPub','Up-Down','Bricktown Brewery'],cold:['Blue Zoo','Round1','Ollie'],west:["Ollie's",'Cactus Jack','Windsor Lanes'],free:['Route 66 Park','Lake Overholser','Stars and Stripes Park']}[kind]||[];
 for(const name of needles){const p=matchPlace(name,places);if(p)addPlace(plan,p);}
 return plan;
}
export function surprisePlan(places,{budget=200,indoor=false,hours=4,categories=[],seed=1,visited=new Set(),position={x:0,z:0}}={}){
 let s=seed>>>0;const random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
 const plan={version:1,name:'Our next OKC adventure',budget:finite(budget),reserve:Math.min(15,Math.round(finite(budget)*.08)),date:'',stops:[]};
 const candidates=places.filter(p=>p.x!=null&&p.z!=null&&!visited.has(p.id)&&(!indoor||isIndoorPlace(p))&&(!categories.length||p.layers?.some(c=>categories.includes(c)))).map(p=>({p,score:random()+Math.min(1,Math.hypot(p.x-(position.x||0),p.z-(position.z||0))/30000)})).sort((a,b)=>a.score-b.score);
 const maxStops=Math.max(1,Math.min(7,Math.floor(finite(hours,4)/1.25)));
 for(const {p}of candidates){if(plan.stops.length>=maxStops)break;const cost=allowanceFor(p);if(planTotals(plan).total+cost>plan.budget)continue;if(plan.stops.length&&p.layers?.includes('food')&&plan.stops.some(s=>places.find(v=>v.id===s.placeId)?.layers?.includes('food')))continue;addPlace(plan,p);}
 // Order nearby selections without pretending this is a turn-restricted driving route.
 let current=position;const remaining=[...plan.stops],ordered=[];while(remaining.length){remaining.sort((a,b)=>{const p=places.find(p=>p.id===a.placeId),q=places.find(p=>p.id===b.placeId);return Math.hypot(p.x-current.x,p.z-current.z)-Math.hypot(q.x-current.x,q.z-current.z);});const next=remaining.shift();ordered.push(next);current=places.find(p=>p.id===next.placeId);}
 plan.stops=ordered;return plan;
}
