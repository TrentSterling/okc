// A place can belong to several layers. Source tags remain available in its detail card.
export const CATEGORIES = [
 {id:'arcades',label:'Arcades',icon:'▦',color:'#8ebbed'},
 {id:'bars',label:'Bars & pubs',icon:'◒',color:'#d3a7e8'},
 {id:'bowling',label:'Bowling',icon:'⦿',color:'#bdb3fb'},
 {id:'mexican',label:'Sit-down Mexican',icon:'✹',color:'#f49d7d'},
 {id:'asian',label:'Asian & buffets',icon:'◡',color:'#ecc16d'},
 {id:'subway',label:'Subway',icon:'S',color:'#e8d85d'},
 {id:'bargains',label:'Bargains & outlets',icon:'◇',color:'#dfa1bc'},
 {id:'thrift',label:'Thrift & vintage',icon:'♧',color:'#d3b8a1'},
 {id:'markets',label:'Markets & groceries',icon:'▤',color:'#9cc99a'},
 {id:'food',label:'Food & coffee',icon:'◔',color:'#e9b790'},
 {id:'dessert',label:'Sweet stops',icon:'♡',color:'#edacb8'},
 {id:'nature',label:'Parks & water',icon:'♧',color:'#7cd0b0'},
 {id:'christmas',label:'Christmas lights',icon:'✧',color:'#f1cf87'},
 {id:'aquarium',label:'Aquariums & animals',icon:'≈',color:'#83d6de'},
 {id:'culture',label:'Art & attractions',icon:'◈',color:'#a8b3e8'},
 {id:'shopping',label:'Shopping',icon:'▱',color:'#c7b2d9'},
 {id:'everyday',label:'Everyday places',icon:'⌖',color:'#a5b5bf'},
];
export const CATEGORY_BY_ID = new Map(CATEGORIES.map(c=>[c.id,c]));
export const CATEGORY_ALIASES={arcade:'arcades',bar:'bars',buffet:'asian',discount:'bargains',outlet:'bargains',market:'markets',grocery:'markets',restaurant:'food',cafe:'food',fast_food:'food',breakfast:'food',seasonal:'christmas',garden:'nature',scenic:'nature',park:'nature',water:'nature',museum:'culture',entertainment:'culture',landmark:'culture',fuel:'everyday',parking:'everyday',hotel:'everyday',health:'everyday',education:'everyday',transit:'everyday',services:'everyday'};
export const ORIGIN = [-97.51758985376695,35.466887450817715];
const MX=111320*Math.cos(ORIGIN[1]*Math.PI/180),MZ=111132;
export const project=(lon,lat)=>({x:(lon-ORIGIN[0])*MX,z:(ORIGIN[1]-lat)*MZ});
export const unproject=(x,z)=>({lon:ORIGIN[0]+x/MX,lat:ORIGIN[1]-z/MZ});
export function safeUrl(value){if(!value)return null;try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function layerIds(place){
 const tags=place.tags||{},t=(typeof tags==='object'&&!Array.isArray(tags)?Object.entries(tags).flat().join(' '):[].concat(tags).join(' '));
 const text=`${place.name||''} ${place.category||''} ${place.categories||''} ${t} ${place.cuisine||''}`.toLowerCase(),out=new Set();
 const cat=String(place.category||'').toLowerCase();
 if(CATEGORY_ALIASES[cat])out.add(CATEGORY_ALIASES[cat]);
 if(CATEGORY_BY_ID.has(cat))out.add(cat);
 if(/subway/.test(String(place.name||'').toLowerCase())||/subway/.test(String(place.brand||'').toLowerCase()))out.add('subway');
 if(/arcade|barcade|retro.?pub|cactus jack|up.down|brickopolis|round.?1|okanaram/.test(text))out.add('arcades');
 if(/bowling|bowling_alley|bowl &|bowl and|windsor lanes|dust bowl/.test(text))out.add('bowling');
 if(/\bbar\b|\bpub\b|brewery|nightclub|tavern|taproom|cocktail/.test(text))out.add('bars');
 if(/mexican|tex.mex|taquer|carnicer|tortiller|supermercado/.test(text)){
  if(!/food.?truck|fast_food|taco bell|taco bueno|del taco|supermarket|grocery|carnicer|supermercado/.test(text))out.add('mexican');
 }
 if(/asian|buffet|chinese|vietnamese|korean|sushi|japanese|hot pot|\bpho\b|thai/.test(text))out.add('asian');
 if(/ollie|outlet|discount|liquidation|bargain|bin store|ross dress|burlington|tj.?maxx|marshalls|five below/.test(text))out.add('bargains');
 if(/thrift|vintage|antique|goodwill|salvation army|consignment|second.hand/.test(text))out.add('thrift');
 if(/market|supermarket|grocery|groceries|supermercado|carnicer|convenience/.test(text))out.add('markets');
 if(/restaurant|cafe|coffee|pizza|breakfast|food|fast_food|diner|dining|buffet|bakery/.test(text))out.add('food');
 if(/dessert|ice.?cream|gelato|candy|sweet|donut|doughnut|bakery|boba/.test(text))out.add('dessert');
 if(/\bpark\b|garden|lake|pond|refuge|picnic|trail|waterfront|sunset|nature|bird|ducks/.test(text))out.add('nature');
 if(/christmas|holiday|ice.?rink|lights on broadway/.test(text))out.add('christmas');
 if(/aquarium|blue zoo|\bzoo\b|aquatic|tropical fish|animal encounter/.test(text))out.add('aquarium');
 if(/museum|theatre|theater|cinema|\barts?\b|artwork|sculpture|historic|monument|attraction|amusement|theme.park|water.park|ferris|escape|skydiving|science/.test(text))out.add('culture');
 if(/\bshop\b|shopping|mall|store|retail|book|craft|collectible/.test(text))out.add('shopping');
 if(!out.size)out.add('everyday');
 return [...out];
}
export function normalizePlace(raw,i=0){
 const tags=raw.tags||{};
 const name=raw.name||tags.name||'Unnamed mapped place';
 let lon=Number(raw.lon??raw.lng??raw.center?.lon),lat=Number(raw.lat??raw.center?.lat);
 let x=raw.x,z=raw.z;
 if(Array.isArray(raw.p)&&raw.p.length===2&&typeof raw.p[0]==='number'){x??=raw.p[0];z??=raw.p[1];}
 if(x==null||z==null||!Number.isFinite(Number(x))||!Number.isFinite(Number(z))){if(Number.isFinite(lon)&&Number.isFinite(lat)&&lon!==0&&lat!==0)({x,z}=project(lon,lat));else{x=null;z=null;}}
 if(x!=null&&z!=null){x=Number(x);z=Number(z);if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon===0||lat===0)({lon,lat}=unproject(x,z));}
 const address=raw.address||[tags['addr:housenumber'],tags['addr:street']].filter(Boolean).join(' ');
 const p={...raw,id:String(raw.id??`place-${i}`),name:String(name),address:String(address||''),district:raw.district||tags['addr:city']||'OKC metro',x,z,lon:Number.isFinite(lon)?lon:null,lat:Number.isFinite(lat)?lat:null,tags,website:safeUrl(raw.website||tags.website||tags['contact:website']),hours:raw.hours||tags.opening_hours||'',sourceUrls:[...new Set([].concat(raw.sourceUrls||raw.sources||raw.sourceUrl||[]).map(v=>safeUrl(typeof v==='string'?v:v?.url)).filter(Boolean))]};
 p.layers=layerIds(p);
 const category=String(p.category||'').toLowerCase(),primary=CATEGORY_ALIASES[category]||(CATEGORY_BY_ID.has(category)?category:null);
 const foodSpecialty=p.layers.find(v=>['subway','mexican','asian'].includes(v));
 p.primaryLayer=primary==='food'?(foodSpecialty||'food'):primary||p.layers.find(v=>v!=='food'&&v!=='shopping')||p.layers[0];
 p.brand=String(raw.brand||tags.brand||(p.layers.includes('subway')?'Subway':''));
 p.searchText=[p.name,p.brand,p.address,p.district,p.category,...p.layers,JSON.stringify(tags)].join(' ').toLowerCase();
 return p;
}
export function placeColor(p){return CATEGORY_BY_ID.get(p?.primaryLayer||p?.layers?.[0])?.color||'#9badb8';}
export function placeIcon(p){return CATEGORY_BY_ID.get(p?.primaryLayer||p?.layers?.[0])?.icon||'⌖';}
export function navigationUrl(p){const q=p.lat!=null&&p.lon!=null?`${p.lat},${p.lon}`:`${p.name} ${p.address} Oklahoma`;return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;}
export function streetViewUrl(p){return p.lat!=null&&p.lon!=null?`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+' '+p.address+' Oklahoma')}`;}

export function priceSummary(price){if(typeof price!=='object'||!price)return String(price||'');const amount=Number(price.amount),cost=price.amount!=null&&Number.isFinite(amount)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount):'';return [price.kind==='allowance'?'Planning allowance':'',cost,price.basis,price.note||price.text].filter(Boolean).join(' · ');}
