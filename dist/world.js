import * as THREE from 'three';
import { CITY_DATA } from './city-data.js';
import { WORLD_SURFACES } from './world-surfaces.js';
import { BAKED_WORLD } from './world-meshes.js';

// Geographic reconstruction in local meters, centered on the mapped Devon
// tower footprint. Source attribution and height limits: geo/provenance.json.
const UP = new THREE.Vector3(0, 1, 0);
const ROAD_HEIGHT = .14, ROAD_PAINT_HEIGHT = .152, LOT_PAINT_HEIGHT = .052;
const ROUTE_LENGTH = CITY_DATA.route.reduce((sum,p,i,a)=>i?sum+Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0,0);
const tmp = new THREE.Object3D();
const clamp = THREE.MathUtils.clamp;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function routeCenter(s) {
  s = clamp(s, 0, 1);
  const f=s*(CITY_DATA.route.length-1),i=Math.min(CITY_DATA.route.length-2,Math.floor(f)),t=f-i;
  const a=CITY_DATA.route[i],b=CITY_DATA.route[i+1];
  return new THREE.Vector3(a[0]+(b[0]-a[0])*t,ROAD_HEIGHT,a[1]+(b[1]-a[1])*t);
}
function tangent(s) { return routeCenter(Math.min(1, s + .0001)).sub(routeCenter(Math.max(0, s - .0001))).normalize(); }
function roadPoint(s, offset = 0) { const p = routeCenter(s), t = tangent(s); return p.add(new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(offset)); }
function mergeGeometry(parts) {
  // Unioned street polygons can be large. Typed-array copies avoid argument
  // stack limits from spreading a complete triangulated city into push().
  const source=parts.map(g=>g.index?g.toNonIndexed():g);
  const count=source.reduce((n,g)=>n+g.attributes.position.count,0);
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3),uv=new Float32Array(count*2);
  let vertex=0;
  for(const g of source){pos.set(g.attributes.position.array,vertex*3);nor.set(g.attributes.normal.array,vertex*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,vertex*2);vertex+=g.attributes.position.count;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}
