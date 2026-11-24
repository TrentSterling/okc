import * as THREE from 'three';
import { CITY_DATA } from '../city-data.js';
import { mergeGeometry, inPoly } from './geometry.js';
import { canvasTexture } from './textures.js';

const clamp = THREE.MathUtils.clamp;

export function addPlanting({random,addBatch}) {
  // Fine, irregular cutout canopies replace the former large spherical blobs.
  const leafTex=canvasTexture(256,256,(c,w,h)=>{c.clearRect(0,0,w,h);for(let i=0;i<2400;i++){const a=random()*Math.PI*2,r=Math.sqrt(random()),cx=128+Math.cos(a)*r*(86+10*Math.sin(a*5)),cy=126+Math.sin(a)*r*(104+8*Math.cos(a*3));const shade=42+random()*62;c.fillStyle=`rgb(${shade*.80},${shade},${shade*.61})`;c.beginPath();c.ellipse(cx,cy,3+random()*7,2+random()*4,random()*6,0,Math.PI*2);c.fill();}},false);
  const leafMat=new THREE.MeshStandardMaterial({map:leafTex,color:0xd4dbb9,roughness:.93,alphaTest:.48,side:THREE.DoubleSide});
  const leafParts=[];for(let i=0;i<5;i++)leafParts.push(new THREE.PlaneGeometry(1,1).rotateY(i*Math.PI/5).translate(0,.5,0));const leafGeo=mergeGeometry(leafParts);
  const trunkGeo=new THREE.CylinderGeometry(.12,.23,1,6),trunkMat=new THREE.MeshStandardMaterial({color:0x62594b,roughness:1});
  function plantedTree(p,height=6+random()*4.4){const scale=height*(.54+random()*.14);addBatch(trunkGeo,trunkMat,[p[0],height*.29,p[1]],[1,height*.58,1]);addBatch(leafGeo,leafMat,[p[0],height*.22,p[1]],[scale,height*.82,scale],random()*Math.PI);}
  for(const p of CITY_DATA.trees)plantedTree(p);
  // Additional small groves fill mapped garden planting areas. These are
  // illustrative planting, explicitly separate from the mapped tree inventory.
  const garden=CITY_DATA.features.find(f=>f.name==='Myriad Botanical Gardens');
  if(garden){const waterPolys=CITY_DATA.surfaces.filter(s=>s.kind==='water');for(let i=0;i<300;i++){const x=-165+random()*245,z=55+random()*225;if(!inPoly(x,z,garden.p)||waterPolys.some(s=>inPoly(x,z,s.p)))continue;let nearPath=false;for(const path of CITY_DATA.paths||[]){for(let k=0;k<path.p.length-1;k++){const a=path.p[k],b=path.p[k+1],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<3){nearPath=true;break;}}if(nearPath)break;}if(!nearPath)plantedTree([x,z],4.5+random()*5);}}
}
