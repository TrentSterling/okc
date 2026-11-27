import {createLoadingProgress} from './loading/progress.js';
const progress=createLoadingProgress();
const discovery=import('./discovery.js');
let mapRequested=false;
document.getElementById('openMapEarly').addEventListener('click',async()=>{
  mapRequested=true;progress.status.textContent='Opening the city atlas…';
  try{const {discoveryReady}=await discovery;const {explorer}=await discoveryReady;explorer.showMap();progress.loading.hidden=true;}
  catch(error){progress.error(error);}
});
document.getElementById('retryLoad').addEventListener('click',()=>location.reload());
discovery.then(module=>module.discoveryReady).then(({manifest})=>{
  document.getElementById('loadingCoverage').textContent=`${manifest.counts.buildings.toLocaleString()} footprints · Yukon to downtown`;
  progress.complete('places','Your atlas and planner are ready');
}).catch(error=>progress.error(error));
// Reuse the scene context when Three starts. Unsupported browsers never download 3D geometry.
let supports3D=false;
try{supports3D=!!document.getElementById('scene').getContext('webgl2',{antialias:true,alpha:false,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});}catch{}
document.getElementById('scene').addEventListener('webglcontextlost',async event=>{
  event.preventDefault();
  const {mapFallback}=await discovery;await mapFallback('The graphics context was interrupted. Your atlas and saved plans are available; reload to restart 3D.');
});
try{
  if(!supports3D){const {mapFallback}=await discovery;await mapFallback();}
  else{
    const app=await import('./app.js');
    if(!await app.sceneReady){const {mapFallback}=await discovery;await mapFallback('The 3D scene could not start. Your map and planner are available.',app.sceneStartupError);}
    else{progress.complete('ready','The city is yours');progress.loading.hidden=true;if(mapRequested){const {discoveryReady}=await discovery;(await discoveryReady).explorer.showMap();}}
  }
}catch(error){
  console.error(error);
  try{const {mapFallback}=await discovery;await mapFallback('The 3D scene could not start. Your map and planner are available.',error);}
  catch(fallbackError){progress.error(fallbackError);}
}
