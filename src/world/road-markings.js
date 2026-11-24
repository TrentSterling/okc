import { CITY_DATA } from '../city-data.js';
import { ROAD_PAINT_HEIGHT } from './route.js';

const CELL = 64;
const CORE = [-900, -650, 650, 700];
const MAX_MARKS = 8000;
const distanceToSegment = (x, z, s) => {
  const t = Math.max(0, Math.min(1, ((x-s.ax)*s.dx+(z-s.az)*s.dz)/(s.length*s.length)));
  return Math.hypot(x-s.ax-s.dx*t, z-s.az-s.dz*t);
};

// Lane counts and one-way flags come from the saved map. Markings themselves
// are illustrative, not a surveyed traffic-control plan. Keep intersections
// open and omit service roads, short links and the separately authored Reno.
export function buildRoadMarkings(roads, bounds = CORE) {
  const segments = [], grid = new Map(), marks = [];
  const [left, north, right, south] = bounds;
  for (const road of [...roads].sort((a,b)=>String(a.id).localeCompare(String(b.id)))) {
    for (let i=1;i<road.p.length;i++) {
      const [ax,az]=road.p[i-1], [bx,bz]=road.p[i], dx=bx-ax, dz=bz-az;
      const length=Math.hypot(dx,dz);
      if(length<.1)continue;
      const s={road,ax,az,bx,bz,dx,dz,length,ux:dx/length,uz:dz/length};
      segments.push(s);
      const padding=road.w*.5+8;
      for(let ix=Math.floor((Math.min(ax,bx)-padding)/CELL);ix<=Math.floor((Math.max(ax,bx)+padding)/CELL);ix++) {
        for(let iz=Math.floor((Math.min(az,bz)-padding)/CELL);iz<=Math.floor((Math.max(az,bz)+padding)/CELL);iz++) {
          const key=ix+':'+iz;
          if(!grid.has(key))grid.set(key,[]);
          grid.get(key).push(s);
        }
      }
    }
  }
  function junctionClear(x,z,s) {
    const nearby=grid.get(Math.floor(x/CELL)+':'+Math.floor(z/CELL))||[];
    return !nearby.some(other=>other!==s && Math.abs(s.ux*other.ux+s.uz*other.uz)<.92 &&
      distanceToSegment(x,z,other)<other.road.w*.5+5);
  }
  function add(s, along, offset, length, width, color) {
    const x=s.ax+s.ux*along-s.uz*offset, z=s.az+s.uz*along+s.ux*offset;
    if(x<left||x>right||z<north||z>south||marks.length>=MAX_MARKS)return;
    // Check both ends: a center-only test can leave paint crossing a junction.
    for(const t of [-length*.5,0,length*.5])if(!junctionClear(x+s.ux*t,z+s.uz*t,s))return;
    marks.push({roadId:s.road.id,x,z,length,width,rotation:-Math.atan2(s.dz,s.dx),color});
  }
  for(const s of segments) {
    const r=s.road, lanes=Math.max(1,Math.min(6,Math.round(r.lanes||1)));
    if(r.name?.includes('Reno')||r.kind==='service'||r.kind?.endsWith('_link')||lanes<2||s.length<14||r.w<6)continue;
    const laneWidth=Math.min(3.65,(r.w-1.2)/lanes);
    if(laneWidth<2.4)continue;
    if(!r.oneway) {
      // Continuous short segments share endpoints, and stop before junctions.
      for(let along=4;along<s.length-4;along+=4) {
        const length=Math.min(4,s.length-4-along);
        if(length<1)continue;
        for(const offset of [-.13,.13])add(s,along+length*.5,offset,length,.09,'yellow');
      }
    }
    // Avoid guessing the directional split of an odd-count two-way road.
    if(!r.oneway&&lanes%2!==0)continue;
    for(let lane=1;lane<lanes;lane++) {
      if(!r.oneway&&lane===lanes/2)continue;
      const offset=(lane-lanes/2)*laneWidth;
      for(let along=7;along<s.length-5;along+=10)add(s,along,offset,3.2,.11,'white');
    }
  }
  return marks;
}

export function addRoadMarkings({addPaint, materials}) {
  const marks=buildRoadMarkings(CITY_DATA.roads);
  for(const m of marks)addPaint(m.color==='yellow'?materials.yellow:materials.roadPaint,
    m.x,ROAD_PAINT_HEIGHT,m.z,m.length,m.width,m.rotation);
  return {count:marks.length,roads:new Set(marks.map(m=>m.roadId)).size};
}