function box(w, h, d, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function bodyPillar(a,b,width=.072) { const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);return new THREE.BoxGeometry(width,delta.length(),width).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,delta.clone().normalize())).translate(...start.add(end).multiplyScalar(.5).toArray()); }
function cylinder(r, len, x, y, z, metal = false) { return new THREE.CylinderGeometry(r, r, len, metal ? 10 : 12).rotateX(Math.PI / 2).translate(x, y, z); }
let cachedVehicleGeometry;
function vehicleGeometry() {
  if (cachedVehicleGeometry) return cachedVehicleGeometry;
  const bodyShape = new THREE.Shape(); bodyShape.moveTo(-2.32, .4); bodyShape.lineTo(-2.12, .92); bodyShape.lineTo(-1.2, 1.02); bodyShape.lineTo(1.33, .99); bodyShape.lineTo(2.16, .82); bodyShape.lineTo(2.33, .48); bodyShape.lineTo(2.08, .34); bodyShape.lineTo(-2.13, .34); bodyShape.closePath();
  const body = new THREE.ExtrudeGeometry(bodyShape, {depth:1.85, bevelEnabled:true, bevelThickness:.06, bevelSize:.06, bevelSegments:1, steps:1}).translate(0,0,-.925);
  const glassShape = new THREE.Shape(); glassShape.moveTo(-1.18,1.00); glassShape.lineTo(-.69,1.57); glassShape.lineTo(.73,1.57); glassShape.lineTo(1.40,1.00); glassShape.closePath();
  const cabin = new THREE.ExtrudeGeometry(glassShape,{depth:1.65,bevelEnabled:false}).translate(0,0,-.825);
  // A modest tumblehome narrows the roof without enlarging the car.
  const cabinPos=cabin.attributes.position;for(let i=0;i<cabinPos.count;i++)cabinPos.setZ(i,cabinPos.getZ(i)*(1-.14*clamp((cabinPos.getY(i)-1)/.57,0,1)));cabin.computeVertexNormals();
  const wheels = [], hubs = []; for (const x of [-1.43,1.43]) for (const z of [-.96,.96]) { wheels.push(cylinder(.43,.26,x,.43,z)); hubs.push(cylinder(.28,.285,x,.43,z,true)); }
  const pillars=[];for(const side of [-1,1]){pillars.push(bodyPillar([1.4,1,side*.84],[.73,1.59,side*.72]),bodyPillar([-1.18,1,side*.84],[-.69,1.59,side*.72]),bodyPillar([-.25,1.01,side*.84],[-.25,1.59,side*.72],.09));}
  const paint = mergeGeometry([body,box(1.47,.065,1.46,.01,1.60,0),...pillars,box(.82,.033,1.68).rotateZ(-.19).translate(1.73,.935,0),box(.82,.032,1.68).rotateZ(.10).translate(-1.67,.984,0)]);
  // Rubber bumper inserts, sill trim and grille share the tire draw call.
  wheels.push(box(.09,.16,1.73,2.27,.49,0),box(.09,.13,1.73,-2.25,.49,0),box(.06,.16,.8,2.30,.73,0));
  for(const side of [-1,1])wheels.push(box(2.15,.085,.045,0,.40,side*.96));
  hubs.push(box(.075,.036,1.70,-2.29,.59,0),box(.075,.032,1.65,2.31,.60,0),box(.035,.17,.36,-2.31,.77,0));
  for(const side of [-1,1])for(const x of [-.70,.63])hubs.push(box(.19,.035,.035,x,1.02,side*.923));
  const truckWheels=[], truckHubs=[]; for(const x of [-9.3,-7.9,2.1,4.3]) for(const z of [-1.26,1.26]) {truckWheels.push(cylinder(.59,.32,x,.59,z));truckHubs.push(cylinder(.30,.34,x,.59,z,true));}
  cachedVehicleGeometry = {
    car:{paint, glass:cabin, wheels:mergeGeometry(wheels), hubs:mergeGeometry(hubs), head:mergeGeometry([box(.08,.17,.53,2.25,.73,-.58),box(.08,.17,.53,2.25,.73,.58)]), tail:mergeGeometry([box(.075,.18,.55,-2.21,.76,-.60),box(.075,.18,.55,-2.21,.76,.60)]), shadow:new THREE.PlaneGeometry(5.2,2.55).rotateX(-Math.PI/2).translate(0,.025,0)},
    truck:{paint:mergeGeometry([box(3.1,2.7,2.48,3.0,2.02,0),box(1.3,1.05,2.38,4.7,1.25,0),box(12.2,3.7,2.65,-5.1,3.0,0),box(15.7,.4,2.35,-2.7,.92,0)]),glass:box(1.35,.88,2.50,3.15,2.65,0),wheels:mergeGeometry(truckWheels),hubs:mergeGeometry(truckHubs),head:mergeGeometry([box(.08,.25,.6,5.37,1.25,-.78),box(.08,.25,.6,5.37,1.25,.78)]),tail:mergeGeometry([box(.08,.24,.45,-11.25,1.3,-.89),box(.08,.24,.45,-11.25,1.3,.89)]),shadow:new THREE.PlaneGeometry(18.2,3.8).rotateX(-Math.PI/2).translate(-2.7,.025,0)}
  };
  return cachedVehicleGeometry;
}
function vehicleMaterials() {
  return {paint:new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.33,metalness:.56,clearcoat:1,clearcoatRoughness:.11}),glass:new THREE.MeshPhysicalMaterial({color:0x132332,metalness:.28,roughness:.12,clearcoat:1}),wheels:new THREE.MeshStandardMaterial({color:0x20232a,roughness:.92}),hubs:new THREE.MeshStandardMaterial({color:0x9ba0a7,metalness:.75,roughness:.28}),head:new THREE.MeshStandardMaterial({color:0xffe6b5,emissive:0xffd699,emissiveIntensity:.12,roughness:.3}),tail:new THREE.MeshStandardMaterial({color:0x8e171b,emissive:0xff180d,emissiveIntensity:.25,roughness:.3}),shadow:new THREE.MeshBasicMaterial({color:0x07080b,transparent:true,opacity:.28,depthWrite:false})};
}

