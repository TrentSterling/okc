import {loadAsset} from '../loading/asset-client.js';

// Close atlas views load footprints through a bounded queue and a small LRU.
// Retained in-flight jobs may finish after another pan and still fill that view.
export function createMapTileLoader(manifest,onBuildings,onError=()=>{},{load=loadAsset}={}){
  const available=new Map(manifest.tiles.map(tile=>[tile.id,tile])),cache=new Map(),pending=new Map();
  const size=manifest.tileSize||512;
  let wanted=[],wantedIds=new Set(),dead=false;
  function publish(){
    if(dead)return;const seen=new Set(),buildings=[];
    for(const id of wanted)for(const b of cache.get(id)?.buildings||[]){if(!seen.has(b.id)){seen.add(b.id);buildings.push(b);}}
    onBuildings(buildings);
  }
  function cancelOutside(ids){for(const [id,job]of pending)if(!ids.has(id)){job.controller.abort();pending.delete(id);}}
  function pump(){
    if(dead)return;
    for(const id of wanted){
      if(pending.size>=2)break;
      const tile=available.get(id);if(!tile||cache.has(id)||pending.has(id))continue;
      const controller=new AbortController();pending.set(id,{controller});
      const url=new URL(`../geo/metro/${tile.gzipUrl||tile.url}`,import.meta.url);
      Promise.resolve().then(()=>load(url,{gzip:!!tile.gzipUrl,fallbackURL:tile.gzipUrl?new URL(`../geo/metro/${tile.url}`,import.meta.url):null,signal:controller.signal,label:'Loading nearby footprints'}))
        .then(raw=>{
          if(dead||controller.signal.aborted)return;
          cache.delete(id);cache.set(id,{buildings:Array.isArray(raw.buildings)?raw.buildings:[]});
          while(cache.size>64){const victim=[...cache.keys()].find(key=>!wantedIds.has(key));if(!victim)break;cache.delete(victim);}
          if(wantedIds.has(id))publish();
        })
        .catch(error=>{if(!dead&&!controller.signal.aborted){available.delete(id);onError(error);}})
        .finally(()=>{if(pending.get(id)?.controller===controller)pending.delete(id);pump();});
    }
  }
  return {update(view){
    if(dead)return;
    if(!view.visible||view.scale<.18||view.layers?.buildings===false){wanted=[];wantedIds.clear();cancelOutside(wantedIds);publish();return;}
    const b=view.bounds,cx=view.center.x,cz=view.center.z,candidates=[];
    for(let x=Math.floor(b.minX/size);x<=Math.floor(b.maxX/size);x++)for(let z=Math.floor(b.minZ/size);z<=Math.floor(b.maxZ/size);z++){
      const id=`${x}_${z}`;if(available.has(id))candidates.push({id,d:Math.hypot((x+.5)*size-cx,(z+.5)*size-cz)});
    }
    const next=candidates.sort((a,b)=>a.d-b.d).slice(0,48).map(v=>v.id);
    if(next.join(',')===wanted.join(','))return;
    wanted=next;wantedIds=new Set(wanted);cancelOutside(wantedIds);
    // Touch visible cached tiles so a recently revisited neighborhood stays warm.
    for(const id of wanted){const tile=cache.get(id);if(tile){cache.delete(id);cache.set(id,tile);}}
    publish();pump();
  },refresh:publish,dispose(){dead=true;cancelOutside(new Set());cache.clear();},get stats(){return {cached:cache.size,pending:pending.size,visible:wanted.length};}};
}
