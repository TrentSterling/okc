import * as THREE from 'three';
import { mergeGeometry } from './geometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

function box(w, h, d, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function bodyPillar(a,b,width=.072) { const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);return new THREE.BoxGeometry(width,delta.length(),width).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,delta.clone().normalize())).translate(...start.add(end).multiplyScalar(.5).toArray()); }
function cylinder(r, len, x, y, z, metal = false) { return new THREE.CylinderGeometry(r, r, len, metal ? 10 : 12).rotateX(Math.PI / 2).translate(x, y, z); }
let cachedVehicleGeometry;
export function vehicleGeometry() {
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
export function vehicleMaterials() {
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
