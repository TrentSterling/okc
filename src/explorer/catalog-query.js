// Catalog filtering is shared by the list, map and 3D labels. Cache each query
// so a planner edit does not sort the whole catalog three times in one frame.
export const FAVORITE_LAYERS=['arcades','bars','bowling','mexican','asian','subway','bargains','thrift','markets','dessert','nature','christmas','aquarium','culture'];
const INDOOR_LAYERS=['arcades','bowling','mexican','asian','subway','bargains','thrift','markets','food','dessert','aquarium','shopping'];
export function isIndoorPlace(place){return place.indoor===true||(place.indoor!==false&&place.layers?.some(c=>INDOOR_LAYERS.includes(c)));}
export function createCatalogQuery(){
 let previousPlaces,previousKey,previousResult=[];
 return function queryCatalog(places,{query='',chain='',filter='favorites',activeCategories,onlySaved=false,indoor=false,memories={},revision=0}){
  const q=query.trim().toLowerCase(),key=JSON.stringify([q,chain,filter,[...activeCategories].sort(),onlySaved,indoor,revision]);
  if(places===previousPlaces&&key===previousKey)return previousResult;
  const words=q.split(/\s+/).filter(Boolean);
  const result=places.filter(p=>{
   if(words.some(word=>!p.searchText.includes(word)))return false;
   if(chain&&p.brand!==chain)return false;
   if(!p.layers.some(c=>activeCategories.has(c)))return false;
   if(onlySaved&&!memories[p.id]?.favorite&&!memories[p.id]?.status)return false;
   if(indoor&&!isIndoorPlace(p))return false;
   // A text search covers all enabled places unless a category is explicit.
   if(filter==='favorites'&&!q&&!chain&&!p.layers.some(c=>FAVORITE_LAYERS.includes(c)))return false;
   return ['all','favorites'].includes(filter)||p.layers.includes(filter);
  }).sort((a,b)=>{
   const favorite=Number(!!memories[b.id]?.favorite)-Number(!!memories[a.id]?.favorite);if(favorite)return favorite;
   if(q){const prefix=Number(b.name.toLowerCase().startsWith(q))-Number(a.name.toLowerCase().startsWith(q));if(prefix)return prefix;}
   return Number(!!b.curated)-Number(!!a.curated)||a.name.localeCompare(b.name);
  });
  previousPlaces=places;previousKey=key;previousResult=result;return result;
 };
}
