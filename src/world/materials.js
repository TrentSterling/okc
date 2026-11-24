import * as THREE from 'three';
import { createSurfaceTextures } from './surface-textures.js';
import { createFacadeMaterial, createLowriseMaterial } from './facade-textures.js';

// Geographic material keys and meter-space UVs remain stable. Each painted
// texture owns a named random stream, independent of planting and other maps.
export function createCityMaterials({ group, dynamicLights, seed = 42 }) {
  const textures = createSurfaceTextures(seed);
  const surface = (name, texture, bumpScale = .01) => new THREE.MeshStandardMaterial({
    name, map: texture.map, bumpMap: texture.detail, bumpScale,
    roughnessMap: texture.detail, roughness: 1,
  });
  const concrete = surface('Warm weathered concrete', textures.concrete, .008);
  const pavement = surface('Jointed concrete paving', textures.pavement, .009);
  const curb = new THREE.MeshStandardMaterial({
    name: 'Pale concrete edging', color: 0xc0bbac, roughness: 1,
    roughnessMap: textures.concrete.detail, bumpMap: textures.concrete.detail, bumpScale: .007,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x657479, metalness: .64, roughness: .46 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x303a3e, metalness: .45, roughness: .55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe0dccd, roughness: .94 });
  // Paint remains an intentional surface decal, drawn after opaque asphalt.
  // Depth testing and the existing offset prevent paint/road coplanar flicker.
  const roadPaint = white.clone(); roadPaint.name = 'Road and parking paint decals';
  Object.assign(roadPaint, { transparent: true, opacity: 1, depthTest: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const yellow = new THREE.MeshStandardMaterial({ name: 'Yellow road paint decals', color: 0xd2b66c,
    roughness: .94, transparent: true, opacity: 1, depthTest: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const paintGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const roofMat = surface('Weathered mineral roof', textures.roof, .012);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe7bf, emissive: 0xffd69b, emissiveIntensity: .05 });
  dynamicLights.push({ mat: lampMat, min: .03, max: 2.5 });
  const asphalt = surface('Repaired charcoal asphalt', textures.asphalt, .012);
  const lotMat = surface('Sun-aged parking asphalt', textures.parking, .012);
  textures.earth.map.repeat.set(250, 250);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000),
    new THREE.MeshStandardMaterial({ name: 'Prairie ground', map: textures.earth.map, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.055; ground.receiveShadow = true; group.add(ground);
  const grass = surface('Varied garden turf', textures.lawn, .012);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x294d4e, metalness: .16, roughness: .15,
    clearcoat: .8, clearcoatRoughness: .06, envMapIntensity: 1.2 });
  const surfaceMaterials = { road: asphalt, path: pavement, water, curb, parking: lotMat, paving: pavement, grass };
  const masonry = ['limestone', 'brick', 'sandstone', 'brownstone'].map(style =>
    createFacadeMaterial({ seed, id: style, style, dynamicLights }));
  const facades = Object.fromEntries(['glass', 'banded', 'parking', 'deco'].map(style =>
    [style, createFacadeMaterial({ seed, id: style, style, dynamicLights })]));
  const lowrise = [
    createLowriseMaterial(seed, 'limestone', 'stone', [185, 174, 151]),
    createLowriseMaterial(seed, 'red-brick', 'brick', [145, 96, 72]),
    createLowriseMaterial(seed, 'cream-stucco', 'stucco', [187, 184, 168]),
    createLowriseMaterial(seed, 'brown-brick', 'brick', [125, 100, 80]),
  ];
  const shopGlass = new THREE.MeshPhysicalMaterial({ name: 'Recessed storefront glazing', color: 0x607b82,
    roughness: .21, metalness: .20, clearcoat: .45, clearcoatRoughness: .10, envMapIntensity: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xa39667, metalness: .45, roughness: .50 });
  const wood = surface('Weathered warm timber', textures.wood, .008);
  const bakedMaterials = {};
  for (const [name, material] of Object.entries(surfaceMaterials)) bakedMaterials['ground.' + name] = material;
  for (let i = 0; i < 4; i++) {
    bakedMaterials['building.masonry.' + i] = masonry[i];
    bakedMaterials['building.lowrise.' + i] = lowrise[i];
  }
  for (const [name, material] of Object.entries(facades)) bakedMaterials['building.' + name] = material;
  Object.assign(bakedMaterials, { 'detail.roof': roofMat, 'detail.concrete': concrete,
    'detail.steel': steel, 'detail.darkSteel': darkSteel, 'detail.glass': shopGlass });
  return { concrete, pavement, curb, steel, darkSteel, white, roadPaint, yellow, paintGeometry,
    roofMat, lampMat, masonry, gold, shopGlass, wood, bakedMaterials };
}
