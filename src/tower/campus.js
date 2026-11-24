import * as THREE from 'three';
import { DEVON_CAMPUS } from './campus-data.js';
import { DEVON_DIMENSIONS } from './dimensions.js';
import { addMappedVolume, perimeterMembers, addBeams, addBox } from './geometry.js';

const TAU=Math.PI*2;

export function addDevonCampus({group,plan,bright,plaza}) {
  // Ground-level massing now follows the actual connected campus footprints.
  // The rotunda is northwest of the shaft; the long garden wing extends west.
  for(const polygon of DEVON_CAMPUS.plaza)addMappedVolume(group,polygon,.15,plaza,plaza,'Campus paving at mapped building perimeter',.02);
  const podiumGlass=new THREE.MeshPhysicalMaterial({color:0x8eabb2,metalness:.36,roughness:.18,envMapIntensity:.85});
  const gardenRoof=new THREE.MeshStandardMaterial({name:'Planted garden-wing roof',color:0x687451,roughness:1});
  const campusWallOwners=[{polygon:plan,bottom:.6,top:DEVON_DIMENSIONS.architecturalHeight}];
  const rotundaOwner={polygon:DEVON_CAMPUS.rotunda,bottom:.25,top:DEVON_DIMENSIONS.rotundaTop};
  const podiumFrames=[];
  for(const polygon of DEVON_CAMPUS.podium) {
    const volume=addMappedVolume(group,polygon,DEVON_DIMENSIONS.podiumTop-.25,podiumGlass,gardenRoof,'Mapped five-story Devon garden wing',.25,campusWallOwners);
    if(!volume)continue;
    volume.userData.occupiedFootprint=polygon;volume.userData.topElevation=DEVON_DIMENSIONS.podiumTop;
    // Frames obey all joined volumes, including the later-built rotunda.
    // This removes the old complete perimeter grid inside the atrium.
    podiumFrames.push(...perimeterMembers(polygon,.3,23.9,[...campusWallOwners,rotundaOwner],[4.8,9.6,14.4,19.2,23.9],3.048,.16,.22));
    campusWallOwners.push({polygon,bottom:.25,top:DEVON_DIMENSIONS.podiumTop});
  }
  const podiumFrame=addBeams(group,podiumFrames,bright,'Podium exposed floor bands and silver curtain wall');podiumFrame.castShadow=false;

  const rotundaCenter=new THREE.Vector3(-38.194,0,-23.399),rotundaTop=DEVON_DIMENSIONS.rotundaTop;
  const rotundaGlass=new THREE.MeshPhysicalMaterial({color:0xa8c4c7,metalness:.12,roughness:.12,transparent:true,opacity:.34,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.8});
  const rotundaVolume=addMappedVolume(group,DEVON_CAMPUS.rotunda,rotundaTop-.25,rotundaGlass,rotundaGlass,'Mapped six-story glazed entrance rotunda',.25,campusWallOwners);
  rotundaVolume.userData.occupiedFootprint={outer:DEVON_CAMPUS.rotunda,holes:[]};rotundaVolume.userData.topElevation=rotundaTop;
  const atriumLevels=[5.8,11.6,17.4,23.2,29.0];
  const atriumRibs=perimeterMembers(DEVON_CAMPUS.rotunda,.4,rotundaTop-.10,campusWallOwners,[1,...atriumLevels,34.8,rotundaTop-.10],2.9,.12,.17);
  // The inset balcony outline follows the mapped lobes, not an independent
  // full circle extending through adjoining buildings. The central atrium is
  // left open all the way to its glazed roof. Slab spacing is illustrative.
  // Offline 0.45 m polygon inset; radial scaling would cross two concave map notches.
  const balconyOuter=[[-35.228084,-5.667508],[-35.031942,-5.731687],[-31.026838,-7.041029],[-28.198258,-8.734667],[-25.914693,-10.619],[-25.68663,-10.619],[-26.152817,-13.145484],[-23.115465,-18.3545],[-20.89464,-18.879515],[-21.302412,-19.670913],[-20.742248,-24.279329],[-21.640902,-24.117879],[-22.433525,-28.742427],[-23.809997,-31.94771],[-25.853252,-34.921748],[-28.920788,-37.497861],[-28.020687,-38.666179],[-30.428432,-40.135213],[-33.732612,-41.174086],[-37.413394,-41.555666],[-41.032652,-41.348236],[-44.293224,-40.513116],[-47.128637,-39.150656],[-46.315518,-37.894437],[-49.497866,-35.114379],[-52.234007,-31.701082],[-53.483226,-29.486072],[-54.536894,-26.456777],[-54.731981,-22.667219],[-54.446008,-19.421309],[-55.197913,-19.256256],[-54.181031,-16.343233],[-52.580646,-13.476974],[-50.30269,-10.80013],[-47.570164,-8.472132],[-45.902167,-7.399298],[-42.035495,-5.907035],[-38.675174,-5.787722]];
  const innerRadius=12.15;
  const balconyHole=Array.from({length:60},(_,i)=>[rotundaCenter.x+Math.cos(i*TAU/60)*innerRadius,rotundaCenter.z+Math.sin(i*TAU/60)*innerRadius]);
  const balconyShape={outer:balconyOuter,holes:[balconyHole]};
  const balconyMaterial=new THREE.MeshStandardMaterial({color:0xc9c5b9,roughness:.8});
  const railEntries=[];
  for(const y of atriumLevels) {
    const slab=addMappedVolume(group,balconyShape,.18,balconyMaterial,balconyMaterial,'Rotunda inset balcony slab',y-.18);
    slab.userData.insideFootprint='devon-rotunda';
    const rail=new THREE.Mesh(new THREE.TorusGeometry(innerRadius+.04,.045,4,60),bright);
    rail.name='Rotunda inner balcony handrail';rail.rotation.x=Math.PI/2;rail.position.copy(rotundaCenter).setY(y+1.05);group.add(rail);
    for(let j=0;j<36;j++) {
      const a=j*TAU/36,p=new THREE.Vector3(rotundaCenter.x+Math.cos(a)*(innerRadius+.04),y,rotundaCenter.z+Math.sin(a)*(innerRadius+.04));
      railEntries.push([p,p.clone().setY(y+1.05),.045,.045]);
    }
  }
  // Roof spokes and a shallow oculus stay inside the same roof envelope.
  const roofCenter=rotundaCenter.clone().setY(rotundaTop-.16),oculusRadius=2.5;
  for(let i=0;i<DEVON_CAMPUS.rotunda.length;i+=2) {
    const [x,z]=DEVON_CAMPUS.rotunda[i],direction=new THREE.Vector3(x-rotundaCenter.x,0,z-rotundaCenter.z).normalize();
    atriumRibs.push([roofCenter.clone().addScaledVector(direction,oculusRadius),new THREE.Vector3(rotundaCenter.x+(x-rotundaCenter.x)*.983,rotundaTop-.16,rotundaCenter.z+(z-rotundaCenter.z)*.983),.10,.14]);
  }
  const oculus=new THREE.Mesh(new THREE.TorusGeometry(oculusRadius,.10,4,36),bright);oculus.name='Rotunda glazed roof oculus frame';oculus.rotation.x=Math.PI/2;oculus.position.copy(roofCenter);group.add(oculus);
  const atriumFrame=addBeams(group,atriumRibs,bright,'Rotunda mapped steel structure');atriumFrame.castShadow=false;
  const balconyRails=addBeams(group,railEntries,bright,'Rotunda inner balcony railing posts');balconyRails.castShadow=false;
  campusWallOwners.push(rotundaOwner);
  // This canopy belongs to the small mapped south entrance volume, so it
  // cannot cross its neighbouring glass or occupy the garden drive.
  addBox(group,[6.55,.24,3.25],[-38.70,4.45,-1.88],bright,'Rotunda entrance canopy within mapped vestibule');

}
