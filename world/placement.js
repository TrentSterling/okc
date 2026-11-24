// Conservative footprint queries for decorative objects. These read the saved
// map; they never change a road, building, water boundary or collision source.
import { WORLD_SURFACES } from '../world-surfaces.js';

const EPSILON = 1e-8;

export function polygonBounds(polygon) {
  const ring = polygon.outer || polygon;
  const result = {minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity};
  for (const [x,z] of ring) {
    result.minX = Math.min(result.minX,x); result.maxX = Math.max(result.maxX,x);
    result.minZ = Math.min(result.minZ,z); result.maxZ = Math.max(result.maxZ,z);
  }
  return result;
}

function boundsMeet(a,b,margin=0) {
  return a.maxX+margin>=b.minX && a.minX-margin<=b.maxX &&
    a.maxZ+margin>=b.minZ && a.minZ-margin<=b.maxZ;
}

function inRing(x,z,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[j],b=ring[i];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function pointInPolygon(x,z,polygon) {
  return inRing(x,z,polygon.outer||polygon) && !(polygon.holes||[]).some(ring=>inRing(x,z,ring));
}

function distanceToSegmentSquared(p,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
  return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dz)**2;
}

function cross(a,b,c) { return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }

function segmentDistanceSquared(a,b,c,d) {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(((abC>0&&abD<0)||(abC<0&&abD>0))&&((cdA>0&&cdB<0)||(cdA<0&&cdB>0)))return 0;
  return Math.min(distanceToSegmentSquared(a,c,d),distanceToSegmentSquared(b,c,d),
    distanceToSegmentSquared(c,a,b),distanceToSegmentSquared(d,a,b));
}

function boundariesNear(polygon,footprint,margin) {
  const bounds=polygonBounds(footprint),limit=margin*margin+EPSILON;
  for(const ring of [polygon.outer||polygon,...(polygon.holes||[])]) {
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j],b=ring[i];
      const edgeBounds={minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minZ:Math.min(a[1],b[1]),maxZ:Math.max(a[1],b[1])};
      if(!boundsMeet(bounds,edgeBounds,margin))continue;
      for(let k=0,l=footprint.length-1;k<footprint.length;l=k++) {
        if(segmentDistanceSquared(a,b,footprint[l],footprint[k])<=limit)return true;
      }
    }
  }
  return false;
}

export function footprintFits(polygon,footprint,margin=.2) {
  if(!footprint.every(([x,z])=>pointInPolygon(x,z,polygon)))return false;
  // Also reject concave incursions or a small polygon hole wholly enclosed
  // by the object; checking only the center/corners would miss those cases.
  for(const hole of polygon.holes||[])if(hole.some(([x,z])=>inRing(x,z,footprint)))return false;
  return !boundariesNear(polygon,footprint,margin);
}

export function footprintsOverlap(polygon,footprint,margin=0) {
  if(!boundsMeet(polygonBounds(polygon),polygonBounds(footprint),margin))return false;
  if(footprint.some(([x,z])=>pointInPolygon(x,z,polygon)))return true;
  if((polygon.outer||polygon).some(([x,z])=>inRing(x,z,footprint)))return true;
  return boundariesNear(polygon,footprint,margin);
}

// yaw uses Three's Y-rotation convention: local +X rotates toward -Z.
export function rectangleFootprint(x,z,length,width,yaw=0) {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return [[-length/2,-width/2],[length/2,-width/2],[length/2,width/2],[-length/2,width/2]]
    .map(([u,v])=>[x+u*c+v*s,z-u*s+v*c]);
}

function polygonIndex(polygons,cellSize=64) {
  const cells=new Map();
  for(const polygon of polygons) {
    const bounds=polygonBounds(polygon);
    for(let x=Math.floor(bounds.minX/cellSize);x<=Math.floor(bounds.maxX/cellSize);x++) {
      for(let z=Math.floor(bounds.minZ/cellSize);z<=Math.floor(bounds.maxZ/cellSize);z++) {
        const key=x+','+z;
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(polygon);
      }
    }
  }
  return bounds=>{
    const found=new Set();
    for(let x=Math.floor(bounds.minX/cellSize);x<=Math.floor(bounds.maxX/cellSize);x++) {
      for(let z=Math.floor(bounds.minZ/cellSize);z<=Math.floor(bounds.maxZ/cellSize);z++) {
        for(const polygon of cells.get(x+','+z)||[])found.add(polygon);
      }
    }
    return found;
  };
}

export function createPlacementQueries() {
  const forbidden=WORLD_SURFACES.layers.filter(layer=>['road','path','water'].includes(layer.kind))
    .flatMap(layer=>layer.polygons);
  const buildings=WORLD_SURFACES.drivingSolids.map(solid=>({outer:solid.polygon,holes:solid.holes||[]}));
  forbidden.push(...buildings);
  const nearby=polygonIndex(forbidden);
  const nearbyBuildings=polygonIndex(buildings);
  return {
    isClear(footprint,margin=.35) {
      const bounds=polygonBounds(footprint);
      const expanded={minX:bounds.minX-margin,maxX:bounds.maxX+margin,minZ:bounds.minZ-margin,maxZ:bounds.maxZ+margin};
      for(const polygon of nearby(expanded))if(footprintsOverlap(polygon,footprint,margin))return false;
      return true;
    },
    distanceToBuildings(x,z,limit=8) {
      let distance2=limit*limit;
      for(const polygon of nearbyBuildings({minX:x-limit,maxX:x+limit,minZ:z-limit,maxZ:z+limit})) {
        if(pointInPolygon(x,z,polygon))return 0;
        for(const ring of [polygon.outer,...polygon.holes])for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
          distance2=Math.min(distance2,distanceToSegmentSquared([x,z],ring[j],ring[i]));
        }
      }
      return Math.sqrt(distance2);
    }
  };
}
