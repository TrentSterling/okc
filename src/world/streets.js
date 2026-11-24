import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { WORLD_SURFACES } from '../world-surfaces.js';
import { ROAD_HEIGHT, ROAD_PAINT_HEIGHT, LOT_PAINT_HEIGHT, routeCenter, tangent, roadPoint } from './route.js';
import { canvasTexture } from './textures.js';

export function addStreets({group,addBatch,addBox,addPaint,materials,dynamicLights}) {
  const {roadPaint,yellow,steel,darkSteel,lampMat}=materials;
  // These rectangles were clipped and tested against complete road/lot
  // polygons offline. Crosswalks follow real route tangents and intersections.
  // Parking rectangles cannot cross a concavity or a hole in a mapped lot.
  for (const mark of WORLD_SURFACES.streetPaint) {
    addPaint(mark.color==='yellow'?yellow:roadPaint,mark.x,
      mark.kind==='parking'?LOT_PAINT_HEIGHT:ROAD_PAINT_HEIGHT,
      mark.z,mark.length,mark.width,mark.rotation);
  }
  const signalGreen=new THREE.MeshStandardMaterial({color:0x185436,emissive:0x3cff90,emissiveIntensity:.55});
  for(const junction of WORLD_SURFACES.streetCrossings){
    const [x,z]=junction.center,[tx,tz]=junction.tangent,angle=-Math.atan2(tz,tx);
    for(const side of [-1,1]){
      const along=-junction.width*.5-2,offset=side*12.25;
      const px=x+tx*along-tz*offset,pz=z+tz*along+tx*offset;
      addBox(steel,px,3.85,pz,.15,7.2,.15);
      const ax=px+tz*side*5.5,az=pz-tx*side*5.5;
      addBox(steel,ax,7.35,az,.16,.16,11,angle);
      const sx=px+tz*side*8,sz=pz-tx*side*8;
      // Hang the housing below the arm: matching top planes formerly left
      // overlapping steel and housing faces that flickered at shallow angles.
      addBox(steel,sx,7.275,sz,.09,.15,.09,angle);
      addBox(darkSteel,sx,6.79,sz,.32,.9,.35,angle);
      addBox(signalGreen,sx-tx*.18,6.52,sz-tz*.18,.025,.19,.19,angle);
    }
  }
  for(let x=-1450;x<1020;x+=48){const s=(x+1500)/2550,t=tangent(s);for(const side of [-1,1]){
    const p=roadPoint(s,side*12.25),arm=roadPoint(s,side*10.9),head=roadPoint(s,side*9.55);
    addBox(steel,p.x,4.6,p.z,.16,8.62,.16);
    addBox(steel,arm.x,8.85,arm.z,.12,.13,2.7,-Math.atan2(t.z,t.x));
    addBox(lampMat,head.x,8.71,head.z,.38,.14,.95,-Math.atan2(t.z,t.x));
  }}
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
