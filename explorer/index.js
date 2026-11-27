import {getUI} from '../ui/runtime.js';
import {createGPUMap} from './gpu-map.js';
import {createExplorerController} from './controller.js';
import {createExplorerView} from './gpu-view.js';

// Stable integration adapter. Visible controls are GPU widgets; the shared UI
// runtime alone owns the native keyboard, clipboard and file-picker bridge.
export function createExplorer(options={}){
 const ui=getUI();let controller;
 const map=createGPUMap({
  onSelect:place=>controller?.selectPlace(place.id),onMove:()=>{},onView:view=>options.onMapView?.(view),
  onSelectBuilding:building=>{controller?.setBuilding(building);options.onBuildingSelect?.(building);}
 });
 controller=createExplorerController(options,{map,platform:ui.platform,notify:message=>ui.toast(message),setMode:mode=>ui.setMode(mode),onPanel:open=>{if(open)ui.cancelInputs?.('explorer');}});
 const view=createExplorerView(ui,controller,map);
 const removeModeListener=ui.onChange?.(()=>{const mode=ui.mode;if((mode==='map'||mode==='3d')&&controller.getSnapshot().mode!==mode)controller.setMode(mode);});
 const removeEscape=ui.onEscape?.(()=>{if(ui.modalOpen)return false;const state=controller.getSnapshot();if(!state.open&&state.mode!=='map')return false;controller.dispatch({type:'view.escape'});return true;});
 if(ui.mode==='map'&&!options.mapOnly)controller.setMode('map');
 const originalDestroy=controller.destroy;
 controller.destroy=()=>{removeModeListener?.();removeEscape?.();view.destroy();originalDestroy();ui.invalidate();};
 return controller;
}
