import * as THREE from 'three';
import { DEVON_CAMPUS } from './campus-data.js';
import { DEVON_DIMENSIONS } from './dimensions.js';
import { signedPlanArea, profilePoint, surfaceMesh, horizontalGeometry, addBox, addBeams } from './geometry.js';

export function addDevonAuditorium({group,roof,stone,bright}) {
  // Public architect section and plans establish the auditorium's low,
  // outward-leaning glass enclosure and interior timber room. The map ring is
  // the roof envelope; insetting the base gives the 38-foot lobby its slope
  // without pushing the facade beyond its reserved city footprint.
  const auditoriumPlan=DEVON_CAMPUS.auditorium,auditoriumCenter=new THREE.Vector3(-142.0,0,15.2),auditoriumTop=DEVON_DIMENSIONS.auditoriumTop;
  const auditoriumBase=auditoriumPlan.map(([x,z])=>[auditoriumCenter.x+(x-auditoriumCenter.x)*.88,auditoriumCenter.z+(z-auditoriumCenter.z)*.88]);
  const auditoriumGlass=new THREE.MeshPhysicalMaterial({color:0xa5b9bd,metalness:.16,roughness:.13,transparent:true,opacity:.30,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.9});
  const auditoriumFaces=[],auditoriumFrames=[],auditoriumSign=Math.sign(signedPlanArea(auditoriumPlan));
  for(let i=0;i<auditoriumPlan.length;i++) {
    const j=(i+1)%auditoriumPlan.length,a=auditoriumPlan[i],b=auditoriumPlan[j],ba=auditoriumBase[i],bb=auditoriumBase[j];
    const face=[profilePoint(ba,.25),profilePoint(a,auditoriumTop-.12),profilePoint(b,auditoriumTop-.12),profilePoint(bb,.25)];
    if(auditoriumSign<0)face.reverse();auditoriumFaces.push(face);
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    auditoriumFrames.push([profilePoint(a,auditoriumTop-.1),profilePoint(b,auditoriumTop-.1),.16,.20]);
    const count=Math.max(1,Math.ceil(length/3.0));
    for(let n=0;n<count;n++) {
      const t=(n+.5)/count,lo=[ba[0]+(bb[0]-ba[0])*t,ba[1]+(bb[1]-ba[1])*t],hi=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      auditoriumFrames.push([profilePoint(lo,.3),profilePoint(hi,auditoriumTop-.1),.09,.13]);
    }
  }
  const auditoriumWalls=surfaceMesh(auditoriumFaces,auditoriumGlass,'Mapped Devon auditorium angled glazed lobby');
  auditoriumWalls.userData.occupiedFootprint={outer:auditoriumPlan,holes:[]};auditoriumWalls.userData.topElevation=auditoriumTop;group.add(auditoriumWalls);
  const auditoriumRoof=new THREE.Mesh(horizontalGeometry(auditoriumPlan,auditoriumTop),roof);auditoriumRoof.name='Auditorium roof inside mapped envelope';auditoriumRoof.castShadow=true;group.add(auditoriumRoof);
  const auditoriumFloor=new THREE.Mesh(horizontalGeometry(auditoriumBase,.30),stone);auditoriumFloor.name='Auditorium lobby floor';group.add(auditoriumFloor);
  const timber=new THREE.MeshStandardMaterial({color:0x93714c,roughness:.78});
  addBox(group,[23.2,8.35,17.1],[-136.4,4.48,15.5],timber,'Auditorium timber performance room behind glazed lobby');
  const acousticRibs=[];
  for(let x=-147.7;x<-125.0;x+=.75)for(const z of [6.90,24.10])acousticRibs.push([new THREE.Vector3(x,.5,z),new THREE.Vector3(x,8.6,z),.055,.08]);
  addBeams(group,acousticRibs,bright,'Auditorium interior timber-panel joints');
  const auditoriumStructure=addBeams(group,auditoriumFrames,bright,'Auditorium angled curtain-wall structure');auditoriumStructure.castShadow=false;

  // The public second-level plan shows a narrow glass connector from the
  // garden wing into the auditorium's west lobby. It is elevated clear of the
  // pedestrian garden; the city collision contract records its lower bound.
  const bridge={x0:-156.2,x1:-152.6,z0:-21.1,z1:2.5,bottom:5.4,top:8.6};
  const bridgeX=(bridge.x0+bridge.x1)*.5,bridgeZ=(bridge.z0+bridge.z1)*.5,bridgeLength=bridge.z1-bridge.z0;
  addBox(group,[bridge.x1-bridge.x0,.22,bridgeLength],[bridgeX,bridge.bottom+.11,bridgeZ],bright,'Auditorium skybridge raised floor');
  addBox(group,[bridge.x1-bridge.x0,.16,bridgeLength],[bridgeX,bridge.top-.08,bridgeZ],roof,'Auditorium skybridge roof');
  const bridgeFaces=[
    [new THREE.Vector3(bridge.x0,bridge.bottom+.22,bridge.z0),new THREE.Vector3(bridge.x0,bridge.bottom+.22,bridge.z1),new THREE.Vector3(bridge.x0,bridge.top-.16,bridge.z1),new THREE.Vector3(bridge.x0,bridge.top-.16,bridge.z0)],
    [new THREE.Vector3(bridge.x1,bridge.bottom+.22,bridge.z1),new THREE.Vector3(bridge.x1,bridge.bottom+.22,bridge.z0),new THREE.Vector3(bridge.x1,bridge.top-.16,bridge.z0),new THREE.Vector3(bridge.x1,bridge.top-.16,bridge.z1)]
  ];
  group.add(surfaceMesh(bridgeFaces,auditoriumGlass,'Auditorium second-level glazed skybridge'));
  const bridgeRibs=[];
  for(let z=bridge.z0+.5;z<bridge.z1;z+=2.4)for(const x of [bridge.x0,bridge.x1])bridgeRibs.push([new THREE.Vector3(x,bridge.bottom+.22,z),new THREE.Vector3(x,bridge.top-.16,z),.06,.08]);
  const bridgeFrame=addBeams(group,bridgeRibs,bright,'Auditorium skybridge mullions');bridgeFrame.castShadow=false;

}
