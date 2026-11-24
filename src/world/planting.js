import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { WORLD_SURFACES } from '../world-surfaces.js';
import { rngFor } from './random.js';
import { mergeGeometry } from './geometry.js';
import { canvasTexture } from './textures.js';
import { createPlacementQueries, footprintFits, pointInPolygon, rectangleFootprint } from './placement.js';

const TREE_FORMS = [
  {name:'spreading',width:.43,depth:.39,crownHeight:.32,center:.67,bottom:0x354b32,top:0x74875a},
  {name:'oval',width:.31,depth:.29,crownHeight:.29,center:.66,bottom:0x344e39,top:0x768e66},
  {name:'upright',width:.24,depth:.23,crownHeight:.29,center:.67,bottom:0x344a32,top:0x81905c},
];
const CROWN_MASSES = [
  [[[-.34,.06,-.04],[.82,.64,.72]],[[.27,.29,.15],[.80,.76,.72]],[[.12,-.20,-.29],[.88,.55,.65]]],
  [[[-.22,-.25,.10],[.70,.72,.66]],[[.25,.15,-.10],[.75,.73,.68]],[[-.04,.62,.09],[.56,.64,.53]]],
  [[[.02,-.34,0],[.77,.65,.68]],[[-.18,.16,.07],[.65,.70,.61]],[[.13,.65,-.07],[.45,.57,.44]]],
];

function crownGeometry(form,index) {
  // Three interlocking opaque leaf masses form a single instanced geometry.
  // Asymmetric overlapping volumes make the silhouette differ from a scaled
  // sphere while keeping smooth normals and avoiding crossed alpha cards.
  const parts=CROWN_MASSES[index].map(([center,scale],mass)=>{
    const part=new THREE.SphereGeometry(1,7,4),positions=part.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),angle=Math.atan2(z,x);
      const lobe=1+.045*Math.sin(angle*3+mass)*Math.sqrt(Math.max(0,1-y*y));
      positions.setXYZ(i,center[0]+x*scale[0]*lobe,center[1]+y*scale[1],center[2]+z*scale[2]*lobe);
    }
    part.computeVertexNormals();
    return part;
  });
  const geometry=mergeGeometry(parts),positions=geometry.attributes.position;
  const colors=new Float32Array(positions.count*3);
  const bottom=new THREE.Color(form.bottom),top=new THREE.Color(form.top),color=new THREE.Color();
  for(let i=0;i<positions.count;i++) {
    color.copy(bottom).lerp(top,THREE.MathUtils.smoothstep((positions.getY(i)+1.05)/2.35,.08,.95));
    color.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  for(const part of parts)part.dispose();
  return geometry;
}

function trunkGeometry() {
  const parts=[new THREE.CylinderGeometry(.13,.23,3.6,7,1,true).translate(0,1.8,0)];
  for(const end of [[.80,3.75,.22],[-.55,3.9,-.40]]) {
    const start=new THREE.Vector3(0,2.45,0),finish=new THREE.Vector3(...end);
    const direction=finish.clone().sub(start),middle=start.clone().add(finish).multiplyScalar(.5);
    parts.push(new THREE.CylinderGeometry(.065,.12,direction.length(),5,1,true)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()))
      .translate(...middle.toArray()));
  }
  const geometry=mergeGeometry(parts);
  for(const part of parts)part.dispose();
  return geometry;
}

function treeIdentity(point) { return point.map(v=>v.toFixed(3)).join(':'); }

function foliageMaterial(seed) {
  const random=rngFor(seed,'foliage-surface');
  const map=canvasTexture(256,256,(context,width,height)=>{
    context.fillStyle='#dedede';context.fillRect(0,0,width,height);
    // Monochrome value detail supports the shared green vertex palette. Broad
    // clusters stay restrained; individual leaves never become colored noise.
    for(let i=0;i<220;i++) {
      const shade=180+Math.floor(random()*45);
      context.fillStyle=`rgba(${shade},${shade},${shade},.12)`;
      context.beginPath();context.ellipse(random()*width,random()*height,
        8+random()*12,5+random()*9,random()*Math.PI,0,Math.PI*2);context.fill();
    }
    for(let i=0;i<1400;i++) {
      const shade=192+Math.floor(random()*45);
      context.fillStyle=`rgba(${shade},${shade},${shade},.26)`;
      context.beginPath();context.ellipse(random()*width,random()*height,
        1.5+random()*3.5,1+random()*2,random()*Math.PI,0,Math.PI*2);context.fill();
    }
  });
  const bump=map.clone();bump.colorSpace=THREE.NoColorSpace;bump.needsUpdate=true;
  return new THREE.MeshStandardMaterial({name:'Opaque park and street tree canopies',
    color:0xffffff,vertexColors:true,map,bumpMap:bump,bumpScale:.035,roughness:.96});
}

