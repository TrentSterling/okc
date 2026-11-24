import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { WORLD_SURFACES } from '../world-surfaces.js';
import { rngFor } from './random.js';
import { vehicleGeometry, vehicleMaterials } from './vehicles.js';
import { mergeGeometry } from './geometry.js';
import { createPlacementQueries, footprintFits, footprintsOverlap, polygonBounds,
  pointInPolygon, rectangleFootprint } from './placement.js';

const LIMITS=Object.freeze({parkedCars:36,benches:10,bins:8});
const CAR_COLORS=[0xc6bda9,0x626d72,0x33434f,0x455249,0x6d4039,0xc7c6bc,0x4d5054];

function surfaceKey(polygon) {
  const bounds=polygonBounds(polygon);
  return [bounds.minX,bounds.minZ,bounds.maxX,bounds.maxZ,polygon.outer.length].join(':');
}

function priority(polygon) {
  const bounds=polygonBounds(polygon),x=(bounds.minX+bounds.maxX)*.5,z=(bounds.minZ+bounds.maxZ)*.5;
  return Math.min(Math.hypot(x+500,z-292),Math.hypot(x+20,z+15)*1.1,Math.hypot(x,z-180)*1.1);
}

function featuredSurfaces(kind) {
  return WORLD_SURFACES.layers.find(layer=>layer.kind===kind).polygons
    .map((polygon,index)=>({polygon,index,key:surfaceKey(polygon),bounds:polygonBounds(polygon)}))
    .filter(({bounds:b})=>b.maxX>-750&&b.minX<700&&b.maxZ>-400&&b.minZ<600)
    .sort((a,b)=>priority(a.polygon)-priority(b.polygon)||a.key.localeCompare(b.key));
}

export function planStreetDressing(seed=42) {
  const queries=createPlacementQueries(),placements=[],counts={parkedCars:0,benches:0,bins:0};
  const treeFootprints=CITY_DATA.trees.map(point=>rectangleFootprint(...point,1.1,1.1));
  function available(surface,footprint,margin=.3) {
    if(!footprintFits(surface.polygon,footprint,margin)||!queries.isClear(footprint,.55))return false;
    if(placements.some(previous=>footprintsOverlap(previous.footprint,footprint,.35)))return false;
    if(treeFootprints.some(tree=>footprintsOverlap(tree,footprint,.45)))return false;
    return true;
  }
  function retain(entry) {
    placements.push(entry);
    counts[entry.kind==='parked-car'?'parkedCars':entry.kind==='bench'?'benches':'bins']++;
  }
  const parkingY=WORLD_SURFACES.layers.find(layer=>layer.kind==='parking').y;
  for(const surface of featuredSurfaces('parking')) {
    if(counts.parkedCars===LIMITS.parkedCars)break;
    const {minX,maxX,minZ,maxZ}=surface.bounds;
    if(maxX-minX<15||maxZ-minZ<15)continue;
    let stripingCount=0,lotCars=0;
    // Follow the existing 2.8 m parking stripes and 16 m row spacing. Full
    // footprints, polygon holes and both stall edges are checked separately.
    for(let x=minX+4;x<maxX-3&&stripingCount<80&&lotCars<4;x+=2.8) {
      for(let z=minZ+4;z<maxZ-3&&stripingCount<80&&lotCars<4;z+=16) {
        if(![z,z+2.5,z+5].every(v=>pointInPolygon(x,v,surface.polygon)))continue;
        stripingCount++;
        if(counts.parkedCars===LIMITS.parkedCars)break;
        const id=`parked:${surface.key}:${x.toFixed(3)}:${z.toFixed(3)}`;
        const random=rngFor(seed,id);
        if(random()>.48)continue;
        if(![z,z+2.5,z+5].every(v=>pointInPolygon(x+2.8,v,surface.polygon)))continue;
        const px=x+1.4,pz=z+2.5,yaw=(random()<.5?1:-1)*Math.PI/2;
        const footprint=rectangleFootprint(px,pz,4.95,2.25,yaw);
        if(!available(surface,footprint,.22))continue;
        retain({id,kind:'parked-car',x:px,z:pz,y:parkingY+.008,yaw,footprint,
          color:CAR_COLORS[Math.floor(random()*CAR_COLORS.length)],surfaceKind:'parking',surfaceIndex:surface.index});
        lotCars++;
      }
    }
  }
  const pavingY=WORLD_SURFACES.layers.find(layer=>layer.kind==='paving').y;
  for(const surface of featuredSurfaces('paving')) {
    if(counts.benches===LIMITS.benches)break;
    const ring=surface.polygon.outer;
    let localBenches=0;
    for(let i=0,j=ring.length-1;i<ring.length&&localBenches<2&&counts.benches<LIMITS.benches;j=i++) {
      const a=ring[j],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<8)continue;
      const random=rngFor(seed,`bench-edge:${surface.key}:${a.join(':')}:${b.join(':')}`);
      const t=.3+random()*.4,mx=a[0]+dx*t,mz=a[1]+dz*t;
      let nx=-dz/length,nz=dx/length;
      if(!pointInPolygon(mx+nx,mz+nz,surface.polygon)){nx=-nx;nz=-nz;}
      const x=mx+nx*1.8,z=mz+nz*1.8,yaw=-Math.atan2(dz,dx);
      const footprint=rectangleFootprint(x,z,2.24,.82,yaw);
      if(!available(surface,footprint,.45))continue;
      // Leave circulation room beside the bench rather than decorating a
      // path itself. Mapped paving is the only allowed furniture surface.
      if(!queries.isClear(footprint,1.1))continue;
      const id=`bench:${surface.key}:${i}`;
      retain({id,kind:'bench',x,z,y:pavingY+.008,yaw,footprint,
        surfaceKind:'paving',surfaceIndex:surface.index});
      localBenches++;
      if(counts.bins>=LIMITS.bins)continue;
      const bx=x+dx/length*2.05,bz=z+dz/length*2.05,binFootprint=rectangleFootprint(bx,bz,.66,.66,yaw);
      if(available(surface,binFootprint,.35))retain({id:id+':bin',kind:'bin',x:bx,z:bz,y:pavingY+.008,yaw,
        footprint:binFootprint,surfaceKind:'paving',surfaceIndex:surface.index});
    }
  }
  return {...counts,counts:{...counts},limits:LIMITS,placements,
    solids:placements.map(entry=>({id:entry.id,kind:entry.kind,polygon:entry.footprint,holes:[],
      bottom:entry.y,height:entry.y+({'parked-car':1.75,bench:1.15,bin:.98}[entry.kind])}))};
}

