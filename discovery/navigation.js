import {createRouterClient} from '../metro/router-client.js';
import {sampleRoute} from '../metro/road-router.js';
let router;
export function getRouter(){
  return router??=createRouterClient({url:new URL('../geo/metro/network.json',import.meta.url),gzipUrl:new URL('../geo/metro/network.json.gz',import.meta.url)});
}
const tourSignature=stops=>JSON.stringify((stops||[]).map(stop=>[stop.stopId||stop.id,stop.id,stop.x,stop.z,stop.itineraryIndex]));
export function createNavigation({getExplorer,getBridge,getPosition,setPosition,getPlaces,routerProvider=getRouter}){
  let tour=null,mission=null,request=0;
  function stopTour(){request++;if(tour)tour.paused=true;getBridge()?.pauseTour();getExplorer()?.setTourState({playing:false});}
  function cancelTour(){stopTour();tour=null;getExplorer()?.setRoadRoute(null);getBridge()?.setRoute(null);getExplorer()?.setTourState({index:-1,playing:false,finished:false});}
  async function planRoute(place){
    if(!Number.isFinite(place?.x)||!Number.isFinite(place?.z))throw Error('This venue has no verified map coordinate yet. Its address and website are available.');
    const route=await routerProvider().route(getPosition(),place);
    if(!route.ok)throw Error(route.error);return route;
  }
  function showRoute(route,place){getExplorer().setRoadRoute({...route,distance:route.meters});getBridge()?.setRoute(route,place);}
  async function navigate(place){
    cancelTour();const ticket=++request,explorer=getExplorer();explorer.notify('Finding a connected road approach…');
    try{
      const route=await planRoute(place);if(ticket!==request)return;showRoute(route,place);
      const bridge=getBridge();
      if(bridge){await bridge.navigate(place,route,{isCurrent:()=>ticket===request});if(ticket!==request)return;setPosition(bridge.getPosition());}
      else{explorer.showMap();explorer.notify(`${(route.meters/1609.344).toFixed(1)} mapped road miles. Start a virtual tour to follow your itinerary.`);}
      explorer.update(getPosition());
    }catch(error){if(ticket===request)explorer.notify(error.message);}
  }
  async function tourCommand({stops=[],index=0,action}){
    if(action==='pause'){stopTour();return;}
    if(action==='cancel'){cancelTour();return;}
    const signature=tourSignature(stops),explorer=getExplorer();
    if(action==='resume'&&tour&&index===tour.index&&signature===tour.signature){
      if(tour.meters>=tour.route.meters){explorer.notify('You have arrived at this stop. Choose another stop to continue.');explorer.setTourState({playing:false,finished:true});return;}
      const pose=sampleRoute(tour.route,tour.meters),position=getPosition();
      if(pose&&Math.hypot(position.x-pose.x,position.z-pose.z)<25){
        request++;tour.paused=false;explorer.setTourState({index:tour.index,playing:true,finished:false});return;
      }
      // Manual driving moved away from the paused route. Plan from here.
    }
    stopTour();tour=null;const ticket=++request,stop=stops[index];if(!stop)return;
    explorer.setTourState({playing:false,finished:false});explorer.notify('Preparing the virtual road tour…');
    try{
      const route=await planRoute(stop);if(ticket!==request)return;
      showRoute(route,stop);
      const bridge=getBridge();if(bridge)await bridge.beginTour(route,stop,{isCurrent:()=>ticket===request});if(ticket!==request)return;
      tour={stops:stops.map(s=>({...s})),signature,index,route,meters:0,paused:false,speed:28};
      explorer.showMap();explorer.setTourStep(index);explorer.setTourState({index,playing:true,finished:false});
      explorer.notify(`Touring to ${stop.name}. Use Next stop to continue through your itinerary.`);
    }catch(error){if(ticket===request)explorer.notify(error.message);}
  }
  function setMode(mode){
    const explorer=getExplorer();
    if(mode==='3d'){if(!getBridge()){queueMicrotask(()=>explorer.showMap());explorer.notify('3D is unavailable here. Your atlas, places and planner still work.');}return;}
    if(mode==='map')return;
    if(mode==='cancel'){cancelTour();mission=null;explorer.setMission({});return;}
    if(mode==='resume'){
      if(mission){explorer.hide();if(getBridge())explorer.setMode('3d');else explorer.showMap();}
      return;
    }
    cancelTour();
    const position=getPosition(),places=getPlaces();
    const candidates=places.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&!/school|kindergarten/.test(p.category||'')&&Math.hypot(p.x-position.x,p.z-position.z)>300&&Math.hypot(p.x-position.x,p.z-position.z)<7000);
    const target=candidates[Math.floor(Math.random()*candidates.length)];if(!target){explorer.notify('No nearby challenge destination is available. Try another part of the map.');return;}
    mission={mode,target};const titles={delivery:'Pizza delivery',taxi:'Taxi pickup',quiz:'Find it without GPS',photographer:'Photo expedition'};
    explorer.setMission({title:titles[mode]||'City challenge',description:mode==='quiz'?`Find ${target.name} using the street grid. The destination pin stays hidden until you reveal the place.`:mode==='photographer'?`Visit ${target.name}, then use Photo to save a view.`:`Reach ${target.name}. Learn the approach using its address and road names.`,target:`${target.name} · ${target.address||target.district}`,distance:Math.round(Math.hypot(target.x-position.x,target.z-position.z))});
    if(mode!=='quiz')explorer.selectPlace(target.id);explorer.show('learn');
  }
  function update(dt){
    const explorer=getExplorer(),bridge=getBridge();
    if(tour&&!tour.paused){
      tour.meters=Math.min(tour.route.meters,tour.meters+Math.max(0,dt)*tour.speed);
      const pose=sampleRoute(tour.route,tour.meters);
      if(pose){const leg=tour.route.legs.filter(l=>l.pointIndex<=pose.segment).at(-1);setPosition({...getPosition(),...pose,street:leg?.name||'Mapped road'});bridge?.moveTour(pose);
        if(pose.finished){tour.paused=true;bridge?.pauseTour();explorer.setTourState({playing:false,finished:true});explorer.notify(`Arrived near ${tour.stops[tour.index].name}. Use Next stop when you're ready.`);}}
    }else if(bridge)setPosition(bridge.getPosition());
    if(mission){const position=getPosition(),distance=Math.hypot(mission.target.x-position.x,mission.target.z-position.z);
      if(distance<95){const completed=mission;mission=null;explorer.setMission({title:'Location found',description:`You reached ${completed.target.name}. Start another challenge to learn a different part of OKC.`,target:completed.target.address,distance:0});explorer.notify('Destination found. Another piece of OKC learned.');}}
  }
  return {navigate,tourCommand,setMode,update,stopTour,dispose(){stopTour();if(routerProvider===getRouter){router?.dispose();router=null;}}};
}