function gardenTrees(seed) {
  const garden=CITY_DATA.features.find(feature=>feature.name==='Myriad Botanical Gardens');
  if(!garden)return [];
  const grass=WORLD_SURFACES.layers.find(layer=>layer.kind==='grass').polygons;
  const queries=createPlacementQueries(),trees=[];
  // These remain illustrative garden groves, distinct from mapped trees. Each
  // grid cell has its own seed, so another texture or prop cannot reshuffle it.
  for(let gx=-165;gx<80;gx+=12)for(let gz=55;gz<280;gz+=12) {
    const random=rngFor(seed,`garden-cell:${gx}:${gz}`);
    if(random()>.43)continue;
    const point=[gx+2+random()*8,gz+2+random()*8];
    if(!pointInPolygon(...point,garden.p))continue;
    const footprint=rectangleFootprint(...point,1.5,1.5);
    if(!grass.some(polygon=>footprintFits(polygon,footprint,.5)))continue;
    if(!queries.isClear(footprint,1.4))continue;
    if(CITY_DATA.trees.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<4.5))continue;
    trees.push(point);
    if(trees.length===96)return trees;
  }
  return trees;
}

export function addPlanting({seed=42,addBatch}) {
  const canopies=TREE_FORMS.map(crownGeometry);
  const foliage=foliageMaterial(seed);
  const trunk=trunkGeometry();
  const trunkMaterial=new THREE.MeshStandardMaterial({name:'Weathered tree bark',color:0x665b48,roughness:1});
  const extras=gardenTrees(seed),archetypes=[0,0,0],placements=[],suppressed=[];
  const queries=createPlacementQueries();
  function plantedTree(point,isGarden=false) {
    const id=treeIdentity(point),random=rngFor(seed,'tree:'+id);
    // Neighboring street trees share a family; individual trees retain slight
    // height and rotation variation. Colors stay coherent instead of speckled.
    const family=rngFor(seed,`tree-family:${Math.floor(point[0]/85)}:${Math.floor(point[1]/85)}`);
    const choice=family();let index=isGarden?(choice<.65?0:1):(choice<.48?0:choice<.84?1:2);
    const height=(isGarden?6.0:7.3)+random()*2.6;
    const widthScale=.94+random()*.12,yaw=random()*Math.PI*2;
    const tone=new THREE.Color().setRGB(.94+random()*.06,.96+random()*.04,.94+random()*.06);
    const clearance=queries.distanceToBuildings(...point);
    if(clearance<.32){suppressed.push({id:'tree:'+id,x:point[0],z:point[1],mapped:!isGarden,reason:'trunk intersects mapped solid'});return;}
    const radius=kind=>{
      const form=TREE_FORMS[kind],position=canopies[kind].attributes.position;
      let radius2=0;
      for(let i=0;i<position.count;i++)radius2=Math.max(radius2,
        (position.getX(i)*height*form.width*widthScale)**2+(position.getZ(i)*height*form.depth*widthScale)**2);
      return Math.sqrt(radius2);
    };
    if((clearance-.3)/radius(index)<.72)index=2;
    const crownScale=Math.min(1,(clearance-.3)/radius(index));
    if(crownScale<.72){suppressed.push({id:'tree:'+id,x:point[0],z:point[1],mapped:!isGarden,reason:'insufficient crown clearance'});return;}
    const form=TREE_FORMS[index],crownRadius=radius(index)*crownScale;
    addBatch(trunk,trunkMaterial,[point[0],0,point[1]],[height/8,height/8,height/8],yaw);
    addBatch(canopies[index],foliage,[point[0],height*form.center,point[1]],
      [height*form.width*widthScale*crownScale,height*form.crownHeight,height*form.depth*widthScale*crownScale],yaw,tone);
    archetypes[index]++;
    placements.push({id:'tree:'+id,x:point[0],z:point[1],height,archetype:form.name,mapped:!isGarden,crownRadius,crownScale,wallClearance:clearance});
  }
  for(const point of CITY_DATA.trees)plantedTree(point);
  for(const point of extras)plantedTree(point,true);
  return {mappedTrees:CITY_DATA.trees.length,renderedMappedTrees:placements.filter(p=>p.mapped).length,
    suppressedMappedTrees:suppressed.filter(p=>p.mapped).length,gardenTrees:placements.filter(p=>!p.mapped).length,archetypes,
    canopyTriangles:canopies[0].attributes.position.count/3,canopyMaterials:1,placements,suppressed};
}
