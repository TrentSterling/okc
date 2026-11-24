import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';

export const ROAD_HEIGHT = .14, ROAD_PAINT_HEIGHT = .152, LOT_PAINT_HEIGHT = .052;
export const ROUTE_LENGTH = CITY_DATA.route.reduce((sum,p,i,a)=>i?sum+Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0,0);
const clamp = THREE.MathUtils.clamp;

export function routeCenter(s) {
  s = clamp(s, 0, 1);
  const f=s*(CITY_DATA.route.length-1),i=Math.min(CITY_DATA.route.length-2,Math.floor(f)),t=f-i;
  const a=CITY_DATA.route[i],b=CITY_DATA.route[i+1];
  return new THREE.Vector3(a[0]+(b[0]-a[0])*t,ROAD_HEIGHT,a[1]+(b[1]-a[1])*t);
}
export function tangent(s) { return routeCenter(Math.min(1, s + .0001)).sub(routeCenter(Math.max(0, s - .0001))).normalize(); }
export function roadPoint(s, offset = 0) { const p = routeCenter(s), t = tangent(s); return p.add(new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(offset)); }
