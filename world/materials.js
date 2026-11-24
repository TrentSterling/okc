import * as THREE from 'three';
import { canvasTexture } from './textures.js';

// Keep texture construction in this order: all textures share the seeded random stream.
export function createCityMaterials({group,random,dynamicLights}) {
  const concrete=new THREE.MeshStandardMaterial({color:0xaaa79f,roughness:.93});
  const curb=new THREE.MeshStandardMaterial({color:0xb9b7ad,roughness:.92});
  const steel=new THREE.MeshStandardMaterial({color:0x546168,metalness:.64,roughness:.42});
  const darkSteel=new THREE.MeshStandardMaterial({color:0x303a3e,metalness:.45,roughness:.53});
  const white=new THREE.MeshStandardMaterial({color:0xdad8ca,roughness:.96});
  // Paint is an intentional surface decal. Three's transparent pass draws it
  // after opaque asphalt, even at opacity 1; otherwise disabled depth writes
  // let a later opaque road draw erase it. Keep depth testing for occlusion.
  const roadPaint=white.clone();roadPaint.name='Road and parking paint decals';
  Object.assign(roadPaint,{transparent:true,opacity:1,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const yellow=new THREE.MeshStandardMaterial({name:'Yellow road paint decals',color:0xc2a66b,roughness:.94,transparent:true,opacity:1,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const paintGeometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const roofMat=new THREE.MeshStandardMaterial({color:0x8c8d87,roughness:.92});
  const lampMat=new THREE.MeshStandardMaterial({color:0xf9e4b5,emissive:0xffd9a0,emissiveIntensity:.05});dynamicLights.push({mat:lampMat,min:.03,max:2.5});
  const asphaltTex=canvasTexture(256,256,(c,w,h)=>{const im=c.createImageData(w,h);for(let i=0;i<im.data.length;i+=4){const n=(random()-.5)*22;im.data[i]=83+n;im.data[i+1]=88+n;im.data[i+2]=91+n;im.data[i+3]=255;}c.putImageData(im,0,0);});
  const asphalt=new THREE.MeshStandardMaterial({map:asphaltTex,color:0xd6d2c7,roughness:.96});
  const lotMat=new THREE.MeshStandardMaterial({map:asphaltTex,color:0xaaa99f,roughness:.97});
  const groundTex=canvasTexture(256,256,(c,w,h)=>{c.fillStyle='#878677';c.fillRect(0,0,w,h);for(let i=0;i<14000;i++){const v=110+random()*45;c.fillStyle=`rgba(${v},${v+2},${v-12},.22)`;c.fillRect(random()*w,random()*h,2,2);}});groundTex.repeat.set(250,250);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),new THREE.MeshStandardMaterial({map:groundTex,color:0xc8c7bb,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.055;ground.receiveShadow=true;group.add(ground);
  const grassTex=canvasTexture(256,256,(c,w,h)=>{c.fillStyle='#68735a';c.fillRect(0,0,w,h);for(let i=0;i<16000;i++){const n=random()*45;c.fillStyle=`rgba(${68+n},${85+n},${49+n},.3)`;c.fillRect(random()*w,random()*h,1,3);}});
  const grass=new THREE.MeshStandardMaterial({map:grassTex,color:0xc1c3aa,roughness:1});
  const water=new THREE.MeshPhysicalMaterial({color:0x233b3b,metalness:.27,roughness:.12,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:1.25});
  const surfaceMaterials={road:asphalt,path:concrete,water,curb,parking:lotMat,paving:concrete,grass};
  // Regular facade modules use meter-space UVs rather than stretching a single
  // building-sized bitmap. Emission is sparse and never paints the daytime sky.
  function facade(wall,style='masonry'){
    const day=canvasTexture(256,512,(c,w,h)=>{c.fillStyle=wall;c.fillRect(0,0,w,h);
      for(let iy=0;iy<14;iy++){const y=iy*h/14;
        if(style==='parking'){c.fillStyle='#28363b';c.fillRect(0,y+9,w,20);c.fillStyle='#9d9c91';c.fillRect(0,y+30,w,6);continue;}
        for(let ix=0;ix<8;ix++){const x=ix*w/8;const tint=36+Math.floor(random()*20);c.fillStyle=style==='glass'?`rgb(${tint+18},${tint+32},${tint+38})`:`rgb(${tint},${tint+12},${tint+16})`;c.fillRect(x+4,y+5,style==='glass'?25:19,style==='glass'?28:23);
          c.fillStyle='rgba(170,188,192,.34)';c.fillRect(x+4,y+5,style==='glass'?25:19,2);c.fillStyle='rgba(8,16,20,.32)';c.fillRect(x+4,y+28,20,2);}
        c.fillStyle=style==='banded'?'#bbc0bd':style==='glass'?'#89989b':'rgba(222,212,190,.22)';c.fillRect(0,y+34,w,style==='banded'?3:1);
      }
      if(style==='banded'){c.fillStyle='#b7bbb6';for(let x=0;x<w;x+=32)c.fillRect(x,0,4,h);}
    });
    const emit=canvasTexture(256,512,(c,w,h)=>{c.fillStyle='#000';c.fillRect(0,0,w,h);if(style==='parking')return;for(let y=0;y<14;y++)for(let x=0;x<8;x++){if(random()>.87){c.fillStyle=random()>.6?'#7c9c9d':'#b1966d';c.fillRect(x*w/8+5,y*h/14+5,18,25);}}});
    const mat=new THREE.MeshStandardMaterial({map:day,emissiveMap:emit,color:0xffffff,roughness:style==='glass'?.27:.82,metalness:style==='glass'?.48:.08,envMapIntensity:.65,emissive:0xd1b58a,emissiveIntensity:0});dynamicLights.push({mat,min:0,max:.55});return mat;
  }
  const masonry=[facade('#aaa591'),facade('#8b7e70'),facade('#9e9c92'),facade('#88705e')];
  const glass=facade('#687b83','glass'),banded=facade('#adb2af','banded'),parking=facade('#a7a79c','parking'),deco=facade('#b4aa90');
  function lowriseMaterial(color,brick){const map=canvasTexture(256,256,(c,w,h)=>{c.fillStyle=color;c.fillRect(0,0,w,h);if(brick){c.strokeStyle='rgba(53,45,38,.30)';c.lineWidth=1;for(let y=0;y<h;y+=8){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();for(let x=(y%16?8:0);x<w;x+=18){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+8);c.stroke();}}}for(let i=0;i<3000;i++){c.fillStyle=`rgba(30,26,22,${random()*.07})`;c.fillRect(random()*w,random()*h,1+random()*6,1);}});return new THREE.MeshStandardMaterial({map,color:0xffffff,roughness:.91});}
  const lowrise=[lowriseMaterial('#978b79',false),lowriseMaterial('#8c6e58',true),lowriseMaterial('#a7a59b',false),lowriseMaterial('#796956',true)];
  const shopGlass=new THREE.MeshPhysicalMaterial({color:0x485c64,roughness:.17,metalness:.28,clearcoat:1,envMapIntensity:1});
  const shutter=new THREE.MeshStandardMaterial({color:0x8c908d,roughness:.7,metalness:.20});
  const gold=new THREE.MeshStandardMaterial({color:0x8e896b,metalness:.45,roughness:.55});
  const bakedMaterials={};
  for(const [name,mat] of Object.entries(surfaceMaterials))bakedMaterials['ground.'+name]=mat;
  for(let i=0;i<4;i++){bakedMaterials['building.masonry.'+i]=masonry[i];bakedMaterials['building.lowrise.'+i]=lowrise[i];}
  Object.assign(bakedMaterials,{'building.glass':glass,'building.banded':banded,'building.parking':parking,'building.deco':deco,
    'detail.roof':roofMat,'detail.concrete':concrete,'detail.steel':steel,'detail.darkSteel':darkSteel,'detail.glass':shopGlass});
  return {concrete,steel,darkSteel,white,roadPaint,yellow,paintGeometry,roofMat,lampMat,masonry,gold,bakedMaterials};
}