// Player vehicle, local forward +X. Put its origin on the road surface.
export function createCar(style = 'sedan', color = 0xb9c1c8) {
  const geo=vehicleGeometry()[style==='truck'?'truck':'car']; const mats=vehicleMaterials(); mats.paint.color.set(color); const group=new THREE.Group();
  for(const part of Object.keys(geo)){const m=new THREE.Mesh(geo[part],mats[part]); m.castShadow=part==='paint';m.receiveShadow=part==='paint';group.add(m);}
  if(style==='suv')group.scale.set(1.05,1.24,1.06);
  group.userData.setNight=n=>{mats.head.emissiveIntensity=.12+n*3.5;mats.tail.emissiveIntensity=.25+n*2;};
  return group;
}

export function createWorld({scene, glassMaterial, seed=42}={}) {
  const random=rng(seed),group=new THREE.Group(); group.name='Mapped Oklahoma City / Reno Avenue'; scene.add(group);
  const unit=new THREE.BoxGeometry(1,1,1),batches=new Map(),merged=new Map(),dynamicLights=[];
  function addBatch(geometry,material,position,scale=[1,1,1],rotation=0,color) {
    const cell=geometry===paintGeometry?'paint':Math.floor(position[0]/BAKED_WORLD.chunkSize)+':'+Math.floor(position[2]/BAKED_WORLD.chunkSize);
    const key=geometry.uuid+material.uuid+cell;let b=batches.get(key);if(!b){b={geometry,material,items:[]};batches.set(key,b);}
    b.items.push({position,scale,rotation,color});
  }
  function addBox(material,x,y,z,w,h,d,rot=0,color){addBatch(unit,material,[x,y,z],[w,h,d],rot,color);}
  function mergePart(geometry,material,cast=true){geometry.computeBoundingBox();const c=geometry.boundingBox.getCenter(new THREE.Vector3());const key=material.uuid+':'+cast+':'+Math.floor(c.x/BAKED_WORLD.chunkSize)+':'+Math.floor(c.z/BAKED_WORLD.chunkSize);let b=merged.get(key);if(!b){b={material,parts:[],cast};merged.set(key,b);}b.parts.push(geometry);}
  function compactStaticGroup(target){
    const bins=new Map(),originals=new Set();
    for(const child of [...target.children]){
      if(!child.isMesh||child.isInstancedMesh||Array.isArray(child.material))continue;
      child.updateMatrix();const key=child.material.uuid+':'+child.castShadow;
      let bin=bins.get(key);if(!bin){bin={material:child.material,cast:child.castShadow,parts:[]};bins.set(key,bin);}
      bin.parts.push(child.geometry.clone().applyMatrix4(child.matrix));originals.add(child.geometry);target.remove(child);
    }
    for(const bin of bins.values()){
      const mesh=new THREE.Mesh(mergeGeometry(bin.parts),bin.material);mesh.name=target.name+' / merged static material';
      mesh.castShadow=bin.cast;mesh.receiveShadow=true;target.add(mesh);
      for(const geometry of bin.parts)geometry.dispose();
    }
    for(const geometry of originals)geometry.dispose();
  }
  function canvasTexture(w,h,draw,repeat=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;}
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
  function addPaint(material,x,y,z,w,d,rot=0){addBatch(paintGeometry,material,[x,y,z],[w,1,d],rot);}
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
  function flatPolygon(p,y,mat,scaleUV=18){
    const outer=p.outer||p;if(outer.length<4)return;
    const path=ring=>ring.map(q=>new THREE.Vector2(q[0],-q[1]));
    const shape=new THREE.Shape(path(outer));for(const hole of p.holes||[])shape.holes.push(new THREE.Path(path(hole)));
    const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,y,0);
    // Submillimeter GIS slivers can collapse after Float32 conversion. Remove
    // those zero-area triangles rather than submitting duplicate vertices.
    const position=g.attributes.position,indices=g.index?.array;
    if(indices){const keep=[];for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],ax=position.getX(a),az=position.getZ(a);const area=(position.getX(b)-ax)*(position.getZ(c)-az)-(position.getZ(b)-az)*(position.getX(c)-ax);if(Math.abs(area)>1e-9)keep.push(a,b,c);}g.setIndex(keep);}
    // Use the actual width-offset vertex positions, never centerline UVs.
    // Both axes now retain area, so asphalt noise does not stretch into bands.
    const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/scaleUV,pos.getZ(i)/scaleUV);
    mergePart(g,mat,false);
  }
  function footprint(p,height,mat,base=0,wallOverride=null){let q=p.slice();if(q[0][0]===q[q.length-1][0]&&q[0][1]===q[q.length-1][1])q.pop();if(q.length<3)return;
    let signed=0;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];signed+=a[0]*b[1]-b[0]*a[1];}if(signed<0)q.reverse();
    const pos=[],normal=[],uv=[];let distance=0;
    const edges=wallOverride||q.map((a,i)=>{const b=q[(i+1)%q.length],u=distance;distance+=Math.hypot(b[0]-a[0],b[1]-a[1]);return {a,b,base:0,u};});
    for(const edge of edges){
      const {a,b}=edge,low=Math.max(base,edge.base),dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.02||low>=height-.001)continue;
      const v=[[b[0],low,b[1]],[a[0],low,a[1]],[a[0],height,a[1]],[b[0],low,b[1]],[a[0],height,a[1]],[b[0],height,b[1]]];
      const us=[edge.u+len,edge.u,edge.u,edge.u+len,edge.u,edge.u+len],vs=[low,low,height,low,height,height];
      for(let k=0;k<6;k++){pos.push(...v[k]);normal.push(dz/len,0,-dx/len);uv.push(us[k]/14.4,vs[k]/56);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));mergePart(g,mat,true);flatPolygon([...q,q[0]],height+.02,roofMat);
  }
  function center(p){let x=0,z=0;for(const q of p){x+=q[0];z+=q[1];}return[x/p.length,z/p.length];}
  function scaled(p,c,s){return p.map(v=>[c[0]+(v[0]-c[0])*s,c[1]+(v[1]-c[1])*s]);}
  // Neighboring mapped volumes can share an edge in opposite directions.
  // Keep one physical trim box per edge instead of two coincident instances.
  const outlineEdges=new Set();
  function outline(p,y,material,width=.32,height=.55){for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<=.5)continue;const edge=[a.join(','),b.join(',')].sort().join('|'),key=[material.uuid,y,width,height,edge].join(':');if(outlineEdges.has(key))continue;outlineEdges.add(key);addBox(material,(a[0]+b[0])*.5,y,(a[1]+b[1])*.5,len,height,width,-Math.atan2(b[1]-a[1],b[0]-a[0]));}}
  // Offline unions resolve junctions and overlapping map polygons. Each
  // horizontal area has exactly one exposed owner, including polygon holes.
  // This removes the depth competition rather than depending on draw order.
  const surfaceMaterials={road:asphalt,path:concrete,water,curb,parking:lotMat,paving:concrete,grass};
  // Map triangulation, height envelopes, and facade holes are baked offline.
  // Production decodes indexed buffers into spatially culled chunks below.
  const route=CITY_DATA.route;
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
  function decodeBuffer(encoded){const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer;}
  for(const chunk of BAKED_WORLD.chunks){
    const data=new THREE.InterleavedBuffer(new Float32Array(decodeBuffer(chunk.v)),8),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
    g.setAttribute('normal',new THREE.InterleavedBufferAttribute(data,3,3));
    g.setAttribute('uv',new THREE.InterleavedBufferAttribute(data,2,6));
    const Index=chunk.indexType===32?Uint32Array:Uint16Array;
    g.setIndex(new THREE.BufferAttribute(new Index(decodeBuffer(chunk.i)),1));g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,bakedMaterials[chunk.material]);mesh.name='Mapped city geometry';mesh.position.fromArray(chunk.origin);
    mesh.castShadow=chunk.cast;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
  for(const chunk of BAKED_WORLD.instances){
    const matrices=new Float32Array(decodeBuffer(chunk.m));
    const mesh=new THREE.InstancedMesh(unit,bakedMaterials[chunk.material],matrices.length/16);
    mesh.name='Baked facade detail instances';mesh.position.fromArray(chunk.origin);
    mesh.instanceMatrix=new THREE.InstancedBufferAttribute(matrices,16);
    mesh.boundingBox=new THREE.Box3(new THREE.Vector3(...chunk.min),new THREE.Vector3(...chunk.max));
    mesh.boundingSphere=mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={baked:true,chunk:chunk.key,bakedMaterial:chunk.material};group.add(mesh);
  }
  // Specialized open structures and crown tips stay separate from the baked
  // generic shell. Their mapped footprints never receive a second solid box.
  for(const b of CITY_DATA.buildings){
    const c=center(b.p);
    if(b.id===257271||b.kind==='carousel'){
      const platform=new THREE.Mesh(new THREE.CylinderGeometry(10.3,10.3,.24,40),concrete);platform.position.set(c[0],.16,c[1]);platform.receiveShadow=true;group.add(platform);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(10.6,2.0,32),white);canopy.position.set(c[0],4.0,c[1]);canopy.castShadow=true;group.add(canopy);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;addBox(steel,c[0]+Math.cos(a)*9.4,1.65,c[1]+Math.sin(a)*9.4,.12,3.0,.12);}
      addBox(concrete,c[0],1.9,c[1],1.1,3.4,1.1);
    }else if(b.kind==='deco'&&b.h>100){
      const tip=new THREE.Mesh(new THREE.ConeGeometry(5.2,3,4),gold);tip.rotation.y=Math.PI/4;tip.position.set(c[0],b.h-1.5,c[1]);tip.castShadow=true;group.add(tip);
    }
  }
  // Crystal Bridge is positioned and oriented from its mapped footprint.
  const bridge=CITY_DATA.features.find(f=>f.name==='Crystal Bridge Tropical Conservatory');
  if(bridge){const c=bridge.center;let max=0,aa,bb;for(const a of bridge.p)for(const b of bridge.p){const d=(a[0]-b[0])**2+(a[1]-b[1])**2;if(d>max){max=d;aa=a;bb=b;}}
    const theta=-Math.atan2(bb[1]-aa[1],bb[0]-aa[0]);const conservatory=new THREE.Group();conservatory.name='Crystal Bridge / mapped footprint';conservatory.position.set(c[0],0,c[1]);conservatory.rotation.y=theta;
    const gm=new THREE.MeshPhysicalMaterial({color:0x90aaa5,metalness:.18,roughness:.16,clearcoat:1,transparent:true,opacity:.56,depthWrite:false,side:THREE.DoubleSide});const tube=new THREE.Mesh(new THREE.CylinderGeometry(10.3,10.3,68,32,1,true),gm);tube.rotation.z=Math.PI/2;tube.position.y=11;conservatory.add(tube);
    const ring=new THREE.TorusGeometry(10.35,.13,4,40).rotateY(Math.PI/2);for(let i=0;i<=14;i++){const m=new THREE.Mesh(ring,white);m.position.set(-34+i*68/14,11,0);conservatory.add(m);}for(let i=0;i<13;i++){const a=i*Math.PI*2/13;const m=new THREE.Mesh(new THREE.BoxGeometry(68,.11,.13),steel);m.position.set(0,11+Math.cos(a)*10.35,Math.sin(a)*10.35);conservatory.add(m);}
    for(const end of [-34,34]){const cap=new THREE.Mesh(new THREE.CircleGeometry(10.3,48),gm);cap.rotation.y=Math.PI/2;cap.position.set(end,11,0);conservatory.add(cap);for(let v=-8;v<=8;v+=2.6){const reach=Math.sqrt(10.3**2-v**2)*2;const upright=new THREE.Mesh(new THREE.BoxGeometry(.18,reach,.13),steel);upright.position.set(end,11,v);conservatory.add(upright);const horizontal=new THREE.Mesh(new THREE.BoxGeometry(.18,.13,reach),steel);horizontal.position.set(end,11+v,0);conservatory.add(horizontal);}}
    const floor=new THREE.Mesh(new THREE.BoxGeometry(68,.35,7.5),concrete);floor.position.y=1.8;conservatory.add(floor);
    const interiorLeaves=new THREE.MeshStandardMaterial({color:0x486746,roughness:.9}),planterMat=new THREE.MeshStandardMaterial({color:0x6e6250,roughness:.95});
    for(let i=0;i<18;i++){const x=-28+i*3.3,z=(i%2?1:-1)*(3.2+random()*2);const planter=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.1,2.2),planterMat);planter.position.set(x,2.3,z);conservatory.add(planter);for(let k=0;k<3;k++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),interiorLeaves);crown.scale.set(1.4,2+random()*2,1.4);crown.position.set(x+(random()-.5)*1.6,4+k*1.2,z);conservatory.add(crown);}}
    // The conservatory has more than a hundred fixed ribs, panes and plants.
    // Bake their transforms into a handful of material meshes once, instead
    // of paying a separate draw call for every small repeated piece.
    compactStaticGroup(conservatory);group.add(conservatory);
  }
  const arena=CITY_DATA.features.find(f=>f.name==='Paycom Center');
  if(arena){footprint(arena.p,23,masonry[1]);const c=arena.center,xs=arena.p.map(p=>p[0]),zs=arena.p.map(p=>p[1]);const r=new THREE.Mesh(new THREE.SphereGeometry(1,40,16,0,Math.PI*2,0,Math.PI/2),roofMat);r.scale.set((Math.max(...xs)-Math.min(...xs))*.47,10,(Math.max(...zs)-Math.min(...zs))*.47);r.position.set(c[0],23,c[1]);r.castShadow=true;group.add(r);}
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
  // Continuous at-grade markings, with gaps and crosswalks at actual junctions.
  const junctions=[];
  for(const r of CITY_DATA.roads){if(r.name.includes('Reno')||r.kind==='service')continue;for(let i=0;i<r.p.length-1;i++){const a=r.p[i],b=r.p[i+1];if(Math.abs(b[1]-a[1])<Math.abs(b[0]-a[0])||Math.abs(b[1]-a[1])<1)continue;const z=292;if((a[1]-z)*(b[1]-z)<=0){const x=a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);if(x>-1470&&x<1020&&!junctions.some(v=>Math.abs(v.x-x)<32))junctions.push({x,name:r.name,w:r.w});}}}
  for(let i=0;i<260;i++){const s=(i+.5)/260,p=routeCenter(s),near=junctions.some(v=>Math.abs(v.x-p.x)<15);if(near)continue;const t=tangent(s),angle=-Math.atan2(t.z,t.x);for(const off of [-.18,.18]){const q=roadPoint(s,off);addPaint(yellow,q.x,ROAD_PAINT_HEIGHT,q.z,8,.10,angle);}for(const off of [-5.25,5.25]){const q=roadPoint(s,off);addPaint(roadPaint,q.x,ROAD_PAINT_HEIGHT,q.z,3.2,.13,angle);}}
  const signalRed=new THREE.MeshStandardMaterial({color:0x5b1010,emissive:0xff321b,emissiveIntensity:.45}),signalGreen=new THREE.MeshStandardMaterial({color:0x185436,emissive:0x3cff90,emissiveIntensity:.55});
  for(const j of junctions){for(const side of [-1,1]){const x=j.x+side*(j.w*.5+3);for(let z=-9;z<10;z+=1.7)addPaint(roadPaint,x,ROAD_PAINT_HEIGHT,292+z,2.8,.70);addBox(steel,j.x-10,3.6,292+side*13,.13,7.2,.13);addBox(steel,j.x-10,7.05,292+side*7,.16,.16,12);addBox(darkSteel,j.x-10,6.7,292+side*5,.32,.9,.35);addBox(signalGreen,j.x-10.18,6.4,292+side*5,.025,.19,.19);}}
  for(let x=-1450;x<1020;x+=48){const s=(x+1500)/2550,p=routeCenter(s);for(const side of [-1,1]){addBox(steel,p.x,4.4,p.z+side*12.5,.13,8.6,.13);addBox(steel,p.x,8.65,p.z+side*11.2,.12,.13,2.7);addBox(lampMat,p.x,8.51,p.z+side*9.9,.38,.14,.95);}}
  // A restrained amount of lot striping on mapped parking surfaces.
  function inPoly(x,z,p){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
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
  for(const b of merged.values()){if(!b.parts.length)continue;const mesh=new THREE.Mesh(mergeGeometry(b.parts),b.material);mesh.name='Mapped city geometry';mesh.castShadow=b.cast;mesh.receiveShadow=true;group.add(mesh);}
  for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.items.length);mesh.name=b.geometry===paintGeometry?'City paint decals':'City detail batch';for(let i=0;i<b.items.length;i++){const item=b.items[i];tmp.position.fromArray(item.position);tmp.scale.fromArray(item.scale);tmp.rotation.set(0,item.rotation,0);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix);if(item.color!==undefined)mesh.setColorAt(i,new THREE.Color(item.color));}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=b.material!==white&&b.material!==roadPaint&&b.material!==yellow&&b.material!==poolMat;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
  const materials=vehicleMaterials(),geometries=vehicleGeometry(),traffic=[],trafficMeshes={};
  const palette=[0xd5d4cd,0xa5a9a9,0x263643,0x526978,0x732c2c,0x343737,0xbcb7a8];
  const counts={car:20,truck:4};
  for(const [kind,count] of Object.entries(counts)){trafficMeshes[kind]={};for(const part of Object.keys(geometries[kind])){const mesh=new THREE.InstancedMesh(geometries[kind][part],materials[part],count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.name=`Traffic ${kind} ${part}`;mesh.castShadow=part==='paint';mesh.receiveShadow=part==='paint';trafficMeshes[kind][part]=mesh;group.add(mesh);}for(let i=0;i<count;i++){const lane=i%4,dir=lane<2?1:-1,offset=dir*(3.5+(lane%2)*3.5);traffic.push({kind,index:i,s:0,dir,offset,speed:lane%2===0?12.5:10.8,scale:kind==='car'&&i%7===0?new THREE.Vector3(1.04,1.16,1.04):new THREE.Vector3(1,1,1)});trafficMeshes[kind].paint.setColorAt(i,new THREE.Color(palette[i%palette.length]));}trafficMeshes[kind].paint.instanceColor.needsUpdate=true;}
  [3.5,7,-3.5,-7].forEach((offset,lane)=>{const members=traffic.filter(t=>t.offset===offset);members.forEach((t,i)=>t.s=(i/members.length+.08+lane*.054)%1);});
  let lastNight=-1;
  function update(dt,simTime,nightAmount=0,trafficSpeed=1){const night=clamp(nightAmount,0,1);if(Math.abs(night-lastNight)>.002){for(const l of dynamicLights){if(l.mat)l.mat.emissiveIntensity=l.min+night*l.max;if(l.light)l.light.intensity=night*l.max;if(l.overlay)l.overlay.opacity=night*l.max;}materials.head.emissiveIntensity=.12+night*3.5;materials.tail.emissiveIntensity=.25+night*2;lastNight=night;}for(const t of traffic){t.s=(t.s+t.dir*t.speed*dt*trafficSpeed/ROUTE_LENGTH+1)%1;const p=roadPoint(t.s,t.offset),d=tangent(t.s);tmp.position.copy(p);tmp.scale.copy(t.scale);tmp.rotation.set(0,-Math.atan2(d.z,d.x)+(t.dir===-1?Math.PI:0),0);tmp.updateMatrix();for(const m of Object.values(trafficMeshes[t.kind]))m.setMatrixAt(t.index,tmp.matrix);}for(const type of Object.values(trafficMeshes))for(const m of Object.values(type))m.instanceMatrix.needsUpdate=true;}
  update(0,0,0);
  return{group,update,getRoutePoint:(s,laneOffset=0)=>roadPoint(s,5.25+laneOffset),getRouteTangent:tangent,routeLength:ROUTE_LENGTH,trafficCount:traffic.length,laneBase:5.25,laneSpacing:3.5,laneLimit:1.75,geoOrigin:CITY_DATA.origin,mappedBuildingCount:CITY_DATA.buildings.length,mappedRoadCount:CITY_DATA.roads.length,surfaceLayerCount:WORLD_SURFACES.layers.length,drivingBounds:WORLD_SURFACES.drivingBounds,drivingSolids:WORLD_SURFACES.drivingSolids,drivingRoads:CITY_DATA.roads,staticGeometryStats:BAKED_WORLD.stats};
}
