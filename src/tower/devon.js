import * as THREE from 'three';
import { DEVON_CAMPUS } from './campus-data.js';
import { DEVON_DIMENSIONS } from './dimensions.js';
import { profilePoint, addBeams } from './geometry.js';
import { addDevonShaft } from './shaft.js';
import { addDevonCrown } from './crown.js';
import { addDevonCampus } from './campus.js';
import { addDevonAuditorium } from './auditorium.js';

export function createDevon({ glassMaterial } = {}) {
  const group=new THREE.Group();group.name='Devon Energy Center';
  group.userData={height:DEVON_DIMENSIONS.architecturalHeight,geographicOrigin:DEVON_CAMPUS.origin,footprintSource:'OpenStreetMap way 156035399',facadeSource:'Pickard Chilton photographs; 1.524 m glass-blade module',crownSource:'Photograph-led 34 m broad-face V; 60 ft above mechanical roof (Thornton Tomasetti); interior silver lining (MG McGrath)',dimensions:DEVON_DIMENSIONS,reconstruction:true,sourceRegister:'geo/devon-architecture-sources.json'};
  const glass=glassMaterial||new THREE.MeshPhysicalMaterial({color:0xa0bbc5,metalness:.62,roughness:.075,ior:1.52});
  const silver=new THREE.MeshStandardMaterial({color:0xb7bec1,roughness:.34,metalness:.48});
  const bright=new THREE.MeshStandardMaterial({color:0xd3d7d4,roughness:.42,metalness:.22});
  const dark=new THREE.MeshStandardMaterial({color:0x323b40,roughness:.62,metalness:.25});
  const stone=new THREE.MeshStandardMaterial({color:0xb2b4af,roughness:.86});
  const plaza=new THREE.MeshStandardMaterial({color:0xbab7aa,roughness:.95});
  const roof=new THREE.MeshStandardMaterial({color:0x909997,roughness:.82});
  const plan=DEVON_CAMPUS.tower;
  const {frameMaterial,softenFrame,spineFrames}=addDevonShaft({group,plan,glass,silver});
  const {corners,screenMaterial,screens}=addDevonCrown({group,plan,glass,bright,dark,roof,frameMaterial,softenFrame,spineFrames});
  addDevonCampus({group,plan,bright,plaza});
  addDevonAuditorium({group,roof,stone,bright});
  const spineMaterial=new THREE.MeshBasicMaterial({color:0xffbd70,toneMapped:true}),lightLines=[];
  for(const c of corners){const middle=c.channel.slice(1,3).map(i=>plan[i]);const q=[(middle[0][0]+middle[1][0])*.5,(middle[0][1]+middle[1][1])*.5];lightLines.push([profilePoint(q,8.4),profilePoint(q,239,.983),.10,.10]);}
  const spineMesh=addBeams(group,lightLines,spineMaterial,'Switchable architectural spine lighting');spineMesh.visible=false;spineMesh.castShadow=false;
  const update=(simTime=0,nightAmount=0,screenEnabled=false)=>{const night=THREE.MathUtils.clamp(nightAmount,0,1);screenMaterial.uniforms.uTime.value=simTime;screenMaterial.uniforms.uNight.value=night;screenMaterial.uniforms.uEnabled.value=screenEnabled?1:0;screens.visible=!!screenEnabled;spineMesh.visible=!!screenEnabled;spineMaterial.color.setHSL(.075+Math.sin(simTime*.045)*.015,.7,.48+night*.13);};
  return {group,update,screenMaterial,screens,height:257.2};
}
