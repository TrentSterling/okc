import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { WORLD_SURFACES } from '../world-surfaces.js';
import { ROAD_HEIGHT, ROAD_PAINT_HEIGHT, LOT_PAINT_HEIGHT, routeCenter, tangent, roadPoint } from './route.js';
import { inPoly } from './geometry.js';
import { canvasTexture } from './textures.js';

export function addStreets({group,addBatch,addBox,addPaint,materials,dynamicLights}) {
  const {roadPaint,yellow,steel,darkSteel,lampMat}=materials;
  // Continuous at-grade markings, with gaps and crosswalks at actual junctions.
  const junctions=[];
  for(const r of CITY_DATA.roads){if(r.name.includes('Reno')||r.kind==='service')continue;for(let i=0;i<r.p.length-1;i++){const a=r.p[i],b=r.p[i+1];if(Math.abs(b[1]-a[1])<Math.abs(b[0]-a[0])||Math.abs(b[1]-a[1])<1)continue;const z=292;if((a[1]-z)*(b[1]-z)<=0){const x=a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);if(x>-1470&&x<1020&&!junctions.some(v=>Math.abs(v.x-x)<32))junctions.push({x,name:r.name,w:r.w});}}}
  for(let i=0;i<260;i++){const s=(i+.5)/260,p=routeCenter(s),near=junctions.some(v=>Math.abs(v.x-p.x)<15);if(near)continue;const t=tangent(s),angle=-Math.atan2(t.z,t.x);for(const off of [-.18,.18]){const q=roadPoint(s,off);addPaint(yellow,q.x,ROAD_PAINT_HEIGHT,q.z,8,.10,angle);}for(const off of [-5.25,5.25]){const q=roadPoint(s,off);addPaint(roadPaint,q.x,ROAD_PAINT_HEIGHT,q.z,3.2,.13,angle);}}
  const signalRed=new THREE.MeshStandardMaterial({color:0x5b1010,emissive:0xff321b,emissiveIntensity:.45}),signalGreen=new THREE.MeshStandardMaterial({color:0x185436,emissive:0x3cff90,emissiveIntensity:.55});
  for(const j of junctions){for(const side of [-1,1]){const x=j.x+side*(j.w*.5+3);for(let z=-9;z<10;z+=1.7)addPaint(roadPaint,x,ROAD_PAINT_HEIGHT,292+z,2.8,.70);addBox(steel,j.x-10,3.6,292+side*13,.13,7.2,.13);addBox(steel,j.x-10,7.05,292+side*7,.16,.16,12);addBox(darkSteel,j.x-10,6.7,292+side*5,.32,.9,.35);addBox(signalGreen,j.x-10.18,6.4,292+side*5,.025,.19,.19);}}
  for(let x=-1450;x<1020;x+=48){const s=(x+1500)/2550,p=routeCenter(s);for(const side of [-1,1]){addBox(steel,p.x,4.4,p.z+side*12.5,.13,8.6,.13);addBox(steel,p.x,8.65,p.z+side*11.2,.12,.13,2.7);addBox(lampMat,p.x,8.51,p.z+side*9.9,.38,.14,.95);}}
  // A restrained amount of lot striping on mapped parking surfaces.
  const parkingSurfaces=WORLD_SURFACES.layers.find(l=>l.kind==='parking').polygons;
  for(const surface of parkingSurfaces){const p=surface.outer,xs=p.map(p=>p[0]),zs=p.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);if(xmax-xmin<15||zmax-zmin<15)continue;let count=0;
    const contains=(x,z)=>inPoly(x,z,p)&&!surface.holes.some(h=>inPoly(x,z,h));
    for(let x=xmin+4;x<xmax-3&&count<80;x+=2.8)for(let z=zmin+4;z<zmax-3&&count<80;z+=16){if(contains(x,z)&&contains(x,z+2.5)&&contains(x,z+5)){addPaint(roadPaint,x,LOT_PAINT_HEIGHT,z+2.5,.08,5);count++;}}
  }
  // Eight bounded, non-shadow-casting lamps illuminate the critical approach.
  // PointLight intensity is candela: the former28cd contributed under0.5lux at
  // roadheight, so the lamp looked bright while the surface stayed nearlyblack.
  for(const x of [-682,-634,-586,-538,-490,-442,-394,-346]){const s=(x+1500)/2550,p=routeCenter(s);const light=new THREE.PointLight(0xffddb1,0,72,2);light.position.set(x,8.5,p.z+9.9);light.castShadow=false;group.add(light);dynamicLights.push({light,max:1850});}
  // Distant lamps use a soft, ground-only pool approximation. This preserves
  // visible pavement beyond the eight real lights without a per-lamp shader
  // loop for the entire2.55km road. Daylight makes these overlays fullyclear.
  const poolMap=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,w*.5);g.addColorStop(0,'rgba(255,226,179,1)');g.addColorStop(.32,'rgba(255,226,179,.55)');g.addColorStop(.7,'rgba(255,226,179,.12)');g.addColorStop(1,'rgba(255,226,179,0)');c.fillStyle=g;c.fillRect(0,0,w,h);},false);
  const poolMat=new THREE.MeshBasicMaterial({map:poolMap,color:0xffdfa9,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:true,polygonOffset:true,polygonOffsetFactor:-1});
  const poolGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  for(let x=-1450;x<1020;x+=48){if(x>-750&&x<-300)continue;const p=routeCenter((x+1500)/2550);for(const side of [-1,1])addBatch(poolGeo,poolMat,[p.x,ROAD_HEIGHT+.036,p.z+side*7.8],[42,1,26]);}
  dynamicLights.push({overlay:poolMat,max:.28});
  return poolMat;
}