function parkedVehicleParts() {
  const source=vehicleGeometry().car,materials=vehicleMaterials();
  materials.paint.name='Parked vehicle paint';materials.paint.roughness=.43;
  materials.paint.clearcoat=.75;materials.paint.clearcoatRoughness=.2;
  const parts=[['glass',0x2c414c],['hubs',0xa1a5a3],['head',0xc0c4b8],['tail',0x6b2521]];
  const sourceParts=parts.map(([key])=>source[key].index?source[key].toNonIndexed():source[key]);
  const details=mergeGeometry(sourceParts),colors=new Float32Array(details.attributes.position.count*3);
  let offset=0;
  parts.forEach(([,hex],index)=>{
    const color=new THREE.Color(hex);
    for(let i=0;i<sourceParts[index].attributes.position.count;i++)color.toArray(colors,(offset+i)*3);
    offset+=sourceParts[index].attributes.position.count;
  });
  details.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const trim=new THREE.MeshStandardMaterial({name:'Parked glazing and trim',color:0xffffff,
    vertexColors:true,metalness:.35,roughness:.33});
  // Omit the old blob-shadow plane and emissive lamp materials. Parked cars
  // get ordinary scene shadows; body, trim, and tires need only three batches.
  return [{geometry:source.paint,material:materials.paint,tint:true},
    {geometry:details,material:trim},{geometry:source.wheels,material:materials.wheels}];
}

export function addStreetDressing({seed=42,addBatch,addBox,materials}) {
  const plan=planStreetDressing(seed),carParts=parkedVehicleParts();
  const {wood,darkSteel,steel}=materials;
  function localBox(entry,material,x,y,z,w,h,d) {
    const c=Math.cos(entry.yaw),s=Math.sin(entry.yaw);
    addBox(material,entry.x+x*c+z*s,entry.y+y,entry.z-x*s+z*c,w,h,d,entry.yaw);
  }
  for(const entry of plan.placements) {
    if(entry.kind==='parked-car') {
      for(const part of carParts)addBatch(part.geometry,part.material,[entry.x,entry.y,entry.z],
        [1,1,1],entry.yaw,part.tint?entry.color:undefined);
    }else if(entry.kind==='bench') {
      for(const z of [-.18,-.06,.06,.18])localBox(entry,wood,0,.48,z,2.05,.055,.10);
      for(const y of [.75,.90,1.05])localBox(entry,wood,0,y,.27,2.05,.10,.055);
      for(const x of [-.73,.73]) {
        localBox(entry,darkSteel,x,.25,0,.09,.48,.53);
        localBox(entry,darkSteel,x,.78,.27,.075,.62,.075);
      }
      for(const x of [-.96,.96])localBox(entry,steel,x,.72,0,.065,.055,.59);
    }else{
      localBox(entry,darkSteel,0,.45,0,.50,.88,.50);
      localBox(entry,steel,0,.91,0,.58,.065,.58);
      localBox(entry,steel,0,.14,0,.54,.045,.54);
    }
  }
  return plan;
}
