import {initializeUI} from './ui/runtime.js';
import {createLoadingProgress} from './loading/progress.js';

const ui=await initializeUI();
let mapRequested=false,discovery;
const progress=createLoadingProgress({openMap:async()=>{mapRequested=true;try{const {discoveryReady}=await discovery;(await discoveryReady).explorer.showMap();progress.hide();}catch(error){progress.error(error);}}});
discovery=import('./discovery.js');
discovery.then(module=>module.discoveryReady).then(({manifest})=>{progress.coverage(`${manifest.counts.buildings.toLocaleString()} footprints · Yukon to downtown`);progress.complete('places','Your atlas and planner are ready');}).catch(error=>progress.error(error));
ui.canvas.addEventListener('webglcontextlost',async event=>{event.preventDefault();ui.cancelInputs('context-lost');const {mapFallback}=await discovery;await mapFallback('The graphics context was interrupted. Reload to restart the renderer.');});
try{
 if(!ui.renderer){const {mapFallback}=await discovery;await mapFallback();progress.hide();}
 else{
  const app=await import('./app.js');
  if(!await app.sceneReady){const {mapFallback}=await discovery;await mapFallback('The 3D scene could not start. Your map and planner are available.',app.sceneStartupError);}
  else{ui.setSceneReady(true);progress.complete('ready','The city is yours');if(mapRequested){const {discoveryReady}=await discovery;(await discoveryReady).explorer.showMap();}}
 }
}catch(error){console.error(error);try{const {mapFallback}=await discovery;await mapFallback('The 3D scene could not start. Your map and planner are available.',error);}catch(fallbackError){progress.error(fallbackError);}}
