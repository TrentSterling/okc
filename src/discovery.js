import {createExplorer} from './explorer/index.js';
import {loadMetroAsset,disposeAssetLoader} from './loading/asset-client.js';
import {reportLoad} from './metro/download.js';
import {createNavigation,getRouter} from './discovery/navigation.js';
import {createMapTileLoader} from './discovery/map-tiles.js';
import {getUI} from './ui/runtime.js';
export {getRouter};
let explorer,sceneBridge=null,mapTiles=null,places=[];
let position={x:-565,z:299,heading:0,street:'Reno Avenue',district:'Downtown'};
let frameId=0,lastTick=0,lastUI=0;
export let discoveryData=null;
const navigation=createNavigation({getExplorer:()=>explorer,getBridge:()=>sceneBridge,getPosition:()=>position,setPosition:p=>{position=p;},getPlaces:()=>places});
function frame(now){
  const dt=document.hidden?0:Math.min((now-lastTick)/1000||0,.08);lastTick=now;
  navigation.update(dt);
  if(now-lastUI>300&&!document.hidden){lastUI=now;explorer?.update(position);}
  frameId=requestAnimationFrame(frame);
}
export const discoveryReady=(async()=>{
  reportLoad('places','Finding your next favorite place');
  const [manifest,overview,poiData]=await Promise.all(['manifest','overview','pois'].map(name=>loadMetroAsset(name)));
  places=poiData.pois||poiData.places||poiData;discoveryData={manifest,overview,places};
  explorer=createExplorer({places,mapData:overview,getPosition:()=>position,
    onNavigate:navigation.navigate,onTour:navigation.tourCommand,onMode:navigation.setMode,
    onFocus:p=>sceneBridge?.focus(p),onLayers:layers=>sceneBridge?.layers(layers),
    onSeason:season=>sceneBridge?.season(season),onWeather:weather=>sceneBridge?.weather(weather),onQuality:quality=>sceneBridge?.quality(quality),
    onMapView:view=>mapTiles?.update(view),onBuildingSelect:building=>explorer.setBuilding(building),
    onInspect:async p=>{if(!sceneBridge){explorer.showMap();explorer.notify('Zoom into the map and select a footprint to inspect its source and save corrections.');return;}
      try{const building=await sceneBridge.inspect(p);if(building)explorer.setBuilding(building);else explorer.notify('No footprint is linked to this spot.');}catch(error){explorer.notify(error.message);}},
    onBuildingOverride:async override=>{mapTiles?.refresh();await sceneBridge?.override(override);}
  });
  mapTiles=createMapTileLoader(manifest,buildings=>{const overrides=explorer.overrides;explorer.setMapBuildings(buildings.map(building=>({...building,...overrides[building.id]})));},error=>explorer.notify(error.message));
  reportLoad('places','The city atlas is ready',{complete:true});frameId=requestAnimationFrame(frame);
  return {explorer,...discoveryData};
})();
export async function attachSceneBridge(bridge){
  sceneBridge=bridge;const {explorer}=await discoveryReady,s=explorer.settings;
  bridge.season(s.season);bridge.weather(s.weather);bridge.quality(s.quality);
  bridge.layers({labels:s.labels,buildings:s.buildings,roads:s.roads,water:s.water,parks:s.parks,visiblePlaceIds:explorer.visiblePlaces.map(p=>p.id)});
  return explorer;
}
export async function mapFallback(message,error=null){
  sceneBridge=null;const {explorer}=await discoveryReady;
  const ui=getUI();ui.setSceneReady(false);explorer.showMap();
  ui.toast([message||'3D is unavailable in this browser. The map and adventure planner are ready.',error?.message].filter(Boolean).join(' '));
}
export function stopTour(){navigation.stopTour();}
window.addEventListener('pagehide',event=>{if(event.persisted){navigation.stopTour();return;}cancelAnimationFrame(frameId);navigation.dispose();mapTiles?.dispose();disposeAssetLoader();});
