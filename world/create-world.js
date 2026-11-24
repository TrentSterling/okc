import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { WORLD_SURFACES } from '../world-surfaces.js';
import { BAKED_WORLD } from '../world-meshes.js';
import { rngFor } from './random.js';
import { ROUTE_LENGTH, roadPoint, tangent } from './route.js';
import { createBatching } from './batching.js';
import { createCityMaterials } from './materials.js';
import { addBakedMeshes } from './baked-meshes.js';
import { addLandmarks } from './landmarks.js';
import { addPlanting } from './planting.js';
import { addStreets } from './streets.js';
import { addRoadMarkings } from './road-markings.js';
import { addStreetDressing } from './street-dressing.js';
import { createTraffic } from './traffic.js';

// Geographic reconstruction in local meters, centered on Devon's mapped footprint.
// Independent named streams make visual additions local and repeatable.
export function createWorld({scene, glassMaterial, seed=42}={}) {
  const group=new THREE.Group();
  group.name='Mapped Oklahoma City / Reno Avenue';
  scene.add(group);
  const unit=new THREE.BoxGeometry(1,1,1),dynamicLights=[];
  const materials=createCityMaterials({group,seed,random:rngFor(seed,'materials'),dynamicLights});
  const {paintGeometry,bakedMaterials}=materials;
  const batching=createBatching({group,unit,chunkSize:BAKED_WORLD.chunkSize,paintGeometry});
  const {addBatch,addBox,mergePart,compactStaticGroup}=batching;
  const addPaint=(material,x,y,z,w,d,rot=0)=>addBatch(paintGeometry,material,[x,y,z],[w,1,d],rot);
  addBakedMeshes({group,unit,bakedWorld:BAKED_WORLD,bakedMaterials});
  addLandmarks({group,random:rngFor(seed,'landmarks'),addBox,mergePart,compactStaticGroup,materials});
  const planting=addPlanting({seed,addBatch});
  const poolMat=addStreets({group,seed,addBatch,addBox,addPaint,materials,dynamicLights});
  const roadMarkings=addRoadMarkings({addPaint,materials});
  const dressing=addStreetDressing({group,seed,addBatch,addBox,materials});
  batching.flush({...materials,poolMat});
  const {update,trafficCount}=createTraffic({group,dynamicLights});
  return{group,update,getRoutePoint:(s,laneOffset=0)=>roadPoint(s,5.25+laneOffset),getRouteTangent:tangent,routeLength:ROUTE_LENGTH,trafficCount,laneBase:5.25,laneSpacing:3.5,laneLimit:1.75,geoOrigin:CITY_DATA.origin,mappedBuildingCount:CITY_DATA.buildings.length,mappedRoadCount:CITY_DATA.roads.length,surfaceLayerCount:WORLD_SURFACES.layers.length,drivingBounds:WORLD_SURFACES.drivingBounds,drivingSolids:[...WORLD_SURFACES.drivingSolids,...dressing.solids],drivingRoads:CITY_DATA.roads,staticGeometryStats:BAKED_WORLD.stats,environmentStats:{planting,roadMarkings,dressing:dressing.counts}};
}
