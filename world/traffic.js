import * as THREE from 'three';
import { vehicleMaterials, vehicleGeometry } from './vehicles.js';
import { ROUTE_LENGTH, roadPoint, tangent } from './route.js';

const tmp = new THREE.Object3D();
const clamp = THREE.MathUtils.clamp;

export function createTraffic({group,dynamicLights}) {
  const materials=vehicleMaterials(),geometries=vehicleGeometry(),traffic=[],trafficMeshes={};
  const palette=[0xd5d4cd,0xa5a9a9,0x263643,0x526978,0x732c2c,0x343737,0xbcb7a8];
  const counts={car:20,truck:4};
  for(const [kind,count] of Object.entries(counts)){trafficMeshes[kind]={};for(const part of Object.keys(geometries[kind])){const mesh=new THREE.InstancedMesh(geometries[kind][part],materials[part],count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.name=`Traffic ${kind} ${part}`;mesh.castShadow=part==='paint';mesh.receiveShadow=part==='paint';trafficMeshes[kind][part]=mesh;group.add(mesh);}for(let i=0;i<count;i++){const lane=i%4,dir=lane<2?1:-1,offset=dir*(3.5+(lane%2)*3.5);traffic.push({kind,index:i,s:0,dir,offset,speed:lane%2===0?12.5:10.8,scale:kind==='car'&&i%7===0?new THREE.Vector3(1.04,1.16,1.04):new THREE.Vector3(1,1,1)});trafficMeshes[kind].paint.setColorAt(i,new THREE.Color(palette[i%palette.length]));}trafficMeshes[kind].paint.instanceColor.needsUpdate=true;}
  [3.5,7,-3.5,-7].forEach((offset,lane)=>{const members=traffic.filter(t=>t.offset===offset);members.forEach((t,i)=>t.s=(i/members.length+.08+lane*.054)%1);});
  let lastNight=-1;
  function update(dt,simTime,nightAmount=0,trafficSpeed=1){const night=clamp(nightAmount,0,1);if(Math.abs(night-lastNight)>.002){for(const l of dynamicLights){if(l.mat)l.mat.emissiveIntensity=l.min+night*l.max;if(l.light)l.light.intensity=night*l.max;if(l.overlay)l.overlay.opacity=night*l.max;}materials.head.emissiveIntensity=.12+night*3.5;materials.tail.emissiveIntensity=.25+night*2;lastNight=night;}for(const t of traffic){t.s=(t.s+t.dir*t.speed*dt*trafficSpeed/ROUTE_LENGTH+1)%1;const p=roadPoint(t.s,t.offset),d=tangent(t.s);tmp.position.copy(p);tmp.scale.copy(t.scale);tmp.rotation.set(0,-Math.atan2(d.z,d.x)+(t.dir===-1?Math.PI:0),0);tmp.updateMatrix();for(const m of Object.values(trafficMeshes[t.kind]))m.setMatrixAt(t.index,tmp.matrix);}for(const type of Object.values(trafficMeshes))for(const m of Object.values(type))m.instanceMatrix.needsUpdate=true;}
  update(0,0,0);
  return {update,trafficCount:traffic.length};
}
